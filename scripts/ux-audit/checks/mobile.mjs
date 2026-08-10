// checks/mobile.mjs — la vista real del usuario.
//
// Funciones puras sobre el snapshot del probe. El tráfico LATAM de estas apps
// llega por celular desde redes sociales, así que esta capa es la que más
// conversión mueve y la que la landing promete explícito.

import { finding, plural } from '../lib.mjs';

export const MIN_INPUT_FONT = 16;   // bajo esto iOS hace zoom al enfocar
export const MIN_TAP = 44;          // guía de Apple y WCAG 2.5.5
const H1_MAX_MOBILE = 42;           // px; sobre esto el titular se come la pantalla

/**
 * @param {{mobile: object, desktop: object}} snaps
 * @returns {Array} hallazgos
 */
export function chequearMobile(snaps) {
  const m = snaps.mobile;
  const out = [];
  if (!m) return out;

  // ---- 1. Scroll horizontal. Siempre es bug, nunca es decisión. ----
  if (m.overflow?.horizontal) {
    const culpables = (m.overflow.offenders || []).map((o) => `${o.sel} (${o.right}px)`);
    out.push(finding('mobile', 'alto', 'Tu app se corre para el lado en celular',
      `La página es más ancha que la pantalla (${m.doc.scrollWidth}px de contenido en ${m.doc.clientWidth}px de pantalla), ` +
      'así que el usuario tiene que arrastrar horizontalmente para leer. Suele ser un elemento con ancho fijo, ' +
      'una imagen sin max-width o una tabla sin contenedor con scroll propio.',
      culpables));
  }

  // ---- 2. El titular se come la pantalla ----
  const h1 = (m.headings || []).find((h) => h.tag === 'h1');
  if (h1 && h1.fontSize > H1_MAX_MOBILE) {
    out.push(finding('mobile', 'medio', 'El título principal no se achica en celular',
      `El h1 mide ${Math.round(h1.fontSize)}px en pantalla de ${m.viewport.width}px. ` +
      'Ocupa casi todo el primer pantallazo y empuja hacia abajo lo que importa. ' +
      'En pantallas bajo 640px conviene bajarlo al rango de 30 a 34px con una media query.',
      [h1.text]));
  }

  // ---- 3. Inputs bajo 16px: iOS hace zoom y descoloca el layout ----
  const chicos = (m.inputs || []).filter((i) => i.visible && i.fontSize > 0 && i.fontSize < MIN_INPUT_FONT);
  if (chicos.length) {
    out.push(finding('mobile', 'alto', 'Los campos del formulario hacen zoom en iPhone',
      `${plural(chicos.length, 'campo tiene', 'campos tienen')} letra bajo ${MIN_INPUT_FONT}px. ` +
      'Safari en iOS hace zoom automático al enfocar cualquier campo con letra más chica, ' +
      'la página se descoloca y el usuario pierde el hilo justo cuando iba a enviar. ' +
      `El arreglo es subir el font-size a ${MIN_INPUT_FONT}px, nada más.`,
      chicos.map((i) => `${i.sel} (${Math.round(i.fontSize)}px)`)));
  }

  // ---- 4. Targets táctiles ----
  // Solo se cuentan los que se presentan como botón. Un link dentro de un
  // párrafo mide lo que mide la línea y no es un target táctil.
  const chicosTap = (m.clickables || [])
    .filter((c) => c.pareceBoton && !c.enProsa)
    .filter((c) => c.rect.w > 0 && c.rect.h > 0 && c.rect.h < MIN_TAP);
  if (chicosTap.length) {
    out.push(finding('mobile', chicosTap.length >= 2 ? 'medio' : 'bajo', 'Botones difíciles de tocar con el dedo',
      `${plural(chicosTap.length, 'botón mide', 'botones miden')} menos de ${MIN_TAP}px de alto. ` +
      'Con el dedo se falla el toque o se toca el de al lado, y cada fallo es una oportunidad de abandonar. ' +
      'El padding cuenta para el tamaño, así que se arregla sin agrandar la letra.',
      chicosTap.map((c) => `${c.sel} "${c.text}" (${c.rect.h}px)`)));
  }

  // ---- 5. Teclado equivocado por campo ----
  const tecladoMal = [];
  for (const i of (m.inputs || [])) {
    if (!i.visible) continue;
    const nombre = `${i.name || i.id || i.sel}`.toLowerCase();
    const esEmail = i.type === 'email' || /mail|correo/.test(nombre);
    const esUrl = /url|link|sitio|web|repo/.test(nombre) || i.inputmode === 'url';
    const esTel = /tel|fono|phone|celular|whats/.test(nombre);

    if (esEmail && i.type !== 'email' && i.inputmode !== 'email') {
      tecladoMal.push(`${i.sel} pide correo y abre teclado normal`);
    }
    if (esEmail && !i.autocomplete) {
      tecladoMal.push(`${i.sel} sin autocomplete="email", el navegador no puede rellenarlo`);
    }
    if (esTel && i.type !== 'tel' && i.inputmode !== 'tel') {
      tecladoMal.push(`${i.sel} pide teléfono y no abre el teclado numérico`);
    }
    if ((esUrl || esEmail) && i.autocapitalize !== 'off' && i.autocapitalize !== 'none') {
      tecladoMal.push(`${i.sel} deja la autocorrección activa y ensucia lo que el usuario pega`);
    }
  }
  if (tecladoMal.length) {
    out.push(finding('mobile', 'medio', 'Los campos abren el teclado equivocado',
      'En celular cada campo debería abrir su teclado (arroba para correo, números para teléfono) y desactivar ' +
      'la autocorrección donde estorba. Se arregla con los atributos type, inputmode, autocomplete y autocapitalize. ' +
      'Es de los cambios más baratos que existen y se nota de inmediato.',
      tecladoMal));
  }

  // ---- 6. Imágenes que desbordan ----
  const desbordan = (m.images || []).filter((i) => i.overflows);
  if (desbordan.length) {
    out.push(finding('mobile', 'medio', 'Imágenes más anchas que la pantalla',
      `${plural(desbordan.length, 'imagen se sale', 'imágenes se salen')} del ancho del celular. ` +
      'Con max-width:100% y height:auto se ajustan solas y dejan de romper el layout.',
      desbordan.map((i) => `${i.sel} ${i.src}`)));
  }

  // ---- 7. Dropdowns inventados en vez del select del sistema ----
  if ((m.selects?.custom || 0) > 0 && (m.selects?.native || 0) === 0) {
    out.push(finding('mobile', 'bajo', 'Menús desplegables hechos a mano',
      'La app usa desplegables propios en vez del select nativo. En celular el select del sistema abre la rueda ' +
      'del teléfono, se maneja con una mano y es accesible por defecto. Los hechos a mano suelen quedarse ' +
      'sin teclado, sin foco y sin cierre al tocar afuera.'));
  }

  // ---- 8. theme-color (la barra del navegador) ----
  if (!m.meta?.themeColor) {
    out.push(finding('mobile', 'bajo', 'La barra del navegador queda del color por defecto',
      'Falta la etiqueta theme-color. Con una línea en el head, la barra superior del navegador móvil toma ' +
      'el color de tu app y la pantalla se ve de una pieza en vez de parchada.'));
  }

  // ---- 9. Safe areas con elementos fijos (pantallas con notch) ----
  const fijos = (m.fixed || []).filter((f) => f.position === 'fixed');
  const usaSafeArea = /safe-area-inset/.test(m.html || '');
  if (fijos.length && !usaSafeArea) {
    out.push(finding('mobile', 'bajo', 'Elementos fijos sin respetar la zona segura del iPhone',
      `Hay ${plural(fijos.length, 'elemento fijo', 'elementos fijos')} en pantalla. En iPhone con notch o barra de gestos, ` +
      'un elemento fijo abajo queda tapado por la barra del sistema. Se resuelve con env(safe-area-inset-bottom) en el padding.',
      fijos.map((f) => f.sel)));
  }

  // ---- 10. mailto y tel que mueren en el webview de Instagram ----
  const texto = (m.bodyText || '');
  const mailtoSinRespaldo = (m.links?.mailto || []).filter((l) => l.target && !texto.includes(l.target));
  if (mailtoSinRespaldo.length) {
    out.push(finding('mobile', 'alto', 'El botón de correo muere si llegan desde Instagram',
      'Hay enlaces mailto cuya dirección no aparece escrita en ninguna parte de la página. ' +
      'Cuando alguien entra desde el navegador interno de Instagram, Facebook o TikTok, el mailto no abre nada ' +
      'y la persona queda sin forma de contactarte. La solución es escribir el correo en texto visible al lado del botón, ' +
      'para que se pueda copiar.',
      mailtoSinRespaldo.map((l) => `${l.sel} -> ${l.target}`)));
  }

  return out;
}
