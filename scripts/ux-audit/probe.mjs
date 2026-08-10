// probe.mjs — el recolector que corre DENTRO de la página.
//
// Regla de oro de este módulo: SOLO MIDE, NO JUZGA. Devuelve datos crudos y
// serializables; toda la interpretación vive en checks/*.mjs como funciones
// puras. Esa separación es la que permite testear los chequeos sin levantar un
// navegador (fixtures de snapshot) y agregar chequeos nuevos sin tocar esto.
//
// La función se serializa con toString() y se evalúa en el contexto de la
// página, así que NO puede cerrar sobre nada del scope de Node.

export function collect() {
  const MAX_NODES = 4000; // tope anti sitio gigante
  const trunc = (s, n) => (typeof s === 'string' ? s.trim().slice(0, n) : '');

  // ---- selector corto y legible para poder señalar el elemento en el informe ----
  const sel = (el) => {
    if (!el || !el.tagName) return '?';
    let s = el.tagName.toLowerCase();
    if (el.id) return s + '#' + el.id;
    const cls = (el.getAttribute && el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean);
    if (cls.length) s += '.' + cls.slice(0, 2).join('.');
    return s.slice(0, 80);
  };

  const px = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };

  const rectOf = (el) => {
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top + window.scrollY), left: Math.round(r.left) };
  };

  const visible = (el, cs) => {
    if (cs.display === 'none' || cs.visibility === 'hidden' || px(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  // color de fondo efectivo: sube por los ancestros hasta encontrar uno opaco.
  // Sin esto, todo texto sobre fondo heredado se leería como "transparente" y
  // el cálculo de contraste daría cualquier cosa.
  const bgOf = (el) => {
    let node = el;
    while (node && node.nodeType === 1) {
      const c = getComputedStyle(node).backgroundColor;
      if (c && c !== 'transparent' && !/rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(c)) return c;
      node = node.parentElement;
    }
    return 'rgb(255, 255, 255)';
  };

  const all = Array.from(document.querySelectorAll('*')).slice(0, MAX_NODES);

  // ---- documento y desborde horizontal ----
  const de = document.documentElement;
  const clientW = de.clientWidth;
  const offenders = [];
  for (const el of all) {
    try {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const right = r.right + window.scrollX;
      if (right > clientW + 1) offenders.push({ sel: sel(el), right: Math.round(right), width: Math.round(r.width) });
    } catch { /* elemento raro, se ignora */ }
  }
  offenders.sort((a, b) => b.right - a.right);

  // ---- inputs y labels ----
  const labelFor = new Map();
  for (const l of document.querySelectorAll('label[for]')) labelFor.set(l.getAttribute('for'), trunc(l.textContent, 80));

  const inputs = [];
  for (const el of document.querySelectorAll('input, select, textarea')) {
    try {
      const cs = getComputedStyle(el);
      const type = (el.getAttribute('type') || (el.tagName === 'INPUT' ? 'text' : el.tagName.toLowerCase())).toLowerCase();
      if (type === 'hidden') continue;
      const wrapped = el.closest('label');
      const id = el.id || '';
      inputs.push({
        sel: sel(el), tag: el.tagName.toLowerCase(), type,
        name: el.getAttribute('name') || '', id,
        inputmode: el.getAttribute('inputmode') || '',
        autocomplete: el.getAttribute('autocomplete') || '',
        autocapitalize: el.getAttribute('autocapitalize') || '',
        spellcheck: el.getAttribute('spellcheck') || '',
        pattern: el.getAttribute('pattern') || '',
        required: el.hasAttribute('required'),
        placeholder: trunc(el.getAttribute('placeholder'), 60),
        ariaLabel: trunc(el.getAttribute('aria-label'), 60),
        hasLabel: Boolean((id && labelFor.has(id)) || wrapped),
        labelText: (id && labelFor.get(id)) || (wrapped ? trunc(wrapped.textContent, 80) : ''),
        fontSize: px(cs.fontSize),
        visible: visible(el, cs),
        rect: rectOf(el),
      });
    } catch { /* noop */ }
  }

  // ---- formularios ----
  const forms = Array.from(document.querySelectorAll('form')).map((f) => {
    const submit = f.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
    return {
      sel: sel(f),
      action: trunc(f.getAttribute('action'), 200),
      method: (f.getAttribute('method') || 'get').toLowerCase(),
      nFields: f.querySelectorAll('input:not([type="hidden"]), select, textarea').length,
      nRequired: f.querySelectorAll('[required]').length,
      submitText: trunc(submit ? submit.textContent || submit.value : '', 60),
      hasSubmitListener: Boolean(f.dataset.__hasSubmit),
    };
  });

  // ---- elementos clickeables (targets táctiles, CTA) ----
  const clickables = [];
  for (const el of document.querySelectorAll('a[href], button, [role="button"], input[type="submit"], input[type="button"]')) {
    try {
      const cs = getComputedStyle(el);
      if (!visible(el, cs)) continue;
      const r = rectOf(el);
      const bg = cs.backgroundColor;
      const solid = bg && bg !== 'transparent' && !/rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\s*\)/.test(bg);
      // Un link dentro de un párrafo no es un target táctil, es texto. Sin esta
      // distinción, cualquier página con prosa enlazada dispara falsos positivos.
      const padre = el.parentElement;
      const hermanosTexto = padre
        ? Array.from(padre.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim().length > 2)
        : false;
      const enProsa = cs.display.startsWith('inline') && hermanosTexto;
      clickables.push({
        sel: sel(el), tag: el.tagName.toLowerCase(),
        text: trunc(el.textContent || el.value, 60),
        href: trunc(el.getAttribute('href'), 200),
        rect: r,
        fontSize: px(cs.fontSize),
        bg, color: cs.color,
        solidBg: solid,
        display: cs.display,
        enProsa,
        pareceBoton: el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' ||
                     /(^|[\s-])(btn|button|cta)([\s-]|$)/i.test(el.getAttribute('class') || '') ||
                     (solid && !enProsa),
        inFirstViewport: r.top < window.innerHeight,
        borderRadius: cs.borderRadius,
      });
    } catch { /* noop */ }
  }

  // ---- imágenes ----
  const images = Array.from(document.querySelectorAll('img')).slice(0, 200).map((el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      sel: sel(el),
      src: trunc(el.getAttribute('src'), 160),
      alt: el.getAttribute('alt'),
      hasAltAttr: el.hasAttribute('alt'),
      naturalW: el.naturalWidth || 0, naturalH: el.naturalHeight || 0,
      rectW: Math.round(r.width), rectH: Math.round(r.height),
      maxWidth: cs.maxWidth,
      loading: el.getAttribute('loading') || '',
      overflows: r.right + window.scrollX > clientW + 1,
    };
  });

  // ---- bloques de texto (base para contraste y escala tipográfica) ----
  const texts = [];
  const seenText = new Set();
  for (const el of all) {
    try {
      const own = Array.from(el.childNodes).filter((n) => n.nodeType === 3 && n.textContent.trim().length > 2);
      if (!own.length) continue;
      const cs = getComputedStyle(el);
      if (!visible(el, cs)) continue;
      const sample = trunc(own.map((n) => n.textContent).join(' '), 60);
      const key = sel(el) + '|' + cs.fontSize + '|' + cs.color;
      if (seenText.has(key)) continue;
      seenText.add(key);
      texts.push({
        sel: sel(el), sample,
        fontSize: px(cs.fontSize), fontWeight: cs.fontWeight,
        color: cs.color, bg: bgOf(el),
        textAlign: cs.textAlign,
        chars: sample.length,
      });
      if (texts.length >= 400) break;
    } catch { /* noop */ }
  }

  // ---- encabezados ----
  const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).slice(0, 100).map((el) => {
    const cs = getComputedStyle(el);
    return {
      tag: el.tagName.toLowerCase(), sel: sel(el),
      text: trunc(el.textContent, 100),
      fontSize: px(cs.fontSize), fontWeight: cs.fontWeight,
      textAlign: cs.textAlign,
      top: Math.round(el.getBoundingClientRect().top + window.scrollY),
    };
  });

  // ---- elementos fijos (safe areas en pantallas con notch) ----
  const fixed = [];
  for (const el of all) {
    try {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
      if (!visible(el, cs)) continue;
      const pad = cs.paddingBottom + '|' + cs.paddingTop + '|' + cs.bottom + '|' + cs.top;
      fixed.push({ sel: sel(el), position: cs.position, box: pad });
    } catch { /* noop */ }
  }

  // ---- meta y head ----
  const metaOf = (n) => {
    const m = document.querySelector(`meta[name="${n}"]`);
    return m ? trunc(m.getAttribute('content'), 200) : null;
  };

  // ---- enlaces que mueren en webviews de redes sociales ----
  const mailto = [];
  const tel = [];
  for (const a of document.querySelectorAll('a[href^="mailto:"], a[href^="tel:"]')) {
    const h = a.getAttribute('href');
    (h.startsWith('mailto:') ? mailto : tel).push({
      sel: sel(a),
      target: trunc(decodeURIComponent(h.split(':')[1].split('?')[0]), 120),
      text: trunc(a.textContent, 60),
    });
  }

  // ---- selects nativos vs dropdowns inventados ----
  const customListbox = document.querySelectorAll('[role="listbox"], [role="combobox"]:not(select)').length;

  // ---- señales de estilo (base de la huella IA y de la escala tipográfica) ----
  const fontFamilies = {};
  const radii = {};
  for (const el of all) {
    try {
      const cs = getComputedStyle(el);
      const ff = (cs.fontFamily || '').split(',')[0].replace(/["']/g, '').trim();
      if (ff) fontFamilies[ff] = (fontFamilies[ff] || 0) + 1;
      const br = cs.borderTopLeftRadius;
      if (br && br !== '0px') radii[br] = (radii[br] || 0) + 1;
    } catch { /* noop */ }
  }

  // ---- texto de las hojas de estilo ----
  // Las reglas que importan para accesibilidad (outline:none, :focus-visible,
  // scroll-behavior) suelen vivir en un CSS externo, no en el HTML. Las hojas
  // de otro origen tiran SecurityError al leer cssRules y se saltan.
  let cssText = '';
  let cssBloqueadas = 0;
  for (const hoja of Array.from(document.styleSheets)) {
    try {
      for (const regla of Array.from(hoja.cssRules)) {
        cssText += regla.cssText + '\n';
        if (cssText.length > 300000) break;
      }
    } catch {
      cssBloqueadas++;
    }
    if (cssText.length > 300000) break;
  }

  // ---- nombre accesible de los controles (botones de solo ícono) ----
  const sinNombre = [];
  for (const el of document.querySelectorAll('button, a[href], [role="button"]')) {
    try {
      const cs = getComputedStyle(el);
      if (!visible(el, cs)) continue;
      const txt = (el.textContent || '').trim();
      const aria = el.getAttribute('aria-label') || el.getAttribute('title') || '';
      const img = el.querySelector('img[alt]:not([alt=""])');
      if (!txt && !aria && !img) sinNombre.push({ sel: sel(el), html: trunc(el.innerHTML, 60) });
    } catch { /* noop */ }
  }

  // ---- cabecera: marca contra navegación ----
  // La regla es que la marca pese más que los links. Cuando compiten al mismo
  // tamaño y color, no domina nada y la página se siente de plantilla.
  let marca = null;
  const navLinks = [];
  const cabecera = document.querySelector('header, [role="banner"]');
  if (cabecera) {
    const links = Array.from(cabecera.querySelectorAll('a[href]'));
    const primero = links[0];
    if (primero) {
      const cs = getComputedStyle(primero);
      marca = {
        sel: sel(primero), texto: trunc(primero.textContent, 40),
        fontSize: px(cs.fontSize), fontWeight: cs.fontWeight, color: cs.color,
        tieneImagen: Boolean(primero.querySelector('img, svg')),
      };
    }
    const nav = cabecera.querySelector('nav') || cabecera;
    for (const a of Array.from(nav.querySelectorAll('a[href]')).slice(0, 12)) {
      if (a === primero) continue;
      const cs = getComputedStyle(a);
      if (!visible(a, cs)) continue;
      navLinks.push({
        sel: sel(a), texto: trunc(a.textContent, 30),
        fontSize: px(cs.fontSize), fontWeight: cs.fontWeight, color: cs.color,
        esBoton: cs.backgroundColor !== 'transparent' && !/rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\s*\)/.test(cs.backgroundColor),
      });
    }
  }

  // ---- páginas de respaldo (quién está detrás, qué pasa con mis datos) ----
  const paginas = { nosotros: false, contacto: false, privacidad: false, terminos: false };
  for (const a of document.querySelectorAll('a[href]')) {
    const t = ((a.getAttribute('href') || '') + ' ' + (a.textContent || '')).toLowerCase();
    if (/about|nosotros|qui[eé]nes|equipo|team/.test(t)) paginas.nosotros = true;
    if (/contacto|contact|escr[ií]benos/.test(t)) paginas.contacto = true;
    if (/privacidad|privacy/.test(t)) paginas.privacidad = true;
    if (/t[eé]rminos|terms|condiciones/.test(t)) paginas.terminos = true;
  }

  const bodyCs = getComputedStyle(document.body);

  return {
    collectedAt: 'in-page',
    viewport: { width: window.innerWidth, height: window.innerHeight },
    doc: {
      scrollWidth: de.scrollWidth,
      clientWidth: clientW,
      lang: de.getAttribute('lang') || '',
      title: trunc(document.title, 200),
      bodyBg: bodyCs.backgroundColor,
      nodes: document.querySelectorAll('*').length,
    },
    overflow: { horizontal: de.scrollWidth > clientW + 1, offenders: offenders.slice(0, 10) },
    meta: {
      viewport: (document.querySelector('meta[name="viewport"]') || {}).content || null,
      themeColor: metaOf('theme-color'),
      description: metaOf('description'),
      hasOg: Boolean(document.querySelector('meta[property^="og:"]')),
      hasFavicon: Boolean(document.querySelector('link[rel~="icon"]')),
    },
    inputs, forms, clickables, images, texts, headings, fixed, sinNombre,
    marca, navLinks, paginas,
    links: { mailto, tel },
    anclas: document.querySelectorAll('a[href^="#"]:not([href="#"])').length,
    selects: { native: document.querySelectorAll('select').length, custom: customListbox },
    styles: { fontFamilies, radii, cssText, cssBloqueadas },
    bodyText: trunc(document.body.innerText, 20000),
    html: trunc(document.documentElement.outerHTML, 400000),
  };
}
