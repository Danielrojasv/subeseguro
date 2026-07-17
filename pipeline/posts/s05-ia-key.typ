#import "_post.typ": *
#set page(width: 540pt, height: 540pt, margin: (x: 36pt, top: 34pt, bottom: 30pt), fill: paper)
#set text(font: "Roboto", weight: "light", fill: ink)

#post(
  titular: [Esta cuesta plata de verdad, #hl[no solo datos].],
  lines: (
    (teal, [\$ #text(fill: cwhite)[grep -r "sk-ant" build/]]),
    (cyellow, [build/assets/index.js: const KEY = "sk-ant-api03-…"]),
    (coral, [▲ CRÍTICO #text(fill: cwhite, size: 10.5pt)[ API key de IA embebida en el frontend]]),
  ),
  annotation: [Si tu llamada a la IA sale #hl[desde el navegador], la clave viaja con ella. Cualquiera la copia y hace consultas con tu tarjeta.],
  sub: [La llamada a la IA va en el backend, nunca en el cliente: el navegador le habla a tu servidor, y tu servidor a la IA.],
)
