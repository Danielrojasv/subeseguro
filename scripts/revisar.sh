#!/usr/bin/env bash
# revisar.sh — puerta de SubeSeguro al motor master-audit (/opt/master-audit).
# El motor (chequeos pasivos de seguridad, experiencia, accesibilidad, jerarquía,
# performance; capturas; hoja de revisión) vive en master-audit. Acá solo se decide
# dónde dejar el informe, se firma el user agent y se persiste en el SQLite del producto.
#
# Uso:  scripts/revisar.sh <url> [repo_git_url]
# Salida: informes/<slug>/ con hallazgos.json, ux.json, screenshots y hoja-revision.md.
# Códigos: 0 ok · 3 URL no responde · 4 red interna (SSRF) · 2 uso · 5 motor ausente.
#
# Principios heredados del motor (ver /opt/master-audit/SECURITY-RULES.md): solo chequeos
# PASIVOS; el repo se clona en temporal y nunca se ejecuta; nada de IA sobre el contenido.
set -uo pipefail

URL="${1:-}"
REPO="${2:-}"
if [[ -z "$URL" ]]; then echo "uso: revisar.sh <url> [repo_git_url]" >&2; exit 2; fi
[[ "$URL" =~ ^https?:// ]] || URL="https://$URL"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINE="${MASTER_AUDIT_BIN:-/opt/master-audit/bin/master-audit}"
if [[ ! -x "$ENGINE" ]]; then
  echo "[revisar] no encuentro el motor master-audit en $ENGINE (MASTER_AUDIT_BIN para cambiarlo)" >&2
  exit 5
fi

SLUG="$(echo "$URL" | sed -E 's#^https?://##; s#[^a-zA-Z0-9]+#-#g; s#-+$##' | cut -c1-60)"
OUT="$ROOT/informes/$SLUG"
mkdir -p "$OUT"

args=("$URL" "--out=$OUT")
[[ -n "$REPO" ]] && args+=("--repo=$REPO")
# Pruebas propias contra localhost: SUBESEGURO_ALLOW_LOCAL=1 (nunca en el pipeline público).
[[ "${SUBESEGURO_ALLOW_LOCAL:-0}" == "1" ]] && args+=("--allow-local")

MASTER_AUDIT_UA="SubeSeguroBot/1.0 (revision pre-lanzamiento)" "$ENGINE" "${args[@]}"
rc=$?

# ---- Persistir en SQLite: cache 24h + analítica de los hallazgos más comunes ----
if [[ -f "$OUT/hallazgos.json" ]]; then
  python3 "$ROOT/scripts/store.py" save "$OUT/hallazgos.json" 2>/dev/null || true
fi
exit $rc
