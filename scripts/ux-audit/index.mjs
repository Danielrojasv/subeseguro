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
import { collect } from './probe.mjs';
import { ordenarPorSeveridad } from './lib.mjs';

export const VIEWPORTS = {
  mobile: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { width: 1280, height: 900, deviceScaleFactor: 1 },
};

const CHEQUEOS = [chequearMobile, chequearEmbudo];

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
    await page.goto(url, { waitUntil: 'networkidle2', timeout });
    // margen para animaciones de entrada y fuentes; sin esto se mide a medio pintar
    await new Promise((r) => setTimeout(r, 800));
    const snap = await page.evaluate(collect);
    if (shot) await page.screenshot({ path: shot, fullPage: false });
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
    return { url, ok: true, errores, hallazgos, resumen: resumir(hallazgos), snapshots };
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
