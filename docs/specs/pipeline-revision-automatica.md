# Spec — Pipeline de revisión automática (SubeSeguro)

**Estado:** implementado (piloto), pendiente credenciales para activar · **Fecha:** 2026-07-15
**Umbral SDD:** cruza (integración externa nueva = Gmail IMAP/SMTP + procesa datos de terceros).

## Problema
El tier gratis genera fricción manual: alguien envía su app → llega a Gmail → hay que
correr el motor a mano → generar PDF → responder. Con volumen no escala. Daniel quiere
que "lea el Gmail y responda" solo.

## Decisión de arquitectura
- **NO n8n.** El trabajo pesado ya vive en scripts (`scripts/revisar.sh` + `informe.typ`);
  n8n solo sería pegamento y sumaría una plataforma (Docker, UI, DB propia) fuera de los
  repos. Se hace como servicio Python en el server, consistente con el stack (FastAPI/cron
  + systemd) y versionado en git.
- **Trigger = leer Gmail por IMAP** (no webhook). El form usa formsubmit → Gmail; leer con
  IMAP evita exponer un endpoint público (el server vive en Tailscale). App Password de
  Gmail, sin OAuth ni Google Cloud project.
- **Motor 100% determinista** (headers, archivos expuestos, secretos en el cliente,
  sourcemaps, gitleaks). NO usa Claude → no toca la suscripción Max ([[reference-anthropic-thirdparty-ban]]),
  se puede correr autónomo sin riesgo de ban.
- **Human-in-the-loop por defecto (AUTO_SEND=0).** El PDF va a Daniel para su OK antes de
  llegar al cliente: su firma es el producto y un falso positivo del scanner enviado a un
  desconocido quema reputación. `AUTO_SEND=1` lo vuelve directo cuando confíe en el motor.
- **Guardrails:** tope diario (DAILY_LIMIT=10), marca correos leídos para no reprocesar,
  un fallo en una pasada no mata el servicio.

## Componentes
| Archivo | Rol |
|---------|-----|
| `pipeline/parse.py` | Parseo tolerante del correo formsubmit → {url, repo, email, ok} |
| `pipeline/run.py` | IMAP fetch → parse → motor → entrega (SMTP) → marca leído; `--once/--loop/--dry-run` |
| `pipeline/test_parse.py` | Tests del parser (HTML tabla + texto plano + casos borde) |
| `pipeline/.env.example` | Plantilla de credenciales (real gitignoreado) |
| `pipeline/subeseguro-pipeline.service` | systemd (loop), con aislamiento básico |

## Riesgos y mitigaciones
- **Repos maliciosos de desconocidos:** `revisar.sh` clona `--depth 1` y solo lee (gitleaks),
  no ejecuta código; el service corre con PrivateTmp/ProtectSystem/ProtectHome. GOTCHA:
  para volumen alto, mover el clon+scan a un VPS aislado — NO el server de casa.
- **Deliverability:** Gmail nuevo enviando a desconocidos puede caer en spam; para el
  piloto (bajo volumen + envío supervisado) es aceptable.
- **Formato de formsubmit desconocido hasta el 1er correo real:** parser defensivo con
  heurística de respaldo (primera URL / primer email no-formsubmit); ajustar si el 1er
  correo real trae otro layout.

## Pendiente para activar
1. Daniel: en soporte.vetastudios@gmail.com → activar 2FA + IMAP + generar App Password.
2. Copiar `pipeline/.env.example` a `pipeline/.env` con la App Password.
3. Activar formsubmit (primer envío del form + clic de confirmación).
4. Probar con `python -m pipeline.run --once`, luego instalar el service o cron.
5. Cuando el motor demuestre confiabilidad con casos reales → AUTO_SEND=1.

## Cierre
Mover a `shipped/` después de procesar la primera solicitud real de punta a punta (demo).
