#import "_post.typ": *
#set page(width: 540pt, height: 540pt, margin: (x: 36pt, top: 34pt, bottom: 30pt), fill: paper)
#set text(font: "Roboto", weight: "light", fill: ink)

#post(
  titular: ["Funciona" no es lo mismo que #hl["está protegido"].],
  lines: (
    (teal, [\$ #text(fill: cwhite)[curl tu-app.com/rest/v1/usuarios -H "apikey: ANON"]]),
    (cwhite, [\[ \{ "id":1, "email":"ana@…", "fono":"+569…" \}, …]),
    (cgray, [\# 3.412 filas devueltas con la llave pública]),
    (coral, [▲ CRÍTICO #text(fill: cwhite, size: 10.5pt)[ Row Level Security apagado en 'usuarios']]),
  ),
  annotation: [Con RLS apagado, la llave que va en el navegador puede leer #hl[toda la tabla]: nombres, correos y teléfonos de todos tus usuarios, con una sola línea.],
  sub: [Supabase no activa las reglas por ti. Hay que definirlas tabla por tabla — es el paso que casi nadie hace.],
)
