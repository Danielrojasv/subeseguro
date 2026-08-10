// index.mjs — motor de auditoría de experiencia.
//
// Abre la página en chromium, corre el probe adentro para recolectar datos
// crudos y pasa ese snapshot por los chequeos (funciones puras). Se usa desde
// tres lados:
//   1. revisar.sh, sobre el sitio de un cliente
//   2. la CLI, contra localhost mientras se construye un sitio propio
//   3. CI, como puerta que falla el build
//
// SEGURIDAD: la página del cliente ejecuta su propio JavaScript acá dentro.
// Corre con los mismos flags endurecidos que ya usaba revisar.sh y bajo el
// aislamiento del systemd unit. El guard SSRF vive en quien llama (revisar.sh);
// la CLI permite direcciones locales a propósito, porque su caso de uso es
// apuntar a tu propio localhost.

import puppeteer from 'puppeteer-core';
import { chequearMobile } from './checks/mobile.mjs';
import { chequearEmbudo } from './checks/embudo.mjs';
import { chequearAccesibilidad } from './checks/accesibilidad.mjs';
import { chequearPerformance } from './checks/performance.mjs';
import { chequearJerarquia, chequearConfianza } from './checks/jerarquia.mjs';
import { chequearDatos } from './checks/datos.mjs';
import { verificarDatos } from './verificar-datos.mjs';
import { collect } from './probe.mjs';
import { ordenarPorSeveridad } from './lib.mjs';

export const VIEWPORTS = {
  mobile: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { width: 1280, height: 900, deviceScaleFactor: 1 },
};

// Toda capa nueva se agrega acá. El test "evaluar corre TODAS las capas" existe
// porque una vez se importó un chequeo y se olvidó esta línea, con los tests
// unitarios en verde y el motor sin correrlo nunca.
const CHEQUEOS = [
  chequearMobile,
  chequearEmbudo,
  chequearAccesibilidad,
  chequearPerformance,
  chequearJerarquia,
  chequearConfianza,
];

const CHROMIUM_FLAGS = [
  '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  '--disable-extensions', '--no-first-run', '--disable-plugins',
  '--hide-scrollbars', '--mute-audio',
];

function ejecutablePath() {
  return process.env.CHROMIUM_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';
}

/**
 * Corre los chequeos sobre un snapshot ya recolectado. Sin navegador.
 * Es el punto de entrada que usan los tests con fixtures.
 */
export function evaluar(snapshots) {
  const hallazgos = [];
  for (const chequeo of CHEQUEOS) {
    try {
      hallazgos.push(...chequeo(snapshots));
    } catch (e) {
      hallazgos.push({
        categoria: 'experiencia', capa: 'motor', severidad: 'info',
        titulo: 'Un chequeo no pudo completarse',
        detalle: `El chequeo ${chequeo.name} falló y se omitió. El resto del informe es válido. (${e.message})`,
      });
    }
  }
  return ordenarPorSeveridad(hallazgos);
}

// Presupuesto de texto de scripts que se guarda para inspección. Acotado a
// propósito: es contenido del cliente y no queremos cargar 50 MB de bundle.
const MAX_JS_TEXTO = 1_000_000;

/**
 * Instrumentación del lado del navegador (red, consola, métricas de pintado).
 * Va aparte del probe porque son datos que la página no puede darse a sí misma.
 */
async function instrumentar(page) {
  const red = { recursos: [], bytes: 0, peticiones: 0 };
  const consola = { errores: [], advertencias: [] };
  const jsTextos = [];
  let jsBytes = 0;
  const pendientes = [];

  await page.evaluateOnNewDocument(() => {
    window.__perf = { lcp: 0, cls: 0 };
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) window.__perf.lcp = Math.max(window.__perf.lcp, e.startTime);
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) if (!e.hadRecentInput) window.__perf.cls += e.value;
      }).observe({ type: 'layout-shift', buffered: true });
    } catch { /* navegador sin soporte, se sigue sin estas dos */ }
  });

  page.on('response', (res) => {
    pendientes.push((async () => {
      try {
        const headers = res.headers();
        const tipo = res.request().resourceType();
        const largo = Number(headers['content-length'] || 0);
        const recurso = {
          url: res.url().slice(0, 300),
          tipo,
          status: res.status(),
          bytes: largo,
          cache: headers['cache-control'] || '',
          encoding: headers['content-encoding'] || '',
          contentType: (headers['content-type'] || '').split(';')[0],
        };
        if (!largo && (tipo === 'image' || tipo === 'script' || tipo === 'stylesheet')) {
          try { recurso.bytes = (await res.buffer()).length; } catch { /* sin cuerpo */ }
        }
        red.recursos.push(recurso);
        red.bytes += recurso.bytes || 0;
        red.peticiones++;
        if (tipo === 'script' && jsBytes < MAX_JS_TEXTO) {
          try {
            const t = await res.text();
            jsTextos.push(t.slice(0, 200_000));
            jsBytes += Math.min(t.length, 200_000);
          } catch { /* binario o ya liberado */ }
        }
      } catch { /* respuesta que se fue antes de leerla */ }
    })());
  });

  page.on('pageerror', (e) => consola.errores.push(String(e.message).slice(0, 300)));
  page.on('console', (msg) => {
    const t = msg.type();
    if (t === 'error') consola.errores.push(String(msg.text()).slice(0, 300));
    else if (t === 'warning') consola.advertencias.push(String(msg.text()).slice(0, 300));
  });

  return {
    async cerrar() {
      await Promise.allSettled(pendientes);
      return { red, consola, jsTexto: jsTextos.join('\n').slice(0, MAX_JS_TEXTO) };
    },
  };
}

