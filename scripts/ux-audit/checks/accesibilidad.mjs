// checks/accesibilidad.mjs — los mínimos no negociables.
//
// El contraste es el que ningún scanner de la competencia entrega, y es de los
// que más se rompen en apps generadas: los temas oscuros salen con texto gris
// medio que no pasa AA. Se calcula con los colores computados de verdad, no
// leyendo el CSS, porque el color efectivo depende de qué hereda cada bloque.

import { finding, contraste, plural } from '../lib.mjs';

export const AA_NORMAL = 4.5;
export const AA_GRANDE = 3.0;

/** WCAG llama "texto grande" a 24px, o 18.66px si viene en negrita. */
export function esTextoGrande(fontSize, fontWeight) {
  const peso = Number(fontWeight) || (fontWeight === 'bold' ? 700 : 400);
  return fontSize >= 24 || (fontSize >= 18.66 && peso >= 700);
}

export function umbralDe(t) {
  return esTextoGrande(t.fontSize, t.fontWeight) ? AA_GRANDE : AA_NORMAL;
}

/** Bloques de texto que no alcanzan el mínimo de contraste. */
export function textosBajoUmbral(texts = []) {
  const malos = [];
  for (const t of texts) {
    if (!t.sample || t.chars < 4) continue;
    const ratio = contraste(t.color, t.bg);
    if (ratio === null) continue;
    const umbral = umbralDe(t);
    if (ratio < umbral) malos.push({ ...t, ratio: Math.round(ratio * 100) / 100, umbral });
  }
  return malos.sort((a, b) => a.ratio - b.ratio);
}

export function chequearAccesibilidad(snaps) {
  const d = snaps.desktop || snaps.mobile;
  const m = snaps.mobile || snaps.desktop;
  const out = [];
  if (!d) return out;

  // ---- 1. Contraste ----
  const malos = textosBajoUmbral(d.texts);
  if (malos.length) {
    const peor = malos[0];
    const graves = malos.filter((t) => t.ratio < 3);
    out.push(finding('accesibilidad', graves.length ? 'alto' : 'medio', 'Texto que cuesta leer por poco contraste',
      `${plural(malos.length, 'bloque de texto no alcanza', 'bloques de texto no alcanzan')} el mínimo de contraste ` +
      `del estándar de accesibilidad. El peor va en ${peor.ratio} a 1 cuando necesita ${peor.umbral} a 1. ` +
      'Se nota sobre todo en pantallas con brillo bajo, al sol, y en cualquier persona sobre 40 años. ' +
      'Casi siempre es texto secundario en gris claro, y se arregla oscureciendo ese gris.',
      malos.map((t) => `${t.sel} "${t.sample}" (${t.ratio}:1, necesita ${t.umbral}:1)`)));
  }

  // ---- 2. Foco invisible al navegar con teclado ----
  const css = d.styles?.cssText || '';
  const quitaOutline = /outline\s*:\s*(none|0)/i.test(css);
  const reponeFoco = /:focus-visible/i.test(css) || /:focus[^-]/i.test(css) && /outline\s*:\s*[^n0]/i.test(css);
  if (quitaOutline && !reponeFoco) {
    out.push(finding('accesibilidad', 'medio', 'No se ve dónde estás al navegar con el teclado',
      'El CSS quita el borde de foco (outline none) y no lo repone. Quien navega con Tab, por costumbre o por ' +
      'necesidad, queda sin saber en qué botón está parado. Se arregla con una regla :focus-visible que dibuje ' +
      'un contorno propio, sin volver al de fábrica.'));
  }

  // ---- 3. Imágenes sin alt ----
  const sinAlt = (d.images || []).filter((i) => !i.hasAltAttr && i.rectW > 24 && i.rectH > 24);
  if (sinAlt.length) {
    out.push(finding('accesibilidad', 'bajo', 'Imágenes sin descripción',
      `${plural(sinAlt.length, 'imagen no tiene', 'imágenes no tienen')} atributo alt. Un lector de pantalla lee ` +
      'el nombre del archivo, y si la imagen no carga no queda nada en su lugar. Las decorativas llevan alt vacío ' +
      'a propósito, las que dicen algo llevan la descripción.',
      sinAlt.map((i) => `${i.sel} ${i.src}`)));
  }

  // ---- 4. Controles sin nombre accesible (los botones de solo ícono) ----
  const sinNombre = d.sinNombre || [];
  if (sinNombre.length) {
    out.push(finding('accesibilidad', 'medio', 'Botones que no dicen qué hacen',
      `${plural(sinNombre.length, 'control no tiene', 'controles no tienen')} ningún texto ni etiqueta. ` +
      'Suelen ser botones de solo ícono. Para un lector de pantalla son "botón" a secas, sin más información. ' +
      'Se arregla con aria-label describiendo la acción.',
      sinNombre.map((s) => `${s.sel} ${s.html}`)));
  }

  // ---- 5. Anclas internas que saltan sin aviso ----
  if ((m.anclas || 0) >= 2) {
    const css2 = m.styles?.cssText || '';
    if (!/scroll-behavior\s*:\s*smooth/i.test(css2)) {
      out.push(finding('accesibilidad', 'bajo', 'Los enlaces internos saltan de golpe',
        'La página tiene enlaces que llevan a otra sección y el salto es instantáneo, sin recorrido. ' +
        'La persona pierde la referencia de dónde quedó. Con scroll-behavior smooth y scroll-margin-top en las ' +
        'secciones, el salto se entiende.'));
    }
  }

  // ---- 6. Jerarquía de encabezados rota ----
  const niveles = (d.headings || []).map((h) => Number(h.tag.slice(1)));
  if (niveles.length) {
    if (!niveles.includes(1)) {
      out.push(finding('accesibilidad', 'bajo', 'La página no tiene título principal',
        'No hay ningún h1. Los lectores de pantalla y los buscadores usan ese encabezado para entender de qué ' +
        'trata la página. Debe haber uno, y uno solo.'));
    }
    const saltos = [];
    for (let i = 1; i < niveles.length; i++) {
      if (niveles[i] - niveles[i - 1] > 1) saltos.push(`h${niveles[i - 1]} seguido de h${niveles[i]}`);
    }
    if (saltos.length) {
      out.push(finding('accesibilidad', 'bajo', 'Los encabezados saltan niveles',
        'La página pasa de un nivel de encabezado a otro sin respetar el orden. Suele venir de elegir el ' +
        'encabezado por su tamaño de letra en vez de por su nivel. Para quien navega por estructura, el índice ' +
        'de la página queda con hoyos.',
        saltos));
    }
  }

  return out;
}
