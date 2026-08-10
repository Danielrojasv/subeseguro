// checks/jerarquia.mjs — qué veo primero, y por qué te creería.
//
// Es la capa donde más fácil se inventan hallazgos, así que cada chequeo de acá
// exige evidencia dura. Si la señal es ambigua, no se reporta: el criterio fino
// va a la hoja de la revisión senior, no al informe automático.

import { finding, plural } from '../lib.mjs';

const TEXTO_LARGO = 120;   // caracteres desde donde el centrado empieza a cansar

export function chequearJerarquia(snaps) {
  const d = snaps.desktop || snaps.mobile;
  const out = [];
  if (!d) return out;

  // ---- 1. La marca no pesa más que la navegación ----
  const marca = d.marca;
  const nav = (d.navLinks || []).filter((l) => !l.esBoton);
  if (marca && nav.length >= 2 && !marca.tieneImagen) {
    const mayor = Math.max(...nav.map((l) => l.fontSize));
    if (marca.fontSize <= mayor) {
      out.push(finding('jerarquia', 'medio', 'La marca compite con los enlaces del menú',
        `El nombre de tu app aparece en ${Math.round(marca.fontSize)}px y los enlaces del menú en hasta ` +
        `${Math.round(mayor)}px, o sea igual o más grandes. Cuando todo pesa lo mismo, no domina nada y la ` +
        'cabecera se siente de plantilla. La marca tiene que ganar por tamaño, y los enlaces secundarios ' +
        'quedar en un gris más suave.',
        [`${marca.sel} "${marca.texto}" en ${Math.round(marca.fontSize)}px`]));
    }
  }

  // ---- 2. Escala tipográfica plana ----
  const h1 = (d.headings || []).find((h) => h.tag === 'h1');
  const cuerpo = (d.texts || []).filter((t) => t.chars > 40).map((t) => t.fontSize).sort((a, b) => a - b);
  if (h1 && cuerpo.length >= 3) {
    const mediana = cuerpo[Math.floor(cuerpo.length / 2)];
    if (mediana > 0 && h1.fontSize / mediana < 1.6) {
      out.push(finding('jerarquia', 'bajo', 'Los tamaños de letra no forman una escala',
        `El título principal mide ${Math.round(h1.fontSize)}px y el texto de cuerpo ronda los ${Math.round(mediana)}px. ` +
        'La diferencia es tan chica que el ojo no distingue qué es título y qué es contenido, y termina leyendo ' +
        'todo con el mismo peso. Una escala clara ordena la página sin agregar ni un elemento.'));
    }
  }

  // ---- 3. Más de un color de acento en lo accionable ----
  const fondos = {};
  for (const c of (d.clickables || [])) {
    if (!c.solidBg || c.enProsa) continue;
    if (/rgb\(\s*255,\s*255,\s*255\s*\)|rgb\(\s*0,\s*0,\s*0\s*\)/.test(c.bg)) continue;
    fondos[c.bg] = (fondos[c.bg] || 0) + 1;
  }
  const acentos = Object.keys(fondos);
  if (acentos.length > 2) {
    out.push(finding('jerarquia', 'bajo', 'Los botones usan varios colores distintos',
      `Hay ${acentos.length} colores de fondo distintos entre los botones. Cuando el color de acento se reparte, ` +
      'deja de significar "esto es lo importante". Conviene un solo color para la acción principal y dejar ' +
      'los demás botones con borde y fondo transparente.',
      acentos.map((c) => `${c} en ${fondos[c]} botones`)));
  }

  // ---- 4. Texto largo centrado ----
  const centrados = (d.texts || []).filter((t) => t.textAlign === 'center' && t.chars >= TEXTO_LARGO);
  if (centrados.length >= 3) {
    out.push(finding('jerarquia', 'bajo', 'Párrafos largos centrados',
      `${plural(centrados.length, 'bloque de texto largo está', 'bloques de texto largo están')} centrados. ` +
      'El ojo pierde el comienzo de cada línea y la lectura se hace lenta. Centrado sirve para titulares cortos; ' +
      'de un par de líneas en adelante conviene alinear a la izquierda.',
      centrados.map((t) => `${t.sel} "${t.sample}"`)));
  }

  return out;
}

export function chequearConfianza(snaps) {
  const d = snaps.desktop || snaps.mobile;
  const out = [];
  if (!d) return out;

  const paginas = d.paginas || {};
  const pideDatos = (d.inputs || []).some((i) => i.visible && (i.type === 'email' || /mail|correo/i.test(i.name)));
  const texto = (d.bodyText || '').toLowerCase();

  // ---- 1. Pide el correo y no dice qué hace con él ----
  // Basta con que la página diga algo sobre el destino del dato. Se prefiere
  // no reportar de más: el criterio fino sobre si la frase convence va en la
  // hoja de la revisión senior.
  const hablaDeDatos = /privacidad|privacy|spam|no compartimos|no vendemos|no se comparte|solo para (responderte|mandarte|enviarte|el informe)/.test(texto);
  if (pideDatos && !paginas.privacidad && !hablaDeDatos) {
    out.push(finding('confianza', 'medio', 'Pides el correo sin decir qué haces con él',
      'El formulario pide datos de contacto y en ninguna parte se explica qué pasa con ellos. ' +
      'Es una de las razones más comunes para cerrar la pestaña justo antes de enviar. ' +
      'Una línea al lado del botón, diciendo para qué se usa y que no va a listas, cuesta nada y se nota.'));
  }

  // ---- 2. Nadie firma ----
  if (!paginas.nosotros && !paginas.contacto && !(d.links?.mailto || []).length) {
    out.push(finding('confianza', 'medio', 'No se ve quién está detrás',
      'La página no tiene forma de saber quién hizo esto ni cómo contactarlo. Sin una cara, un nombre o al menos ' +
      'un correo visible, cualquier promesa que hagas vale menos. Es especialmente caro cuando le pides algo ' +
      'al visitante, sea plata o datos.'));
  }

  return out;
}