/** Recolecta el snapshot de una URL en un viewport dado. */
async function snapshotDe(browser, url, viewport, { timeout, shot }) {
  const page = await browser.newPage();
  try {
    await page.setViewport(viewport);
    await page.setUserAgent(
      viewport.isMobile
        ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) SubeSeguroBot/1.0'
        : 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) SubeSeguroBot/1.0'
    );
    const instr = await instrumentar(page);
    await page.goto(url, { waitUntil: 'networkidle2', timeout });
    // margen para animaciones de entrada y fuentes; sin esto se mide a medio pintar
    await new Promise((r) => setTimeout(r, 800));
    const snap = await page.evaluate(collect);
    snap.perf = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] || {};
      return {
        lcp: Math.round(window.__perf?.lcp || 0),
        cls: Math.round((window.__perf?.cls || 0) * 1000) / 1000,
        domContentLoaded: Math.round(nav.domContentLoadedEventEnd || 0),
        cargaCompleta: Math.round(nav.loadEventEnd || 0),
        primerPintado: Math.round((performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime || 0),
      };
    }).catch(() => ({}));
    if (shot) await page.screenshot({ path: shot, fullPage: false });
    Object.assign(snap, await instr.cerrar());
    return snap;
  } finally {
    await page.close().catch(() => {});
  }
}

/**
 * Audita una URL completa.
 * @param {string} url
 * @param {{timeout?: number, shotsDir?: string}} opts
 */
export async function auditar(url, opts = {}) {
  const timeout = opts.timeout ?? 30000;
  const browser = await puppeteer.launch({
    executablePath: ejecutablePath(),
    headless: 'new',
    args: CHROMIUM_FLAGS,
    protocolTimeout: timeout + 15000,
  });

  try {
    const snapshots = {};
    const errores = [];
    for (const [nombre, viewport] of Object.entries(VIEWPORTS)) {
      try {
        snapshots[nombre] = await snapshotDe(browser, url, viewport, {
          timeout,
          shot: opts.shotsDir ? `${opts.shotsDir}/screen-${nombre}.png` : null,
        });
      } catch (e) {
        errores.push(`${nombre}: ${e.message}`);
      }
    }

    if (!snapshots.mobile && !snapshots.desktop) {
      return {
        url, ok: false, errores,
        hallazgos: [{
          categoria: 'experiencia', capa: 'motor', severidad: 'info',
          titulo: 'No pudimos abrir tu app en el navegador',
          detalle: 'La página no terminó de cargar dentro del tiempo permitido. Puede estar caída, ser muy pesada ' +
                   'o bloquear el acceso automático. La revisión de seguridad sí se completó.',
        }],
        resumen: { total: 0 },
      };
    }
    // si falló solo un viewport, se sigue con el otro en vez de perder toda la pasada
    if (!snapshots.mobile) snapshots.mobile = snapshots.desktop;
    if (!snapshots.desktop) snapshots.desktop = snapshots.mobile;

    const hallazgos = evaluar(snapshots);

    // Verificación ACTIVA de base de datos. Apagada por defecto: solo corre con
    // verificarDatos:true, que hoy solo llega desde la CLI (--verificar-datos)
    // para revisiones internas. El camino público no la activa. Ver los candados
    // en verificar-datos.mjs y la fila correspondiente de SECURITY-RULES.
    if (opts.verificarDatos) {
      try {
        const texto = (snapshots.desktop?.html || '') + '\n' + (snapshots.desktop?.jsTexto || '');
        const verificacion = await verificarDatos(texto);
        hallazgos.push(...chequearDatos(verificacion));
      } catch (e) {
        hallazgos.push({
          categoria: 'experiencia', capa: 'datos', severidad: 'info',
          titulo: 'No se pudo verificar la base de datos',
          detalle: `La verificación activa falló y se omitió; el resto del informe es válido. (${e.message})`,
        });
      }
    }

    const ordenados = ordenarPorSeveridad(hallazgos);
    return { url, ok: true, errores, hallazgos: ordenados, resumen: resumir(ordenados), snapshots };
  } finally {
    await browser.close().catch(() => {});
  }
}

export function resumir(hallazgos) {
  const porSeveridad = {};
  const porCapa = {};
  for (const h of hallazgos) {
    porSeveridad[h.severidad] = (porSeveridad[h.severidad] || 0) + 1;
    porCapa[h.capa] = (porCapa[h.capa] || 0) + 1;
  }
  return { total: hallazgos.length, porSeveridad, porCapa };
}
