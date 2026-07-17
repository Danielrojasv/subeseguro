#import "_post.typ": *
#set page(width: 540pt, height: 540pt, margin: (x: 36pt, top: 34pt, bottom: 30pt), fill: paper)
#set text(font: "Roboto", weight: "light", fill: ink)

#post(
  titular: [Tu repositorio puede estar contando #hl[más de lo que crees].],
  lines: (
    (teal, [\$ #text(fill: cwhite)[curl raw.githubusercontent.com/tu-user/app/main/.env]]),
    (cyellow, [OPENAI_API_KEY=sk-proj-9x2a…]),
    (cyellow, [STRIPE_SECRET=sk_live_51Hb…]),
    (coral, [▲ CRÍTICO #text(fill: cwhite, size: 10.5pt)[ claves reales en un archivo público]]),
  ),
  annotation: [Subir la carpeta completa a GitHub es cómodo, pero el #mono[.env] #hl[no debería ir nunca]. Con esas claves alguien puede gastar tu saldo o cobrar a tu nombre.],
  sub: [Un .gitignore bien puesto lo evita. Y si ya se subió, borrarlo no basta, hay que rotar las claves.],
)
