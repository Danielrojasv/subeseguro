# Despega — revisión pre-lanzamiento para apps hechas con IA

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
despega/
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

1. Los envíos llegan al Gmail de Daniel vía formsubmit (asunto `[Despega] Nueva revisión solicitada`).
   El PRIMER envío dispara un correo de activación de formsubmit — hay que hacer clic una vez.
2. Tras activar, formsubmit entrega un endpoint alias aleatorio: reemplazar el email del
   `action` del form por ese alias (para no exponer el correo) y re-pushear.
3. Cada solicitud se analiza a mano con el pipeline de auditorías y se responde con un PDF
   como el de ejemplo dentro de 48 h.
4. Cobros del informe completo: link manual de Lemon Squeezy (pendiente cuenta).

## Reglas

- Español chileno (tuteo), sin emojis en UI, Roboto 300/400 sin bold, coral `#E75736` + teal `#5C8A86`.
- Los análisis de repos ajenos corren SIEMPRE sandboxeados y nunca con el OAuth del plan Max.
