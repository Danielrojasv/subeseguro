// Tests del motor de auditoría de experiencia.
//
// Dos niveles:
//   1. Unitarios sobre snapshots sintéticos. Rápidos, sin navegador, cubren
//      los casos borde y los falsos positivos.
//   2. Integración con chromium sobre las fixtures. Prueban que el probe
//      recolecta de verdad lo que los chequeos esperan.
//
// El nivel 2 se salta solo si no hay chromium (para no romper CI ajeno).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chequearMobile, MIN_INPUT_FONT, MIN_TAP } from '../scripts/ux-audit/checks/mobile.mjs';
import { chequearEmbudo, detectarAnalitica } from '../scripts/ux-audit/checks/embudo.mjs';
import { evaluar, resumir, auditar } from '../scripts/ux-audit/index.mjs';
import { contraste, parseColor } from '../scripts/ux-audit/lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tituloDe = (hs) => hs.map((h) => h.titulo);
const tiene = (hs, re) => hs.some((h) => re.test(h.titulo));

/** Snapshot mínimo válido; cada test lo pisa solo donde le interesa. */
function snap(over = {}) {
  return {
    viewport: { width: 390, height: 844 },
    doc: { scrollWidth: 390, clientWidth: 390, lang: 'es', title: 'x', nodes: 50 },
    overflow: { horizontal: false, offenders: [] },
    meta: { viewport: 'width=device-width', themeColor: '#fff', hasOg: true, hasFavicon: true },
    inputs: [], forms: [], clickables: [], images: [], texts: [], headings: [], fixed: [],
    links: { mailto: [], tel: [] },
    selects: { native: 0, custom: 0 },
    styles: { fontFamilies: {}, radii: {} },
    bodyText: '', html: '',
    ...over,
  };
}
const par = (over = {}) => ({ mobile: snap(over), desktop: snap(over) });

const input = (over = {}) => ({
  sel: 'input#x', tag: 'input', type: 'text', name: 'x', id: 'x',
  inputmode: '', autocomplete: '', autocapitalize: '', spellcheck: '', pattern: '',
  required: false, placeholder: '', ariaLabel: '', hasLabel: true, labelText: 'X',
  fontSize: 16, visible: true, rect: { w: 300, h: 44, top: 100, left: 0 }, ...over,
});

const boton = (over = {}) => ({
  sel: 'a.btn', tag: 'a', text: 'Enviar', href: '#', rect: { w: 200, h: 48, top: 10, left: 0 },
  fontSize: 16, bg: 'rgb(231, 87, 54)', color: 'rgb(255,255,255)', solidBg: true,
  display: 'inline-flex', enProsa: false, pareceBoton: true, inFirstViewport: true,
  borderRadius: '8px', ...over,
});

describe('mobile', () => {
  test('detecta scroll horizontal y nombra al culpable', () => {
    const hs = chequearMobile(par({
      doc: { scrollWidth: 1400, clientWidth: 390, lang: 'es', title: 'x', nodes: 10 },
      overflow: { horizontal: true, offenders: [{ sel: 'div.ancha', right: 1400, width: 1400 }] },
    }));
    assert.ok(tiene(hs, /se corre para el lado/), tituloDe(hs).join('|'));
    assert.match(hs.find((h) => /se corre/.test(h.titulo)).evidencia[0], /div\.ancha/);
  });

  test('no inventa scroll horizontal cuando la página cabe', () => {
    assert.ok(!tiene(chequearMobile(par()), /se corre para el lado/));
  });

  test(`marca inputs bajo ${MIN_INPUT_FONT}px por el zoom de iOS`, () => {
    const hs = chequearMobile(par({ inputs: [input({ fontSize: 13 })] }));
    assert.ok(tiene(hs, /zoom en iPhone/));
  });

  test(`no marca inputs de exactamente ${MIN_INPUT_FONT}px`, () => {
    const hs = chequearMobile(par({ inputs: [input({ fontSize: MIN_INPUT_FONT })] }));
    assert.ok(!tiene(hs, /zoom en iPhone/));
  });

  test('ignora inputs invisibles', () => {
    const hs = chequearMobile(par({ inputs: [input({ fontSize: 10, visible: false })] }));
    assert.ok(!tiene(hs, /zoom en iPhone/));
  });

  test(`marca botones bajo ${MIN_TAP}px`, () => {
    const hs = chequearMobile(par({ clickables: [boton({ rect: { w: 100, h: 30, top: 5, left: 0 } })] }));
    assert.ok(tiene(hs, /tocar con el dedo/));
  });

  test('NO cuenta un link dentro de un párrafo como target táctil', () => {
    const hs = chequearMobile(par({
      clickables: [boton({
        sel: 'a', text: 'parte con la gratis', solidBg: false, pareceBoton: false,
        enProsa: true, display: 'inline', rect: { w: 90, h: 16, top: 400, left: 0 },
      })],
    }));
    assert.ok(!tiene(hs, /tocar con el dedo/), 'los links en prosa no son botones');
  });

  test('detecta el teclado equivocado en un campo de correo', () => {
    const hs = chequearMobile(par({ inputs: [input({ name: 'correo', type: 'text' })] }));
    assert.ok(tiene(hs, /teclado equivocado/));
  });

  test('un campo de correo bien configurado no dispara nada', () => {
    const hs = chequearMobile(par({
      inputs: [input({ name: 'correo', type: 'email', inputmode: 'email', autocomplete: 'email', autocapitalize: 'off' })],
    }));
    assert.ok(!tiene(hs, /teclado equivocado/));
  });

  test('marca el h1 que no se achica en celular', () => {
    const hs = chequearMobile(par({ headings: [{ tag: 'h1', sel: 'h1', text: 'Hola', fontSize: 64, fontWeight: '700', textAlign: 'left', top: 0 }] }));
    assert.ok(tiene(hs, /no se achica/));
  });

  test('mailto sin el correo escrito en texto es hallazgo de webview', () => {
    const hs = chequearMobile(par({
      links: { mailto: [{ sel: 'a', target: 'hola@ejemplo.cl', text: 'escríbenos' }], tel: [] },
      bodyText: 'escríbenos por correo',
    }));
    assert.ok(tiene(hs, /Instagram/));
  });

  test('mailto con el correo visible en la página no es hallazgo', () => {
    const hs = chequearMobile(par({
      links: { mailto: [{ sel: 'a', target: 'hola@ejemplo.cl', text: 'escríbenos' }], tel: [] },
      bodyText: 'escríbenos a hola@ejemplo.cl y te respondemos',
    }));
    assert.ok(!tiene(hs, /Instagram/));
  });

  test('elemento fijo sin safe-area es hallazgo, con safe-area no', () => {
    const conFijo = { fixed: [{ sel: 'div.fijo', position: 'fixed', box: '8px|8px|0px|auto' }] };
    assert.ok(tiene(chequearMobile(par(conFijo)), /zona segura/));
    assert.ok(!tiene(chequearMobile(par({ ...conFijo, html: 'padding-bottom:env(safe-area-inset-bottom)' })), /zona segura/));
  });
});

