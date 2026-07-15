// Informe de ejemplo — Despega (app ficticia para demostración)
#let coral = rgb("#E75736")
#let teal = rgb("#5C8A86")
#let ink = rgb("#241F1A")
#let muted = rgb("#8C8475")
#let paper = rgb("#FAF6EE")
#let danger = rgb("#B23A2E")
#let dangersoft = rgb("#F7E2DE")
#let amber = rgb("#B5852A")
#let ambersoft = rgb("#F6ECD6")

#set page(margin: (x: 2.2cm, y: 2.4cm))
#set text(font: ("Roboto", "Liberation Sans"), weight: 300, size: 10.5pt, fill: ink, lang: "es")
#set par(leading: 0.65em, justify: false)

#let sev(label, color, soft) = box(
  fill: soft, radius: 3pt, inset: (x: 8pt, y: 4pt),
  text(size: 8pt, fill: color, tracking: 0.08em, upper(label))
)

// ---------- portada compacta ----------
#grid(columns: (1fr, auto),
  [
    #text(size: 22pt, weight: 300)[Informe de revisión pre-lanzamiento]
    #v(4pt)
    #text(fill: muted)[Los 3 hallazgos más importantes — revisión inicial gratuita]
  ],
  align(right)[
    #text(fill: coral, size: 14pt)[Despega]
    #linebreak()
    #text(fill: muted, size: 9pt)[despega · Veta Studios]
  ]
)
#v(6pt)
#line(length: 100%, stroke: 0.5pt + rgb("#ECE2D1"))
#v(10pt)

#grid(columns: (1fr, 1fr, 1fr), gutter: 12pt,
  [#text(size: 8.5pt, fill: muted, tracking: 0.1em)[APP REVISADA] \ kiosco-digital.vercel.app #text(fill: muted, size: 9pt)[(ejemplo)]],
  [#text(size: 8.5pt, fill: muted, tracking: 0.1em)[STACK DETECTADO] \ Next.js · Supabase · Vercel],
  [#text(size: 8.5pt, fill: muted, tracking: 0.1em)[FECHA] \ 15 de julio de 2026],
)
#v(14pt)

// ---------- resumen ----------
#block(fill: paper, radius: 6pt, inset: 14pt)[
  #text(size: 12pt)[Resumen en una frase]
  #v(4pt)
  Tu app funciona bien y se nota el trabajo — pero hoy #text(fill: danger)[cualquier persona podría leer y borrar tu base de datos completa]. Son tres arreglos concretos y ninguno te tomará más de una tarde.
]
#v(10pt)

// ---------- hallazgo 1 ----------
#text(size: 14pt)[1 · La llave maestra de tu base de datos está visible] #h(6pt) #sev("crítico", danger, dangersoft)
#v(6pt)
#text(fill: muted, size: 9pt, tracking: 0.06em)[QUÉ ENCONTRAMOS]

En el código que tu app envía al navegador viene incluida la clave `service_role` de Supabase. Esa clave es la "llave maestra": quien la tenga puede leer, modificar o borrar TODA tu base de datos, saltándose cualquier regla de seguridad.

#text(fill: muted, size: 9pt, tracking: 0.06em)[QUÉ RIESGO TIENE]

Cualquiera que abra las herramientas de desarrollador del navegador (F12) puede copiarla en menos de un minuto. Con ella podría descargar los datos de tus clientes o borrar todo. Este es el error más común y más grave en apps hechas con IA.

#text(fill: muted, size: 9pt, tracking: 0.06em)[CÓMO SE ARREGLA]

+ En el panel de Supabase: Settings → API → "Reset service_role key" (la actual ya está comprometida).
+ En tu código, usa solo la clave `anon` en el navegador; la `service_role` va únicamente en el servidor, como variable de entorno.
+ En el informe completo te dejamos el paso a paso exacto para tu código.

#v(10pt)

// ---------- hallazgo 2 ----------
#text(size: 14pt)[2 · Tu tabla de clientes no tiene reglas de acceso] #h(6pt) #sev("crítico", danger, dangersoft)
#v(6pt)
#text(fill: muted, size: 9pt, tracking: 0.06em)[QUÉ ENCONTRAMOS]

La tabla `clientes` de Supabase tiene Row Level Security (RLS) desactivado. En simple: la puerta está sin llave — cualquier visitante puede pedirle a la base de datos la lista completa de tus clientes, con nombres, correos y teléfonos.

#text(fill: muted, size: 9pt, tracking: 0.06em)[QUÉ RIESGO TIENE]

Filtración de datos personales de tus clientes. Además del daño de confianza, en varios países esto puede significar multas por protección de datos.

#text(fill: muted, size: 9pt, tracking: 0.06em)[CÓMO SE ARREGLA]

+ En Supabase: Table Editor → tabla `clientes` → activar "Enable RLS".
+ Crear una política para que cada usuario vea solo sus propios datos (te dejamos la política lista para copiar en el informe completo).
+ Repetir la revisión en el resto de tus tablas — encontramos 4 más en la misma situación.

#v(10pt)

// ---------- hallazgo 3 ----------
#text(size: 14pt)[3 · Tu login acepta intentos ilimitados] #h(6pt) #sev("alto", amber, ambersoft)
#v(6pt)
#text(fill: muted, size: 9pt, tracking: 0.06em)[QUÉ ENCONTRAMOS]

El formulario de inicio de sesión no tiene límite de intentos ni protección contra robots. Probamos (con cuidado) y aceptó decenas de intentos seguidos sin frenar ninguno.

#text(fill: muted, size: 9pt, tracking: 0.06em)[QUÉ RIESGO TIENE]

Un programa automático puede probar miles de contraseñas hasta entrar a las cuentas de tus usuarios. También puede inflar tu cuenta de Supabase/Vercel con tráfico basura.

#text(fill: muted, size: 9pt, tracking: 0.06em)[CÓMO SE ARREGLA]

+ Activar la protección contra bots de Supabase Auth (Captcha integrado, gratis).
+ Agregar límite de intentos por IP en el servidor — son ~15 líneas de código que te incluimos en el informe completo.

#v(14pt)
#line(length: 100%, stroke: 0.5pt + rgb("#ECE2D1"))
#v(8pt)

// ---------- cierre ----------
#grid(columns: (1fr, 1fr), gutter: 16pt,
  block(fill: paper, radius: 6pt, inset: 12pt)[
    #text(size: 11pt)[Lo que también miramos]
    #v(4pt)
    #text(size: 9.5pt, fill: muted)[HTTPS y dominio: bien configurados. Velocidad de carga: buena en escritorio, mejorable en celular (las imágenes pesan 4 MB). Encontramos 6 hallazgos adicionales de prioridad media y baja — están en el informe completo.]
  ],
  block(fill: rgb("#E7EFEE"), radius: 6pt, inset: 12pt)[
    #text(size: 11pt)[¿Quieres el detalle completo?]
    #v(4pt)
    #text(size: 9.5pt, fill: muted)[El informe completo (US\$29) trae los 9 hallazgos con su arreglo paso a paso y el checklist de lanzamiento. Y si prefieres no tocar nada, te lo dejamos listo nosotros (desde US\$149).]
  ]
)
#v(10pt)
#align(center)[
  #text(size: 8.5pt, fill: muted)[Este es un informe de ejemplo con una app ficticia. Revisión de mejores prácticas — no constituye un pentest certificado. \ Despega · un servicio de Veta Studios · Hecho en Chile para toda Latinoamérica]
]
