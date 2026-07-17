// Post 001 v2 — estilo "consola del auditor" (propuesta de estilo personal)
// Ventana de terminal con hallazgo real + anotación humana en coral.
// Compilar: typst compile --format png --ppi 144 --root .. post-001-v2-terminal.typ

#set page(width: 540pt, height: 540pt, margin: 0pt, fill: rgb("#FAF6EE"))
#set text(font: "Roboto", weight: "light", fill: rgb("#241F1A"))

// titular arriba, corto y en voz de dev
#place(top + left, dx: 36pt, dy: 38pt)[
  #box(width: 468pt)[
    #text(size: 24pt, weight: "regular")[Esto lo encontramos #text(fill: rgb("#CC4626"))[casi todas las semanas] en apps hechas con IA.]
  ]
]

// ventana de terminal
#place(top + left, dx: 36pt, dy: 128pt)[
  #box(width: 468pt, fill: rgb("#22212B"), radius: 9pt, inset: 0pt)[
    // barra de la ventana
    #box(width: 100%, inset: (x: 14pt, y: 9pt))[
      #stack(dir: ltr, spacing: 7pt,
        circle(radius: 4.5pt, fill: rgb("#E75736")),
        circle(radius: 4.5pt, fill: rgb("#D9B44A")),
        circle(radius: 4.5pt, fill: rgb("#5C8A86")),
        h(12pt),
        text(size: 10.5pt, fill: rgb("#8A8694"), font: "Liberation Mono")[revision — subeseguro]
      )
    ]
    #line(length: 100%, stroke: 0.6pt + rgb("#33323E"))
    // contenido monospace
    #box(inset: (x: 18pt, y: 14pt))[
      #set text(font: "Liberation Mono", size: 11.5pt, fill: rgb("#D8D5E0"))
      #stack(spacing: 9.5pt,
        [#text(fill: rgb("#5C8A86"))[\$] curl -s tu-app.vercel.app/static/main.js | grep SUPABASE_KEY],
        [#text(fill: rgb("#D9B44A"))[eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...]],
        [#text(fill: rgb("#8A8694"))[\# decodificado:]],
        [#text(fill: rgb("#D8D5E0"))[\{ "role": #text(fill: rgb("#E75736"))["service_role"] \}]],
        v(2pt),
        [#text(fill: rgb("#E75736"))[▲ CRITICO] #text(size: 10.5pt)[ llave maestra de la base de datos, visible para cualquiera]]
      )
    ]
  ]
]

// anotación humana
#place(top + left, dx: 36pt, dy: 330pt)[
  #box(width: 468pt)[
    #text(size: 15.5pt)[La "anon key" puede ir en el navegador. La #text(font: "Liberation Mono", size: 14pt)[service_role] #text(fill: rgb("#CC4626"))[jamás]: salta todas tus reglas de acceso — con ella se puede leer, modificar o borrar tu base completa, con 3 líneas de código.]
    #v(8pt)
    #text(size: 13.5pt, fill: rgb("#6B6259"))[La IA las confunde más de lo que crees, y la app funciona igual… hasta que alguien la encuentra. Por eso las revisamos una por una.]
  ]
]

// firma
#place(bottom + left, dx: 36pt, dy: -30pt)[
  #stack(dir: ltr, spacing: 8pt,
    box(image("/assets/logo.png", height: 20pt), baseline: 30%),
    text(size: 13.5pt, fill: rgb("#4A726E"))[¿Revisamos la tuya? Gratis en #text(fill: rgb("#CC4626"))[subeseguro.com]]
  )
]
