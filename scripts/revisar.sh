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

findings=()   # cada uno: categoria|sev|titulo|detalle   (categoria: seguridad|experiencia)
add() { findings+=("$1|$2|$3|$4"); }
addsec() { add seguridad "$1" "$2" "$3"; }
addexp() { add experiencia "$1" "$2" "$3"; }

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

# ---- 1. Headers HTTP + TLS (seguridad) ----
HDRS="$("${CURL[@]}" -D - -o /dev/null "$URL" 2>/dev/null)"
hget() { echo "$HDRS" | grep -i "^$1:" | head -1 | cut -d: -f2- | tr -d '\r' | sed 's/^ *//'; }

if [[ "$URL" == https://* ]]; then
  [[ -z "$(hget strict-transport-security)" ]] && addsec alto "Sin HSTS" "Falta el header Strict-Transport-Security: un atacante en la red podria forzar la version http sin cifrar."
else
  addsec critico "El sitio no usa HTTPS" "El trafico viaja sin cifrar; cualquiera en la red puede leer datos y contrasenas."
fi
[[ -z "$(hget content-security-policy)" ]] && addsec medio "Sin Content-Security-Policy" "Falta CSP: sube el riesgo de inyeccion de scripts (XSS) en apps con contenido dinamico."
[[ -z "$(hget x-frame-options)$(hget content-security-policy)" ]] && addsec medio "Sin proteccion contra clickjacking" "Falta X-Frame-Options o frame-ancestors: tu sitio puede ser embebido en un iframe enganoso."
[[ -z "$(hget x-content-type-options)" ]] && addsec bajo "Sin X-Content-Type-Options" "Falta 'nosniff': el navegador puede interpretar archivos como un tipo distinto y abrir la puerta a ataques."
[[ -z "$(hget referrer-policy)" ]] && addsec bajo "Sin Referrer-Policy" "Sin este header, tu app puede filtrar a otros sitios las URLs internas por las que navega el usuario."
[[ -z "$(hget permissions-policy)" ]] && addsec bajo "Sin Permissions-Policy" "No se restringen camara, microfono ni geolocalizacion; conviene limitar lo que la pagina puede pedir."
SERVER="$(hget server)"; POWERED="$(hget x-powered-by)"
[[ -n "$POWERED" ]] && addsec bajo "Filtra tecnologia del backend" "El header X-Powered-By expone '$POWERED'; da pistas gratis a un atacante. Conviene ocultarlo."
# cookies sin flags de seguridad
COOKIES="$(echo "$HDRS" | grep -i '^set-cookie:')"
if [[ -n "$COOKIES" ]]; then
  echo "$COOKIES" | grep -qi "httponly" || addsec medio "Cookies sin HttpOnly" "Hay cookies accesibles por JavaScript: si hay un XSS, se pueden robar sesiones. Deben ser HttpOnly."
  echo "$COOKIES" | grep -qi "secure"   || addsec medio "Cookies sin Secure" "Hay cookies que pueden viajar sin cifrar (sin el flag Secure)."
fi

# ---- 2. Archivos sensibles expuestos (los clasicos del vibe-coding, seguridad) ----
check_path() { # ruta  severidad  titulo  detalle
  local code ct
  read -r code ct < <("${CURL[@]}" -o /dev/null -w "%{http_code} %{content_type}" "$URL/$1" 2>/dev/null)
  if [[ "$code" == "200" && "$ct" != text/html* ]]; then
    addsec "$2" "$3" "$4 (encontrado en /$1)"
  fi
}
check_path ".env"            critico "Archivo .env accesible"        "El archivo de variables de entorno (claves, tokens, contrasenas de BD) es descargable por cualquiera."
check_path ".env.local"      critico ".env.local accesible"         "Variables de entorno locales descargables (suelen tener las claves reales)."
check_path ".env.production" critico ".env.production accesible"     "El archivo de entorno de produccion es descargable: trae las claves reales en uso."
check_path ".git/config"     critico ".git expuesto"                "El repositorio .git es accesible: se puede reconstruir todo tu codigo fuente e historial."
check_path ".git/HEAD"       critico ".git expuesto"                "El repositorio .git es accesible: se puede reconstruir todo tu codigo fuente e historial."
check_path "config.json"     alto    "config.json publico"          "Un archivo de configuracion es accesible y suele traer claves o endpoints internos."
check_path "backup.sql"      critico "Dump de base de datos publico" "Hay un respaldo SQL descargable con, potencialmente, todos tus datos."
check_path "backup.zip"      alto    "Respaldo .zip publico"        "Hay un archivo de respaldo descargable; puede contener codigo o datos sensibles."
check_path ".DS_Store"       bajo    ".DS_Store expuesto"           "Filtra la lista de archivos de tus carpetas; da pistas de tu estructura interna."

# ---- 3. Secretos en el HTML/JS servido al navegador (seguridad) ----
BODY="$("${CURL[@]}" "$URL" 2>/dev/null)"
if echo "$BODY" | grep -qiE 'service_role|sk_live_|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|-----BEGIN [A-Z ]*PRIVATE KEY'; then
  addsec critico "Clave secreta en el codigo del navegador" "Se detecto un patron de clave privada/secreta en el HTML o JS que se envia al cliente. Cualquiera con F12 la ve."
fi
if echo "$BODY" | grep -qiE 'supabase\.co' && ! echo "$BODY" | grep -qiE 'service_role'; then
  addsec info "Usa Supabase" "Detectamos Supabase. Verifica que TODAS las tablas tengan Row Level Security activado (causa #1 de fugas de datos en apps con IA)."
fi

# ---- 4. Sourcemaps expuestos (seguridad) ----
if echo "$BODY" | grep -qoE 'src="[^"]+\.js"' ; then
  JS1="$(echo "$BODY" | grep -oE 'src="[^"]+\.js"' | head -1 | sed -E 's/src="([^"]+)"/\1/')"
  [[ "$JS1" == /* ]] && JS1="${URL%/}$JS1"
  if [[ "$JS1" == http* ]]; then
    MAPCODE="$("${CURL[@]}" -o /dev/null -w "%{http_code}" "$JS1.map" 2>/dev/null)"
    [[ "$MAPCODE" == "200" ]] && addsec medio "Sourcemaps publicos" "Los archivos .map estan accesibles: exponen tu codigo fuente original sin minificar."
  fi
fi

# ---- 4b. Experiencia de usuario y performance (mejoras) ----
# viewport (responsive en celular)
echo "$BODY" | grep -qiE '<meta[^>]+name=["'"'"']?viewport' || addexp alto "Sin meta viewport" "Falta la etiqueta viewport: tu app se ve diminuta y desconfigurada en celulares. Es el arreglo #1 para mobile."
# title y description (SEO / como se ve al compartir)
echo "$BODY" | grep -qiE '<title>[^<]{3,}' || addexp medio "Sin titulo de pagina" "Falta un <title> descriptivo: afecta como te encuentran en Google y como se ve la pestana."
echo "$BODY" | grep -qiE '<meta[^>]+name=["'"'"']?description' || addexp bajo "Sin meta description" "Sin descripcion, Google y las redes muestran un texto cualquiera al enlazar tu app."
# Open Graph (como se ve al compartir el link)
echo "$BODY" | grep -qiE 'property=["'"'"']?og:' || addexp bajo "Sin Open Graph" "Al compartir tu link en WhatsApp/redes no aparece imagen ni titulo lindo; se ve pobre."
# favicon
echo "$BODY" | grep -qiE 'rel=["'"'"']?(shortcut )?icon' || addexp bajo "Sin favicon" "Falta el iconito de la pestana; detalle chico pero da sensacion de app a medio terminar."
# idioma
echo "$BODY" | grep -qiE '<html[^>]+lang=' || addexp bajo "Sin idioma declarado" "El <html> no declara lang: afecta accesibilidad y el traductor del navegador."
# peso de la pagina principal
PAGE_BYTES="$(echo -n "$BODY" | wc -c)"
if [[ "$PAGE_BYTES" -gt 3000000 ]]; then
  addexp medio "Pagina inicial muy pesada" "El HTML inicial pesa $((PAGE_BYTES/1024/1024)) MB; en 4G carga lento y pierdes usuarios en los primeros segundos."
fi
# compresion
echo "$HDRS" | grep -qiE '^content-encoding:\s*(gzip|br)' || addexp bajo "Sin compresion" "El servidor no comprime (gzip/brotli); las paginas pesan mas y cargan mas lento de lo necesario."

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
    [[ "$N" -gt 0 ]] && addsec critico "$N secreto(s) en el historial del repo" "gitleaks encontro claves/tokens commiteados. Aunque los borres ahora, quedan en el historial de git y hay que rotarlos."
  else
    addsec info "No se pudo clonar el repo" "El repositorio no es publico o la URL es incorrecta; se reviso solo la URL del sitio."
  fi
  rm -rf "$TMP"
fi

# ---- Emitir hallazgos.json (ordenado por severidad, con categoria y conteos) ----
python3 - "$OUT/hallazgos.json" "$URL" <<'PY' "${findings[@]}"
import json, sys
out, url = sys.argv[1], sys.argv[2]
order = {"critico":0,"alto":1,"medio":2,"bajo":3,"info":4}
items = []
for raw in sys.argv[3:]:
    cat, sev, titulo, detalle = raw.split("|", 3)
    items.append({"categoria": cat, "severidad": sev, "titulo": titulo, "detalle": detalle})
items.sort(key=lambda x: order.get(x["severidad"], 9))
n_seg = sum(1 for i in items if i["categoria"] == "seguridad")
n_exp = sum(1 for i in items if i["categoria"] == "experiencia")
data = {"url": url, "accesible": True, "hallazgos": items,
        "conteo": {"total": len(items), "seguridad": n_seg, "experiencia": n_exp}}
json.dump(data, open(out, "w"), ensure_ascii=False, indent=2)
print(f"[revisar] {len(items)} hallazgos ({n_seg} seguridad, {n_exp} experiencia) -> {out}")
PY

# ---- Persistir en SQLite: cache + analitica de los mas comunes ----
python3 "$ROOT/scripts/store.py" save "$OUT/hallazgos.json" 2>/dev/null || true

echo "[revisar] listo. Revisa $OUT/hallazgos.json y screen-*.png"
