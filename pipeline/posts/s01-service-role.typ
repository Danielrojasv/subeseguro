#import "_post.typ": *
#set page(width: 540pt, height: 540pt, margin: (x: 36pt, top: 34pt, bottom: 30pt), fill: paper)
#set text(font: "Roboto", weight: "light", fill: ink)

#post(
  titular: [Esto lo encontramos #hl[casi todas las semanas] en apps hechas con IA.],
  lines: (
    (teal, [\$ #text(fill: cwhite)[curl -s tu-app.vercel.app/static/main.js | grep SUPABASE_KEY]]),
    (cyellow, [eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…]),
    (cgray, [\# decodificado]),
    (cwhite, [\{ "role": #text(fill: coral)["service_role"] \}]),
    (coral, [▲ CRÍTICO #text(fill: cwhite, size: 10.5pt)[ llave maestra de la base de datos, visible para cualquiera]]),
  ),
  annotation: [La "anon key" puede ir en el navegador. La #mono[service_role] #hl[jamás]. Salta todas tus reglas de acceso, y con ella se puede leer, modificar o borrar tu base completa con 3 líneas de código.],
  sub: [La IA las confunde más de lo que crees, y la app funciona igual hasta que alguien la encuentra. Por eso las revisamos una por una.],
)
