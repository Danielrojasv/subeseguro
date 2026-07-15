#!/usr/bin/env bash
# generar-informe.sh — motor completo del tier gratis: scan + PDF en un paso.
# Uso: scripts/generar-informe.sh <url> [repo_git_url]
# Deja el PDF listo para que Daniel lo revise y reenvíe al cliente.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

URL0="${1:-}"; [[ "$URL0" =~ ^https?:// ]] || URL0="https://$URL0"

# Cache: si ya escaneamos esta URL hace < 24h y no viene repo nuevo, reusar el PDF.
if [[ -z "${2:-}" ]]; then
  CACHED="$(python3 "$ROOT/scripts/store.py" fresh "$URL0" 24 2>/dev/null)"
  if [[ -n "$CACHED" && -f "$CACHED" ]]; then
    echo "[generar-informe] cache: reuso scan reciente de $URL0 → $CACHED"
    exit 0
  fi
fi

# rc 0 = ok · rc 3 = URL no accesible (igual generamos el PDF de aviso) · otro = error
"$ROOT/scripts/revisar.sh" "$@"; rc=$?
[[ $rc -ne 0 && $rc -ne 3 ]] && exit 1

URL="${1:-}"; [[ "$URL" =~ ^https?:// ]] || URL="https://$URL"
SLUG="$(echo "$URL" | sed -E 's#^https?://##; s#[^a-zA-Z0-9]+#-#g; s#-+$##' | cut -c1-60)"
REL="informes/$SLUG"

typst compile --input data="/$REL/hallazgos.json" --root "$ROOT" \
  "$ROOT/scripts/informe.typ" "$ROOT/$REL/informe.pdf" || exit 1

echo "[generar-informe] PDF listo: $ROOT/$REL/informe.pdf"
echo "[generar-informe] screenshots: $ROOT/$REL/screen-mobile.png · screen-desktop.png"
