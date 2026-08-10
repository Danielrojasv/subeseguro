# SubeSeguro — revisión pre-lanzamiento para apps hechas con IA

Landing **fake-door** para validar el servicio de revisión (deploy + seguridad + performance)
dirigido a vibe-coders LATAM. Detrás del formulario no hay motor: cada envío llega por
correo y el análisis se corre a mano (concierge MVP). Se construye el motor automatizado
solo si se cumplen los criterios go/no-go.

- Análisis de demanda: mdview `analisis-grupo-claude-code.md`
- Factibilidad completa: mdview `factibilidad-servicio-vibecoders.md`
- **Go/no-go (día 14):** ≥30 envíos al formulario y ≥3 pagos del informe completo.

## Stack

HTML/CSS estático, design system Veta (`tokens.css` vendorizado), sin frameworks ni build.
Deploy en GitHub Pages al push a `main`. Formulario vía [formsubmit.co](https://formsubmit.co)
(sin backend, sin secretos en el cliente).

```
subeseguro/
├── index.html                  ← landing
├── gracias/index.html          ← confirmación post-envío
├── tokens.css                  ← Veta (vendorizado de design-system)
├── informe/
│   ├── reporte-ejemplo.typ     ← fuente Typst del PDF de muestra
│   └── reporte-ejemplo.pdf     ← informe de ejemplo (app ficticia)
└── test/landing.test.mjs       ← invariantes de la landing (node --test)
```

## Desarrollo

```bash
python3 -m http.server 8080          # servir local
node --test test/                    # tests
typst compile informe/reporte-ejemplo.typ   # regenerar el PDF (requiere fuente Roboto)
```

## Operación del fake-door

1. Los envíos llegan a `soporte.vetastudios@gmail.com` vía formsubmit (asunto
   `[SubeSeguro] Nueva revisión solicitada`). El PRIMER envío dispara un correo de
   activación de formsubmit — hay que hacer clic una vez.
2. Tras activar, formsubmit entrega un endpoint alias aleatorio: reemplazar el email del
   `action` del form por ese alias (para no exponer el correo) y re-pushear.
3. Tier GRATIS (automático supervisado): correr `scripts/revisar.sh <url> [repo]` → genera
   los hallazgos deterministas → PDF top-3 con la plantilla Typst → se reenvía al cliente.
   Cero trabajo manual de análisis; solo revisar el PDF antes de enviar.
4. Tier PAGADO: revisión senior de Daniel (informe completo) o done-for-you.
   Cobros manuales por correo (tarjeta/PayPal/transferencia): Lemon Squeezy rechazó
   la tienda el 26-jul-2026; alternativa MoR futura si el piloto valida (Paddle).
5. Tope del piloto: 10 revisiones gratis/día. El excedente recibe "estamos llenos esta semana".

## Motor de experiencia (`scripts/ux-audit/`)

Abre la página en chromium y **mide** en vez de adivinar. De paso deja las capturas
mobile y desktop que consume el informe. Seis capas:

| Capa | Qué mide |
|------|----------|
| `mobile` | scroll horizontal, h1 que no escala, inputs bajo 16px (zoom de iOS), targets bajo 44px, teclado por campo, imágenes que desbordan, dropdowns a mano, theme-color, safe areas, mailto que muere en webviews |
| `formulario` | campos sin label, `type="url"` que bloquea envíos en silencio, patterns sin explicación, opcionales sin marcar, ausencia de analítica, sin acción en el primer pantallazo, precio escondido |
| `accesibilidad` | contraste WCAG por bloque con el umbral correcto según tamaño y peso, foco invisible, alt, botones sin nombre accesible, anclas sin scroll suave, encabezados que saltan niveles |
| `performance` | errores de consola al cargar, LCP, peso transferido, imágenes sobredimensionadas, CLS, estáticos sin caché, `setInterval` de pocos segundos, APIs de IA llamadas desde el navegador |
| `jerarquia` | marca que compite con la nav, escala tipográfica plana, exceso de colores de acento, párrafos largos centrados |
| `confianza` | pide correo sin decir para qué, nadie firma la página |

Lo que necesita ojo humano no se automatiza ni se inventa: sale en
`hoja-revision.md` (`--hoja=`), la hoja de la pasada senior con los 18 ítems de
criterio y un resumen de lo que el motor ya cubrió.

**Verificación activa de base de datos (`--verificar-datos`, apagada por defecto).**
La capa `datos` deja de solo observar y le consulta al Supabase/Firebase del sitio
—con la clave pública que el propio sitio ya publica— si quedó sin reglas de acceso,
que es la fuga número uno en apps hechas con IA. Como cruza la línea de "solo pasivo",
tiene cuatro candados (apagado por defecto, nada adivinado, solo lectura acotada,
no guarda nada) descritos en `scripts/ux-audit/verificar-datos.mjs` y en
`SECURITY-RULES.md` #8. **Solo para revisiones internas y sitios propios o con permiso
del dueño**; el camino público (`revisar.sh`, pipeline) NO la activa hasta que el
formulario tenga el check de autorización. Uso: `pnpm ux <url> --verificar-datos`.

Está construido como herramienta suelta a propósito, porque tiene tres usos:

```bash
pnpm install                                   # una vez (usa el chromium del sistema)

pnpm ux https://app-del-cliente.com            # 1. motor, sobre el sitio de un cliente
pnpm ux http://localhost:8080                  # 2. mientras construyes un sitio propio
pnpm ux http://localhost:8080 --fail-on=alto   # 3. puerta de CI, sale 1 si hay algo grave
```

Opciones: `--json`, `--out=archivo.json`, `--hoja=archivo.md`, `--shots=dir`, `--timeout=ms`.

Arquitectura, y la razón de que sea así:

- `probe.mjs` corre **dentro** de la página y solo recolecta datos crudos. No juzga nada.
- `checks/*.mjs` son funciones puras sobre ese snapshot. Ahí vive todo el criterio.
- Esa separación permite testear sin navegador (snapshots sintéticos, milisegundos) y
  agregar un chequeo nuevo sin tocar el recolector.

`revisar.sh` lo llama y fusiona sus hallazgos en `hallazgos.json` bajo la categoría
`experiencia`, con un campo `capa` (`mobile`, `formulario`, …). Si el módulo no está
instalado o falla, el informe sale igual con los chequeos estáticos.

Fixtures de referencia en `test/fixtures/`: `rota.html` tiene todos los problemas y
`limpia.html` no tiene ninguno. La limpia es además la semilla de la plantilla base:
un sitio nuevo debería nacer cumpliendo lo que hay ahí.

Inventario completo de la metodología y las fases que faltan: mdview
`subeseguro-motor-experiencia-plan.md`.

## Reglas

- Español chileno (tuteo), sin emojis en UI, Roboto 300/400 sin bold, coral `#E75736` + teal `#5C8A86`.
- Todo sitio propio nuevo pasa `pnpm ux` antes de darse por listo, no después.
- Los análisis de repos ajenos corren SIEMPRE sandboxeados y nunca con el OAuth del plan Max.

## Pipeline automático (pipeline/)

Lee el Gmail de soporte, corre el motor y entrega el informe. Ver la spec en
`docs/specs/pipeline-revision-automatica.md`. Modo piloto: el PDF va a Daniel para su
OK antes de enviarlo al cliente (`AUTO_SEND=0`).

Activar: copiar `pipeline/.env.example` → `pipeline/.env` con la App Password de Gmail,
luego `python3 -m pipeline.run --once` (o instalar `pipeline/subeseguro-pipeline.service`).
Tests del parser: `python3 pipeline/test_parse.py`.
