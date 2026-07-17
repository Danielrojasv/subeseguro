#import "_post.typ": *
#set page(width: 540pt, height: 540pt, margin: (x: 36pt, top: 34pt, bottom: 30pt), fill: paper)
#set text(font: "Roboto", weight: "light", fill: ink)

#post(
  titular: [Lo que tu servidor #hl[no dice], también importa.],
  lines: (
    (teal, [\$ #text(fill: cwhite)[curl -sI tu-app.com | grep -i "strict\|content-sec"]]),
    (cgray, [\# (sin resultados)]),
    (coral, [▲ MEDIO #text(fill: cwhite, size: 10.5pt)[ sin HSTS ni Content-Security-Policy]]),
  ),
  annotation: [Sin estos encabezados, tu app queda más expuesta al #hl[robo de sesión] y a que la incrusten dentro de páginas falsas.],
  sub: [Son un par de líneas en la configuración del hosting. Baratos de poner, caros de olvidar.],
)
