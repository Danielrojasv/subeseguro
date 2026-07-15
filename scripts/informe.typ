// informe.typ — genera el PDF top-3 desde hallazgos.json
// Uso: typst compile --input data=<ruta/hallazgos.json> scripts/informe.typ salida.pdf
#let coral = rgb("#E75736")
#let teal = rgb("#5C8A86")
#let ink = rgb("#241F1A")
#let muted = rgb("#8C8475")
#let paper = rgb("#FAF6EE")
#let danger = rgb("#B23A2E"); #let dangersoft = rgb("#F7E2DE")
#let amber = rgb("#B5852A"); #let ambersoft = rgb("#F6ECD6")
#let sage = rgb("#3F7A4E"); #let sagesoft = rgb("#E7F0E6")
#let wine = rgb("#3D001D")

#let sevmap = (
  critico: ("CRÍTICO", danger, dangersoft),
  alto: ("ALTO", amber, ambersoft),
  medio: ("MEDIO", teal, rgb("#E7EFEE")),
  bajo: ("BAJO", muted, rgb("#EFEAE0")),
  info: ("NOTA", sage, sagesoft),
)

#set page(margin: (x: 2.2cm, y: 2.4cm))
#set text(font: ("Roboto", "Liberation Sans"), weight: 300, size: 10.5pt, fill: ink, lang: "es")
#set par(leading: 0.65em)

#let data = json(sys.inputs.data)
#let accesible = data.at("accesible", default: true)
#let all = data.hallazgos
#let top = all.slice(0, calc.min(3, all.len()))

#let sev(key) = {
  let m = sevmap.at(key, default: ("—", muted, paper))
  box(fill: m.at(2), radius: 3pt, inset: (x: 8pt, y: 4pt),
      text(size: 8pt, fill: m.at(1), tracking: 0.08em, m.at(0)))
}

// ---- portada ----
#grid(columns: (1fr, auto),
  [
    #text(size: 22pt, weight: 300)[Informe de revisión pre-lanzamiento]
    #v(4pt)
    #text(fill: muted)[Los hallazgos más importantes — revisión inicial gratuita]
  ],
  align(right)[
    #image("../assets/logo.png", height: 36pt)
    #v(2pt)
    #text(fill: coral, size: 14pt)[SubeSeguro]
    #linebreak()
    #text(fill: muted, size: 9pt)[subeseguro.com · Veta Studios]
  ]
)
#v(6pt)
#line(length: 100%, stroke: 0.5pt + rgb("#ECE2D1"))
#v(10pt)
#text(size: 8.5pt, fill: muted, tracking: 0.1em)[APP REVISADA]
#linebreak()
#link(data.url)[#text(fill: ink)[#data.url]]
#v(14pt)

// ---- caso: no pudimos acceder a la app ----
#if not accesible [
  #block(fill: ambersoft, radius: 6pt, inset: 14pt)[
    #text(size: 13pt, fill: amber)[No pudimos acceder a tu app]
    #v(6pt)
    #text(fill: ink)[Intentamos abrir #raw(data.url) y no obtuvimos respuesta. Puede pasar por tres razones:]
    #v(4pt)
    - La URL está mal escrita (revisa que empiece con #raw("https://") y sea la correcta).
    - El sitio está caído o todavía no lo has publicado.
    - Tu app bloquea el acceso automático.
    #v(6pt)
    #text(fill: muted)[Confírmanos el link correcto respondiendo este correo y hacemos la revisión enseguida. No te preocupes: no gastaste tu revisión gratis.]
  ]
  #v(10pt)
  #align(center)[#text(size: 8.5pt, fill: muted)[SubeSeguro · un servicio de Veta Studios · Hecho en Chile para toda Latinoamérica]]
] else [

// ---- resumen ----
#let crit = all.filter(h => h.severidad == "critico").len()
#let alto = all.filter(h => h.severidad == "alto").len()
#block(fill: paper, radius: 6pt, inset: 14pt)[
  #text(size: 12pt)[Resumen]
  #v(4pt)
  #if crit > 0 [
    Encontramos #text(fill: danger)[#crit hallazgo(s) crítico(s)] que conviene arreglar #text(fill: danger)[antes] de recibir usuarios reales, además de otros puntos de mejora. Abajo están los más importantes; el detalle completo va en el informe pagado.
  ] else if alto > 0 [
    No encontramos nada crítico —buena señal—, pero sí #text(fill: amber)[#alto punto(s) de prioridad alta] que vale la pena cerrar antes de lanzar.
  ] else [
    No encontramos problemas graves en esta primera pasada. Abajo van las mejoras detectadas; el informe completo revisa más a fondo.
  ]
]
#v(12pt)

// ---- top-3 ----
#for (i, item) in top.enumerate() [
  #text(size: 14pt)[#(i + 1) · #item.titulo] #std.h(6pt) #sev(item.severidad)
  #v(5pt)
  #text(fill: muted, size: 9pt, tracking: 0.06em)[QUÉ ENCONTRAMOS]
  #linebreak()
  #item.detalle
  #v(11pt)
]

// ---- teaser del candado: lo que falta por ver ----
#let conteo = data.at("conteo", default: (total: all.len(), seguridad: all.len(), experiencia: 0))
#let restantes = conteo.total - top.len()
#let rest_seg = calc.max(0, conteo.seguridad - top.filter(h => h.categoria == "seguridad").len())
#let rest_exp = calc.max(0, conteo.experiencia - top.filter(h => h.categoria == "experiencia").len())

#if restantes > 0 [
  #block(fill: wine, radius: 6pt, inset: 14pt, width: 100%)[
    #text(fill: rgb("#F6EDF1"), size: 13pt)[🔒 Y hay #restantes hallazgo(s) más]
    #v(4pt)
    #text(fill: rgb("#E6D2DA"), size: 10pt)[
      Esta revisión gratuita encontró #conteo.total en total: #conteo.seguridad de seguridad y #conteo.experiencia de experiencia y performance. Arriba te mostramos los #top.len() más importantes. Los otros #restantes ---#rest_seg de seguridad y #rest_exp de experiencia--- van en el informe completo, cada uno con el paso a paso para arreglarlo.
    ]
  ]
  #v(10pt)
]

#line(length: 100%, stroke: 0.5pt + rgb("#ECE2D1"))
#v(8pt)
#block(fill: rgb("#E7EFEE"), radius: 6pt, inset: 12pt, width: 100%)[
  #text(size: 11pt)[¿Seguimos?]
  #v(4pt)
  #text(size: 9.5pt, fill: muted)[Informe completo con TODOS los hallazgos y cómo arreglar cada uno: US\$29. O te lo dejamos listo y seguro nosotros: desde US\$149. Responde este correo y lo vemos.]
]
#v(10pt)
#align(center)[
  #text(size: 8.5pt, fill: muted)[Revisión automática de mejores prácticas — no constituye un pentest certificado. \ SubeSeguro · un servicio de Veta Studios · Hecho en Chile para toda Latinoamérica]
]
]