describe('embudo', () => {
  test('type="url" es hallazgo alto porque bloquea envíos en silencio', () => {
    const hs = chequearEmbudo(par({ inputs: [input({ type: 'url' })] }));
    const h = hs.find((x) => /rechaza lo que la gente escribe/.test(x.titulo));
    assert.ok(h, tituloDe(hs).join('|'));
    assert.equal(h.severidad, 'alto');
  });

  test('campo sin label ni aria-label es hallazgo', () => {
    const hs = chequearEmbudo(par({ inputs: [input({ hasLabel: false, labelText: '', placeholder: 'Tu correo' })] }));
    assert.ok(tiene(hs, /sin etiqueta visible/));
  });

  test('aria-label cuenta como etiqueta', () => {
    const hs = chequearEmbudo(par({ inputs: [input({ hasLabel: false, ariaLabel: 'Tu correo' })] }));
    assert.ok(!tiene(hs, /sin etiqueta visible/));
  });

  test('sin analítica y con formulario, avisa que el embudo está a ciegas', () => {
    const hs = chequearEmbudo(par({ forms: [{ sel: 'form', action: '/x', method: 'post', nFields: 2, nRequired: 1, submitText: 'Enviar' }] }));
    assert.ok(tiene(hs, /dónde se te cae la gente/));
  });

  test('con analítica instalada no avisa', () => {
    const hs = chequearEmbudo(par({
      forms: [{ sel: 'form', action: '/x', method: 'post', nFields: 2, nRequired: 1, submitText: 'Enviar' }],
      html: '<script data-goatcounter="https://x.goatcounter.com/count"></script>',
    }));
    assert.ok(!tiene(hs, /dónde se te cae la gente/));
  });

  test('detectarAnalitica reconoce las herramientas comunes', () => {
    assert.deepEqual(detectarAnalitica('<script src="https://plausible.io/js/script.js">'), ['Plausible']);
    assert.deepEqual(detectarAnalitica('gtag("config")'), ['Google Analytics']);
    assert.deepEqual(detectarAnalitica('<p>nada</p>'), []);
  });

  test('opcionales sin marcar solo se reporta si hay obligatorios mezclados', () => {
    const mezcla = [input({ id: 'a', required: true, labelText: 'Correo' }), input({ id: 'b' }), input({ id: 'c' })];
    assert.ok(tiene(chequearEmbudo(par({ inputs: mezcla })), /obligatorio de lo opcional/));
    const marcados = [input({ id: 'a', required: true }), input({ id: 'b', labelText: 'Teléfono (opcional)' }), input({ id: 'c', labelText: 'Empresa (opcional)' })];
    assert.ok(!tiene(chequearEmbudo(par({ inputs: marcados })), /obligatorio de lo opcional/));
  });

  test('precio escondido detrás de un contacto', () => {
    const hs = chequearEmbudo(par({ bodyText: 'Contáctanos para el precio de tu plan' }));
    assert.ok(tiene(hs, /precio está escondido/));
  });
});

