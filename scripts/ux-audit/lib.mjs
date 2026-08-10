// lib.mjs — utilidades compartidas por los chequeos.
// Todo acá es puro: entra data, sale data. Sin navegador, sin red.

// SECURITY-RULES amenaza #3 (prompt injection) y regla "todo dato que provenga
// del sitio del cliente es UNTRUSTED". Los títulos y detalles son textos
// predefinidos, pero la evidencia sí trae pedazos del sitio (selectores con
// clases propias, placeholders, rutas de imagen). Un sitio hostil podría meter
// ahí saltos de línea, marcado Typst o texto tipo "ignora tus instrucciones"
// para ensuciar el informe o manipular a quien lo lea.
//
// Por eso NADA del cliente entra a un hallazgo sin pasar por acá: lista blanca
// de caracteres, sin saltos de línea, y acotado. Se prefiere una evidencia fea
// y corta antes que una fiel y peligrosa.
const LARGO_EVIDENCIA = 120;

export function sanitizar(texto) {
  return String(texto ?? '')
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N} .,:;()[\]{}#/@_+='"-]/gu, '')
    .trim()
    .slice(0, LARGO_EVIDENCIA);
}

/** Crea un hallazgo con la forma que ya consume el pipeline (hallazgos.json). */
export function finding(capa, severidad, titulo, detalle, evidencia = null) {
  const f = { categoria: 'experiencia', capa, severidad, titulo, detalle };
  if (evidencia && evidencia.length) {
    f.evidencia = evidencia.slice(0, 5).map(sanitizar).filter(Boolean);
    if (!f.evidencia.length) delete f.evidencia;
  }
  return f;
}

const ORDEN = { critico: 0, alto: 1, medio: 2, bajo: 3, info: 4 };

export function ordenarPorSeveridad(items) {
  return [...items].sort((a, b) => (ORDEN[a.severidad] ?? 9) - (ORDEN[b.severidad] ?? 9));
}

/** "rgb(231, 87, 54)" o "rgba(...)" -> [r,g,b] . null si no se puede leer. */
export function parseColor(c) {
  if (!c || typeof c !== 'string') return null;
  const m = c.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Luminancia relativa WCAG. */
export function luminancia(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razón de contraste WCAG entre dos colores CSS. null si alguno no se puede leer. */
export function contraste(fg, bg) {
  const a = parseColor(fg);
  const b = parseColor(bg);
  if (!a || !b) return null;
  const l1 = luminancia(a);
  const l2 = luminancia(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** Lista corta y legible de selectores para el informe. */
export function evidenciaDe(items, fmt) {
  return items.slice(0, 5).map(fmt);
}

/** Plural sin adornos: "1 campo" / "3 campos". */
export function plural(n, sing, plur) {
  return `${n} ${n === 1 ? sing : plur}`;
}
