// checks/embudo.mjs — formularios, llamados a la acción y medición.
//
// Acá viven los hallazgos que se llevan leads en silencio. El más caro de todos
// (type="url" bloqueando envíos sin https://) le pasó a la propia landing de
// SubeSeguro el 26-jul-2026 con tráfico pagado encima.

import { finding, plural } from '../lib.mjs';

const ANALITICAS = [
  ['goatcounter', 'GoatCounter'],
  ['plausible.io', 'Plausible'],
  ['umami', 'Umami'],
  ['googletagmanager|gtag\\(|google-analytics', 'Google Analytics'],
  ['posthog', 'PostHog'],
  ['matomo|piwik', 'Matomo'],
  ['usefathom|fathom', 'Fathom'],
  ['simpleanalytics', 'Simple Analytics'],
  ['clarity\\.ms', 'Microsoft Clarity'],
  ['hotjar', 'Hotjar'],
  ['vercel.*insights|_vercel/insights', 'Vercel Analytics'],
  ['cloudflareinsights', 'Cloudflare Analytics'],
];

export function detectarAnalitica(html) {
  const encontradas = [];
  for (const [re, nombre] of ANALITICAS) {
    if (new RegExp(re, 'i').test(html || '')) encontradas.push(nombre);
  }
  return encontradas;
}

export function chequearEmbudo(snaps) {
  const m = snaps.mobile;
  const d = snaps.desktop || snaps.mobile;
  const out = [];
  if (!m) return out;

  const inputs = (m.inputs || []).filter((i) => i.visible);

  // ---- 1. Campos sin label visible ----
  const sinLabel = inputs.filter((i) => !i.hasLabel && !i.ariaLabel);
  if (sinLabel.length) {
    const soloPlaceholder = sinLabel.filter((i) => i.placeholder);
    out.push(finding('formulario', 'alto', 'Campos sin etiqueta visible',
      `${plural(sinLabel.length, 'campo no tiene', 'campos no tienen')} una etiqueta asociada. ` +
      (soloPlaceholder.length
        ? 'Varios se apoyan solo en el texto gris de adentro, que desaparece apenas la persona empieza a escribir. ' +
          'A la mitad del formulario ya nadie recuerda qué iba en cada casilla. '
        : '') +
      'Una etiqueta con for e id encima del campo lo arregla, y de paso lo hace legible para lectores de pantalla.',
      sinLabel.map((i) => `${i.sel}${i.placeholder ? ` (placeholder "${i.placeholder}")` : ''}`)));
  }

  // ---- 2. Validación que bloquea envíos en silencio ----
  const urlDuros = inputs.filter((i) => i.type === 'url');
  if (urlDuros.length) {
    out.push(finding('formulario', 'alto', 'El campo de dirección web rechaza lo que la gente escribe',
      'Un campo con type="url" exige que la dirección empiece con https:// y, si no, el navegador bloquea el envío ' +
      'con un mensaje críptico. En celular nadie escribe el https:// a mano. El resultado es una persona que ' +
      'llena todo, aprieta enviar y no pasa nada. Conviene dejarlo como texto con inputmode="url" y completar ' +
      'el esquema con una línea de JavaScript al enviar.',
      urlDuros.map((i) => `${i.sel} type="url"`)));
  }

  const conPattern = inputs.filter((i) => i.pattern);
  if (conPattern.length) {
    out.push(finding('formulario', 'medio', 'Reglas de validación estrictas sin explicación',
      `${plural(conPattern.length, 'campo usa', 'campos usan')} un patrón de validación propio. ` +
      'Cuando el patrón rechaza algo, el navegador muestra un mensaje genérico que no dice qué se esperaba. ' +
      'Conviene aflojar el patrón o acompañarlo con un texto de ayuda que diga el formato esperado.',
      conPattern.map((i) => `${i.sel} pattern="${i.pattern}"`)));
  }

  // ---- 3. Opcionales sin marcar ----
  const opcionales = inputs.filter((i) => !i.required && i.hasLabel);
  const marcados = opcionales.filter((i) => /opcional|optional/i.test(i.labelText));
  if (opcionales.length >= 2 && marcados.length === 0 && inputs.some((i) => i.required)) {
    out.push(finding('formulario', 'bajo', 'No se distingue lo obligatorio de lo opcional',
      `El formulario mezcla campos obligatorios y opcionales sin marcar cuáles son cuáles. ` +
      'La persona asume que todo es obligatorio y abandona en el primer dato que no quiere entregar. ' +
      'Basta con agregar "(opcional)" a la etiqueta de los que no son necesarios.',
      opcionales.map((i) => i.sel)));
  }

  // ---- 4. Sin analítica: el embudo queda a ciegas ----
  const analiticas = detectarAnalitica(m.html || '');
  if (!analiticas.length && (m.forms || []).length > 0) {
    out.push(finding('formulario', 'medio', 'No hay forma de saber dónde se te cae la gente',
      'La app no tiene ninguna herramienta de medición instalada. Sin eso no se puede distinguir entre ' +
      '"no llega nadie", "llegan y no bajan" y "bajan y no envían el formulario", que son tres problemas ' +
      'distintos con arreglos distintos. GoatCounter o Plausible se instalan con una línea en el head ' +
      'y no piden banner de cookies.'));
  }

  // ---- 5. Acción principal fuera del primer pantallazo ----
  const ctaMobile = (m.clickables || []).filter((c) => c.inFirstViewport && c.solidBg && c.text.length > 1);
  const ctaDesktop = (d.clickables || []).filter((c) => c.inFirstViewport && c.solidBg && c.text.length > 1);
  if ((m.clickables || []).length > 3 && !ctaMobile.length && !ctaDesktop.length) {
    out.push(finding('formulario', 'medio', 'No hay una acción clara en el primer pantallazo',
      'Al abrir la app no aparece ningún botón destacado que diga qué hacer. El visitante tiene que scrollear ' +
      'para encontrar el camino, y la mayoría no lo hace. Conviene un solo botón con fondo sólido, arriba, ' +
      'con el verbo de la acción principal.'));
  }

  // ---- 6. Precio escondido ----
  const texto = (m.bodyText || '').toLowerCase();
  if (/cont[aá]ctanos para (el )?precio|solicita (una )?cotizaci[oó]n|precio a convenir|contact us for pricing/.test(texto)) {
    out.push(finding('formulario', 'bajo', 'El precio está escondido detrás de un contacto',
      'Pedir que te escriban para saber el precio filtra a casi todo el mundo, sobre todo en productos de ticket bajo. ' +
      'Mostrar un rango, o el precio de partida, convierte más que el misterio.'));
  }

  return out;
}
