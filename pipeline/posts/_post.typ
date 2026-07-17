// Módulo base de la serie "el hallazgo de la semana" — SubeSeguro.
// Estilo: consola del auditor (Veta) + anotación de experto, voz en plural.
// Cada post importa esto y llama #post(...). Semilla del generador del pipeline.

#let paper    = rgb("#FAF6EE")
#let ink      = rgb("#241F1A")
#let coral    = rgb("#E75736")
#let coralink = rgb("#CC4626")
#let teal     = rgb("#5C8A86")
#let tealink  = rgb("#4A726E")
#let cyellow  = rgb("#D9B44A")
#let cgray    = rgb("#8A8694")
#let cwhite   = rgb("#D8D5E0")
#let muted    = rgb("#6B6259")

#let hl(b) = text(fill: coralink)[#b]
#let mono(b) = text(font: "Liberation Mono", size: 14pt)[#b]

// lines: array de (color, contenido-monospace)
#let post(titular: none, lines: (), annotation: none, sub: none) = {
  box(width: 100%, text(size: 24pt, weight: "regular", fill: ink, titular))

  v(18pt)
  block(width: 100%, fill: rgb("#22212B"), radius: 9pt, inset: 0pt, spacing: 0pt, {
    set block(spacing: 0pt)
    set par(spacing: 0pt, leading: 0.5em)
    box(width: 100%, inset: (x: 14pt, y: 9pt), stack(dir: ltr, spacing: 7pt,
      circle(radius: 4.5pt, fill: coral),
      circle(radius: 4.5pt, fill: cyellow),
      circle(radius: 4.5pt, fill: teal),
      h(12pt),
      text(size: 10.5pt, fill: cgray, font: "Liberation Mono")[revision — subeseguro],
    ))
    line(length: 100%, stroke: 0.6pt + rgb("#33323E"))
    box(width: 100%, inset: (x: 18pt, y: 14pt), {
      set text(font: "Liberation Mono", size: 11.5pt, fill: cwhite)
      stack(spacing: 9.5pt, ..lines.map(l => text(fill: l.at(0))[#l.at(1)]))
    })
  })

  v(16pt)
  set text(size: 15.5pt, weight: "light", fill: ink)
  block(width: 100%, annotation)
  v(7pt)
  text(size: 13pt, fill: muted)[#sub]

  v(1fr)
  stack(dir: ltr, spacing: 8pt,
    box(image("/assets/logo.png", height: 20pt), baseline: 30%),
    box(inset: (top: 4pt), text(size: 13.5pt, fill: tealink)[¿Revisamos la tuya? Gratis en #text(fill: coralink)[subeseguro.com]]),
  )
}
