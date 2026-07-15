#!/usr/bin/env bash
# generar-informe.sh — motor completo del tier gratis: scan + PDF en un paso.
# Uso: scripts/generar-informe.sh <url> [repo_git_url]
# Deja el PDF listo para que Daniel lo revise y reenvíe al cliente.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

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