describe('motor', () => {
  test('evaluar ordena por severidad', () => {
    const hs = evaluar(par({
      inputs: [input({ type: 'url', fontSize: 13 })],
      meta: { viewport: 'x', themeColor: null, hasOg: true, hasFavicon: true },
    }));
    const orden = { critico: 0, alto: 1, medio: 2, bajo: 3, info: 4 };
    for (let i = 1; i < hs.length; i++) {
      assert.ok(orden[hs[i - 1].severidad] <= orden[hs[i].severidad], 'salió desordenado');
    }
  });

  test('un chequeo que revienta no bota la pasada completa', () => {
    const hs = evaluar({ mobile: null, desktop: null });
    assert.ok(Array.isArray(hs));
  });

  test('resumir cuenta por severidad y por capa', () => {
    const r = resumir([{ severidad: 'alto', capa: 'mobile' }, { severidad: 'alto', capa: 'formulario' }]);
    assert.equal(r.total, 2);
    assert.equal(r.porSeveridad.alto, 2);
    assert.equal(r.porCapa.mobile, 1);
  });

  test('todo hallazgo lleva la categoría que consume el pipeline', () => {
    const hs = evaluar(par({ inputs: [input({ type: 'url' })] }));
    assert.ok(hs.length > 0);
    for (const h of hs) {
      assert.equal(h.categoria, 'experiencia');
      assert.ok(h.capa && h.severidad && h.titulo && h.detalle);
      assert.ok(!h.detalle.includes('—'), 'sin rayas largas en la prosa');
    }
  });
});

describe('contraste (base de la fase 2)', () => {
  test('negro sobre blanco da 21', () => {
    assert.equal(Math.round(contraste('rgb(0,0,0)', 'rgb(255,255,255)')), 21);
  });
  test('gris claro sobre blanco no pasa AA', () => {
    assert.ok(contraste('rgb(170,170,170)', 'rgb(255,255,255)') < 4.5);
  });
  test('parseColor tolera rgba y devuelve null con basura', () => {
    assert.deepEqual(parseColor('rgba(231, 87, 54, 0.5)'), [231, 87, 54]);
    assert.equal(parseColor('chao'), null);
  });
});

// ---------------------------------------------------------------------------
// Integración: chromium de verdad sobre las fixtures.
// ---------------------------------------------------------------------------
const hayChromium = existsSync(process.env.CHROMIUM_PATH || '/usr/bin/chromium');

describe('integración con chromium', { skip: hayChromium ? false : 'sin chromium instalado' }, () => {
  let server, base;

  const levantar = () => new Promise((resolve) => {
    server = createServer(async (req, res) => {
      const archivo = join(root, 'test/fixtures', decodeURIComponent(req.url.split('?')[0]));
      try {
        const body = await readFile(archivo);
        res.writeHead(200, { 'content-type': extname(archivo) === '.html' ? 'text/html; charset=utf-8' : 'text/plain' });
        res.end(body);
      } catch {
        res.writeHead(404); res.end('no');
      }
    }).listen(0, '127.0.0.1', () => {
      base = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });

  test('la fixture rota dispara los hallazgos esperados', async (t) => {
    t.diagnostic('levantando chromium, puede demorar');
    await levantar();
    try {
      const res = await auditar(`${base}/rota.html`, { timeout: 20000 });
      assert.ok(res.ok, JSON.stringify(res.errores));
      const t_ = tituloDe(res.hallazgos);
      assert.ok(tiene(res.hallazgos, /se corre para el lado/), t_.join(' | '));
      assert.ok(tiene(res.hallazgos, /zoom en iPhone/), t_.join(' | '));
      assert.ok(tiene(res.hallazgos, /no se achica/), t_.join(' | '));
      assert.ok(tiene(res.hallazgos, /rechaza lo que la gente escribe/), t_.join(' | '));
      assert.ok(tiene(res.hallazgos, /sin etiqueta visible/), t_.join(' | '));
      assert.ok(tiene(res.hallazgos, /Instagram/), t_.join(' | '));
      assert.ok(tiene(res.hallazgos, /barra del navegador/), t_.join(' | '));
      assert.ok(tiene(res.hallazgos, /zona segura/), t_.join(' | '));
      assert.ok(tiene(res.hallazgos, /dónde se te cae la gente/), t_.join(' | '));
    } finally {
      server.close();
    }
  });

  test('la fixture limpia pasa sin hallazgos', async () => {
    await levantar();
    try {
      const res = await auditar(`${base}/limpia.html`, { timeout: 20000 });
      assert.ok(res.ok, JSON.stringify(res.errores));
      assert.deepEqual(tituloDe(res.hallazgos), [], 'la página de referencia no debe tener hallazgos');
    } finally {
      server.close();
    }
  });
});
