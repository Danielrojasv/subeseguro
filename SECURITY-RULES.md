# SECURITY-RULES — SubeSeguro

Este servicio recibe input de desconocidos (URLs y repos por formulario) y lo procesa
en el server. Modelo de amenazas y mitigaciones. **Leer antes de tocar el motor o el pipeline.**

## Amenazas y mitigaciones

| # | Amenaza | Mitigación (dónde) |
|---|---------|--------------------|
| 1 | **SSRF** — apuntar a la red interna (localhost, LAN, router, Tailscale, metadata cloud) y usar el servicio como proxy de escaneo interno | `ssrf_ok()` en `revisar.sh`: resuelve el host y rechaza IPs privadas/loopback/link-local/reserved/multicast + CGNAT-Tailscale (100.64.0.0/10). Solo se salta con `SUBESEGURO_ALLOW_LOCAL=1` (pruebas propias). Rechazo → exit 4 + PDF de aviso. |
| 2 | **Malware / exploit del navegador** — el screenshot renderiza JS hostil | chromium con `timeout 30` + flags de endurecimiento; corre bajo el aislamiento del systemd unit (`PrivateTmp`, `ProtectSystem=full`, `ProtectHome=read-only`, `NoNewPrivileges`). Riesgo residual: `--no-sandbox` como root. Para escala real → mover a VPS aislado / usuario sin privilegios. |
| 3 | **Prompt injection** — un sitio con texto tipo "ignora tus instrucciones" para manipular a un LLM | Cubierto por diseño: el motor es DETERMINISTA (curl/grep, sin IA). El informe solo contiene textos predefinidos + títulos de una lista fija; NUNCA se vuelca contenido crudo del sitio. El único dato del sitio que va al texto (X-Powered-By) se sanitiza (`tr -cd`, 40 chars). |
| 4 | **Agotamiento de recursos** — sitio o repo gigante | curl `--max-filesize 10MB` + `--max-time 25` + `--max-redirs 5`; git clone `--depth 1 --no-tags` sin submódulos + `timeout 90`. |
| 5 | **Ejecución de código de repos ajenos** | El repo se clona en dir temporal, se corre solo gitleaks (lectura), NUNCA se ejecuta su código; se borra al terminar. |
| 6 | **Shell injection vía URL** | La URL va siempre entre comillas a curl; a Python/subprocess como argv (sin shell); el SLUG del path filtra a `[A-Za-z0-9-]`. El pipeline pasa la URL como argumento de lista (`subprocess.run([...])`), sin shell. |
| 7 | **Fuga de datos de clientes** | `informes/` y `pipeline/.env` y `scans.db` gitignoreados. Credenciales solo en `.env` (chmod 600). |

## Reglas al modificar

- Todo dato que provenga del sitio/URL/repo del cliente es UNTRUSTED. No pasarlo a un shell,
  ni a un LLM como instrucción, ni al informe sin sanitizar.
- El motor NO debe volverse "inteligente" (usar un LLM sobre el contenido del sitio) sin
  antes resolver el prompt-injection: el contenido del cliente jamás es instrucción.
- Cualquier request nuevo (no solo el inicial) debe pasar por el guard SSRF si el host
  puede cambiar (redirects a hosts nuevos). Hoy acotamos con `--max-redirs 5`.
- Para producción a escala: el clon+scan de repos ajenos va en VPS aislado, no en el server
  de casa (ver memoria `project-auditorias-vibecoding-idea`).
