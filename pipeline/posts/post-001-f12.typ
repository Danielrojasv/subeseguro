// Post 001 — tip F12 (imagen cuadrada 1080x1080 para página FB SubeSeguro)
// Compilar: typst compile --format png --ppi 144 post-001-f12.typ post-001-f12.png
// Veta: paper #FAF6EE, ink #241F1A, coral #E75736, teal #5C8A86, Roboto sin bold.

#set page(width: 540pt, height: 540pt, margin: 0pt, fill: rgb("#FAF6EE"))
#set text(font: "Roboto", weight: "light", fill: rgb("#241F1A"))

#place(top + left, dx: 36pt, dy: 34pt)[
  #stack(dir: ltr, spacing: 10pt,
    box(image("/assets/logo.png", height: 30pt), baseline: 22%),
    text(size: 17pt, weight: "regular")[SubeSeguro]
  )
]

#place(top + left, dx: 36pt, dy: 96pt)[
  #box(width: 468pt)[
    #text(size: 31pt, weight: "regular")[¿Creaste tu app con IA?]
    #v(6pt)
    #text(size: 31pt, fill: rgb("#CC4626"), weight: "regular")[Haz esta prueba de 20 segundos.]
  ]
]

#place(top + left, dx: 36pt, dy: 218pt)[
  #box(width: 468pt, fill: rgb("#FFFFFF"), radius: 10pt, inset: 22pt, stroke: 0.8pt + rgb("#F3C9BE"))[
    #set text(size: 16.5pt)
    #stack(spacing: 13pt,
      [#text(fill: rgb("#5C8A86"))[1.] Abre tu app en Chrome],
      [#text(fill: rgb("#5C8A86"))[2.] Aprieta #text(font: "Liberation Mono", size: 15pt)[F12] y ve a la pestaña #text(font: "Liberation Mono", size: 15pt)[Network]],
      [#text(fill: rgb("#5C8A86"))[3.] Recarga la página],
      [#text(fill: rgb("#5C8A86"))[4.] Busca #text(font: "Liberation Mono", size: 15pt)["key"], #text(font: "Liberation Mono", size: 15pt)["token"] o #text(font: "Liberation Mono", size: 15pt)["secret"]]
    )
  ]
]

#place(top + left, dx: 36pt, dy: 408pt)[
  #box(width: 468pt)[
    #text(size: 16.5pt)[Si tu clave aparece ahí, #text(fill: rgb("#CC4626"))[cualquier visitante puede verla] — y usarla.]
    #v(5pt)
    #text(size: 13.5pt, fill: rgb("#6B6259"))[La IA construye tu app para que funcione, no para producción. No es culpa tuya: nadie te lo dijo.]
  ]
]

#place(bottom + left, dx: 36pt, dy: -30pt)[
  #text(size: 15pt, fill: rgb("#4A726E"), weight: "regular")[Revisión gratis en #text(fill: rgb("#CC4626"))[subeseguro.com]]
]
