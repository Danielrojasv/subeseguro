#!/usr/bin/env bash
# revisar.sh — motor de la revisión gratuita de SubeSeguro (tier automático supervisado).
# Corre chequeos DETERMINISTAS y pasivos sobre una URL pública (y opcionalmente un repo),
# emite un JSON de hallazgos que alimenta la plantilla Typst del informe top-3.
#
# Uso:  scripts/revisar.sh <url> [repo_git_url]
# Salida: informes/<slug>/ con hallazgos.json, screenshots y (si se pide) el PDF.
#
# Principios (ver ../README.md y memoria feedback_security_rules_files):
#   - Solo chequeos PASIVOS: GET a la URL, headers, archivos que ya son públicos.
#     Nada de fuerza bruta ni pruebas intrusivas (eso sería pentest, no lo somos).
#   - El repo se clona SIEMPRE en un dir temporal y se borra; nunca se ejecuta su código.
#     (Para producción con repos de desconocidos: correr en VPS aislado, no en el server.)
set -uo pipefail

URL="${1:-}"
REPO="${2:-}"
if [[ -z "$URL" ]]; then echo "uso: revisar.sh <url> [repo_git_url]" >&2; exit 2; fi
[[ "$URL" =~ ^https?:// ]] || URL="https://$URL"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SLUG="$(echo "$URL" | sed -E 's#^https?://##; s#[^a-zA-Z0-9]+#-#g; s#-+$##' | cut -c1-60)"
OUT="$ROOT/informes/$SLUG"
mkdir -p "$OUT"
CURL=(curl -sS -L --max-time 25 -A "SubeSeguroBot/1.0 (revision pre-lanzamiento)")

findings=()   # cada uno: sev|titulo|detalle
add() { findings+=("$1|$2|$3"); }

echo "[revisar] $URL  ->  $OUT"

# ---- 0. ¿La app responde? ----
# Una URL mal escrita o un sitio caído devuelve headers vacíos, y sin este chequeo
# el motor los leería como "le faltan todos los headers de seguridad" = informe FALSO.
STATUS="$("${CURL[@]}" -o /dev/null -w "%{http_code}" "$URL" 2>/dev/null)"
if [[ "$STATUS" == "000" ]]; then
  python3 - "$URL" "$OUT/hallazgos.json" <<'PY'
import json, sys
json.dump({"url": sys.argv[1], "accesible": False, "hallazgos": [{
    "severidad": "info", "titulo": "No pudimos acceder a tu app",
    "detalle": "La URL no respondió. Puede estar mal escrita, el sitio caído o "
               "todavía sin publicar. Confirma el link (que empiece con https:// y "
               "sea el correcto) e inténtalo de nuevo."}]},
    open(sys.argv[2], "w"), ensure_ascii=False, indent=2)
PY
  echo "[revisar] URL no accesible (HTTP 000) — no genero informe de seguridad falso"
  exit 3
fi

# ---- 1. Headers HTTP + TLS ----
HDRS="$("${CURL[@]}" -D - -o /dev/null "$URL" 2>/dev/null)"
hget() { echo "$HDRS" | grep -i "^$1:" | head -1 | cut -d: -f2- | tr -d '\r' | sed 's/^ *//'; }

if [[ "$URL" == https://* ]]; then
  [[ -z "$(hget strict-transport-security)" ]] && add alto "Sin HSTS" "Falta el header Strict-Transport-Security: un atacante en la red podria forzar la version http sin cifrar."
else
  add critico "El sitio no usa HTTPS" "El trafico viaja sin cifrar; cualquiera en la red puede leer datos y contrasenas."
fi
[[ -z "$(hget content-security-policy)" ]] && add medio "Sin Content-Security-Policy" "Falta CSP: sube el riesgo de inyeccion de scripts (XSS) en apps con contenido dinamico."
[[ -z "$(hget x-frame-options)$(hget content-security-policy)" ]] && add medio "Sin proteccion contra clickjacking" "Falta X-Frame-Options o frame-ancestors: tu sitio puede ser embebido en un iframe enganoso."
SERVER="$(hget server)"; POWERED="$(hget x-powered-by)"
[[ -n "$POWERED" ]] && add bajo "Filtra tecnologia del backend" "El header X-Powered-By expone '$POWERED'; da pistas gratis a un atacante. Conviene ocultarlo."

# ---- 2. Archivos sensibles expuestos (los clasicos del vibe-coding) ----
check_path() { # ruta  severidad  titulo  detalle
  local code ct
  read -r code ct < <("${CURL[@]}" -o /dev/null -w "%{http_code} %{content_type}" "$URL/$1" 2>/dev/null)
  # solo cuenta si responde 200 y NO es el index html de una SPA (fallback)
  if [[ "$code" == "200" && "$ct" != text/html* ]]; then
    add "$2" "$3" "$4 (encontrado en /$1)"
  fi
}
check_path ".env"            critico "Archivo .env accesible"        "El archivo de variables de entorno (claves, tokens, contrasenas de BD) es descargable por cualquiera."
check_path ".git/config"     critico ".git expuesto"                "El repositorio .git es accesible: se puede reconstruir todo tu codigo fuente e historial."
check_path ".git/HEAD"       critico ".git expuesto"                "El repositorio .git es accesible: se puede reconstruir todo tu codigo fuente e historial."
check_path "config.json"     alto    "config.json publico"          "Un archivo de configuracion es accesible y suele traer claves o endpoints internos."
check_path ".env.local"      critico ".env.local accesible"         "Variables de entorno locales descargables (suelen tener las claves reales)."
check_path "backup.sql"      critico "Dump de base de datos publico" "Hay un respaldo SQL descargable con, potencialmente, todos tus datos."

# ---- 3. Secretos en el HTML/JS servido al navegador ----
BODY="$("${CURL[@]}" "$URL" 2>/dev/null)"
if echo "$BODY" | grep -qiE 'service_role|sk_live_|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|-----BEGIN [A-Z ]*PRIVATE KEY'; then
  add critico "Clave secreta en el codigo del navegador" "Se detecto un patron de clave privada/secreta en el HTML o JS que se envia al cliente. Cualquiera con F12 la ve."
fi
if echo "$BODY" | grep -qiE 'supabase\.co'; then
  if echo "$BODY" | grep -qiE 'service_role'; then :; else
    add info "Usa Supabase" "Detectamos Supabase. Verifica que TODAS las tablas tengan Row Level Security activado (causa #1 de fugas de datos en apps con IA)."
  fi
fi

# ---- 4. Sourcemaps expuestos (filtran el codigo original) ----
if echo "$BODY" | grep -qoE 'src="[^"]+\.js"' ; then
  JS1="$(echo "$BODY" | grep -oE 'src="[^"]+\.js"' | head -1 | sed -E 's/src="([^"]+)"/\1/')"
  [[ "$JS1" == /* ]] && JS1="${URL%/}$JS1"
  if [[ "$JS1" == http* ]]; then
    MAPCODE="$("${CURL[@]}" -o /dev/null -w "%{http_code}" "$JS1.map" 2>/dev/null)"
    [[ "$MAPCODE" == "200" ]] && add medio "Sourcemaps publicos" "Los archivos .map estan accesibles: exponen tu codigo fuente original sin minificar."
  fi
fi

# ---- 5. Screenshots (evidencia + base para la revision UX) ----
if command -v chromium >/dev/null 2>&1; then
  for vp in "390,844:mobile" "1280,900:desktop"; do
    size="${vp%%:*}"; name="${vp##*:}"
    chromium --headless=new --no-sandbox --disable-gpu --hide-scrollbars \
      --window-size="$size" --screenshot="$OUT/screen-$name.png" "$URL" >/dev/null 2>&1 &
  done
  wait
fi

# ---- 6. Repo (opcional): gitleaks sobre el clon ----
if [[ -n "$REPO" ]]; then
  TMP="$(mktemp -d)"
  if git clone --depth 1 --quiet "$REPO" "$TMP" 2>/dev/null; then
    LEAKS="$OUT/gitleaks.json"
    gitleaks detect --source "$TMP" --report-format json --report-path "$LEAKS" --no-banner >/dev/null 2>&1
    N="$(jq 'length' "$LEAKS" 2>/dev/null || echo 0)"
    [[ "$N" -gt 0 ]] && add critico "$N secreto(s) en el historial del repo" "gitleaks encontro claves/tokens commiteados. Aunque los borres ahora, quedan en el historial de git y hay que rotarlos."
  else
    add info "No se pudo clonar el repo" "El repositorio no es publico o la URL es incorrecta; se reviso solo la URL del sitio."
  fi
  rm -rf "$TMP"
fi

# ---- Emitir hallazgos.json ordenado por severidad ----
python3 - "$OUT/hallazgos.json" "$URL" <<'PY' "${findings[@]}"
import json, sys
out, url = sys.argv[1], sys.argv[2]
order = {"critico":0,"alto":1,"medio":2,"bajo":3,"info":4}
items = []
for raw in sys.argv[3:]:
    sev, titulo, detalle = raw.split("|", 2)
    items.append({"severidad": sev, "titulo": titulo, "detalle": detalle})
items.sort(key=lambda x: order.get(x["severidad"], 9))
json.dump({"url": url, "hallazgos": items}, open(out, "w"), ensure_ascii=False, indent=2)
print(f"[revisar] {len(items)} hallazgos -> {out}")
crit = sum(1 for i in items if i['severidad']=='critico')
alto = sum(1 for i in items if i['severidad']=='alto')
print(f"[revisar] criticos={crit} altos={alto}")
PY

echo "[revisar] listo. Revisa $OUT/hallazgos.json y screen-*.png"
