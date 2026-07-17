#import "_post.typ": *
#set page(width: 540pt, height: 540pt, margin: (x: 36pt, top: 34pt, bottom: 30pt), fill: paper)
#set text(font: "Roboto", weight: "light", fill: ink)

#post(
  titular: [Tu login puede aguantar #hl[mil intentos por minuto]. ¿Lo sabías?],
  lines: (
    (teal, [\$ #text(fill: cwhite)[for i in \{1..1000\}; do curl -X POST …/login; done]]),
    (cwhite, [200  200  200  200  200  200  200  200  …]),
    (cgray, [\# 1000 intentos, ningún bloqueo]),
    (coral, [▲ ALTO #text(fill: cwhite, size: 10.5pt)[ login sin límite de intentos]]),
  ),
  annotation: [Sin un freno, un bot puede probar #hl[millones de contraseñas] hasta entrar. Es la puerta más barata de forzar en cualquier app.],
  sub: [Un límite por IP, o un captcha después de varios intentos fallidos, lo corta de raíz.],
)
