// hoja.mjs — la hoja de trabajo de la revisión senior.
//
// El motor cubre lo determinista. Lo que necesita ojo humano no se automatiza y
// no se inventa: se lista acá para la pasada manual, con las capturas al lado.
// Es literalmente lo que la landing promete cuando dice "revisión de un
// desarrollador senior de verdad, nada automático a ciegas".

const CRITERIO = [
  ['Jerarquía', [
    'Test de los 5 segundos: en un vistazo, ¿se entiende qué es, para quién y qué gana el visitante?',
    'Cada sección tiene un solo punto focal, o compiten varios elementos por la atención',
  ]],
  ['Embudo', [
    'El CTA tiene microcopy que baja la fricción (gratis, sin cuenta, cuánto demora)',
    'Hay una sola acción primaria por pantalla, y las secundarias se ven secundarias',
    'Si hay precios, cada tarjeta permite decidir ahí mismo sin ir a buscar el formulario',
  ]],
  ['Confianza', [
    'Las cifras que aparecen tienen fuente citada, y las promesas tienen plazo concreto',
    'Se ve una persona real detrás: quién firma, de dónde es, algo verificable',
  ]],
  ['Mobile', [
    'Zona del pulgar: las acciones importantes quedan al alcance sin cambiar de mano',
    'Al apilarse en una columna, lo primero que aparece es lo que debe aparecer primero',
  ]],
  ['Accesibilidad', [
    'Nada se comunica solo con color (estados, errores, elementos activos)',
  ]],
  ['Copy', [
    'Habla de beneficio antes que de característica',
    'Está al nivel del lector objetivo, sin jerga que no se explique',
    'La misma cosa se llama igual en toda la página',
  ]],
  ['Heurísticos de Nielsen que necesitan recorrer el flujo', [
    'Coincidencia con el mundo real: usa el idioma del usuario, no el del desarrollador',
    'Control y libertad: se puede cancelar, volver y deshacer desde cualquier estado',
    'Consistencia: misma posición, color y término para la misma cosa en todo el producto',
    'Flexibilidad: hay atajos para quien ya sabe, sin estorbar a quien recién llega',
    'Recuperación de errores: los mensajes dicen qué pasó y cómo seguir, en simple',
    'Ayuda: si existe, está donde se necesita y es corta',
  ]],
];

const ETIQUETA = { critico: 'CRÍTICO', alto: 'ALTO', medio: 'MEDIO', bajo: 'BAJO', info: 'NOTA' };

/**
 * Arma la hoja en markdown.
 * @param {string} url
 * @param {Array} hallazgos los que ya encontró el motor, para no repetirlos a mano
 */
export function generarHoja(url, hallazgos = []) {
  const l = [];
  l.push(`# Revisión senior — ${url}`);
  l.push('');
  l.push('El motor ya cubrió lo medible. Esta hoja es lo que necesita ojo, con las capturas');
  l.push('`screen-mobile.png` y `screen-desktop.png` al lado. Marcar cada punto y anotar solo');
  l.push('lo que falle; lo que está bien no se escribe.');
  l.push('');

  l.push('## Ya cubierto por el motor');
  l.push('');
  if (!hallazgos.length) {
    l.push('Sin hallazgos automáticos. Toda la revisión depende de esta pasada.');
  } else {
    const porCapa = {};
    for (const h of hallazgos) (porCapa[h.capa || 'otros'] ||= []).push(h);
    for (const [capa, items] of Object.entries(porCapa)) {
      l.push(`**${capa}**`);
      for (const h of items) l.push(`- [${ETIQUETA[h.severidad] || h.severidad}] ${h.titulo}`);
      l.push('');
    }
  }
  l.push('');

  l.push('## Lo que hay que mirar a mano');
  l.push('');
  for (const [seccion, items] of CRITERIO) {
    l.push(`### ${seccion}`);
    l.push('');
    for (const item of items) l.push(`- [ ] ${item}`);
    l.push('');
  }

  l.push('## Cierre');
  l.push('');
  l.push('- [ ] Los 3 hallazgos que van al informe gratis, elegidos por impacto en conversión');
  l.push('- [ ] La recomendación única, si el cliente solo pudiera hacer una cosa');
  l.push('');
  return l.join('\n');
}

export const ITEMS_CRITERIO = CRITERIO.reduce((n, [, items]) => n + items.length, 0);
