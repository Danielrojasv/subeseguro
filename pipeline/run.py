#!/usr/bin/env python3
"""Pipeline de SubeSeguro: lee Gmail, corre la revisión, entrega el informe.

Flujo por cada correo nuevo de formsubmit (asunto '[SubeSeguro] Nueva revisión...'):
  1. Parsear → url, repo, email del cliente
  2. Correr el motor determinista (scripts/generar-informe.sh) → PDF top-3
  3. Entregar:
       AUTO_SEND=0 (default, modo piloto): enviar el PDF a Daniel (OWNER_EMAIL) para
         que lo revise y lo reenvíe al cliente. Su firma es el producto.
       AUTO_SEND=1: enviar el PDF directo al cliente.
  4. Marcar el correo como leído (para no reprocesarlo) y respetar el tope diario.

Config en pipeline/.env (gitignoreado). Uso:
  python -m pipeline.run --once        # una pasada (para cron)
  python -m pipeline.run --dry-run     # no envía ni marca, solo muestra qué haría
  python -m pipeline.run --loop        # loop continuo (para systemd)
"""
from __future__ import annotations

import argparse
import email
import imaplib
import os
import smtplib
import ssl
import subprocess
import sys
import time
from datetime import date
from email.message import EmailMessage
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pipeline.parse import parse_submission

ROOT = Path(__file__).resolve().parent.parent
LOG = ROOT / "pipeline" / "pipeline.log"
STATE = ROOT / "pipeline" / "state"
STATE.mkdir(exist_ok=True)

SUBJECT_MATCH = "SubeSeguro"
IMAP_HOST = "imap.gmail.com"
SMTP_HOST = "smtp.gmail.com"


def cfg(key: str, default: str = "") -> str:
    return os.environ.get(key, default).strip()


def load_env() -> None:
    envf = ROOT / "pipeline" / ".env"
    if envf.exists():
        for line in envf.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


def log(msg: str) -> None:
    line = f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}"
    print(line, flush=True)
    with open(LOG, "a") as f:
        f.write(line + "\n")


def daily_count() -> int:
    marker = STATE / f"count-{date.today().isoformat()}"
    return int(marker.read_text()) if marker.exists() else 0


def bump_daily() -> None:
    marker = STATE / f"count-{date.today().isoformat()}"
    marker.write_text(str(daily_count() + 1))


def find_junk_folder(M: imaplib.IMAP4) -> str | None:
    """Ubica la carpeta de spam por el flag \\Junk (robusto al idioma/nombre)."""
    typ, boxes = M.list()
    if typ != "OK" or not boxes:
        return None
    for raw in boxes:
        line = raw.decode(errors="replace") if isinstance(raw, bytes) else str(raw)
        if "\\Junk" in line:
            # el nombre va entre comillas al final: ... "/" "[Gmail]/Spam"
            m = re.search(r'"([^"]+)"\s*$', line)
            if m:
                return m.group(1)
    # respaldo típico de Gmail
    return "[Gmail]/Spam"


def body_text(msg: email.message.Message) -> str:
    parts = []
    if msg.is_multipart():
        for p in msg.walk():
            ct = p.get_content_type()
            if ct in ("text/plain", "text/html"):
                try:
                    parts.append(p.get_payload(decode=True).decode(p.get_content_charset() or "utf-8", "replace"))
                except Exception:
                    pass
    else:
        try:
            parts.append(msg.get_payload(decode=True).decode(msg.get_content_charset() or "utf-8", "replace"))
        except Exception:
            parts.append(str(msg.get_payload()))
    return "\n".join(parts)


def run_engine(url: str, repo: str | None) -> Path | None:
    cmd = [str(ROOT / "scripts" / "generar-informe.sh"), url]
    if repo:
        cmd.append(repo)
    log(f"motor: {' '.join(cmd)}")
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if r.returncode != 0:
        log(f"motor FALLÓ: {r.stderr[-400:]}")
        return None
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", re.sub(r"^https?://", "", url)).strip("-")[:60]
    pdf = ROOT / "informes" / slug / "informe.pdf"
    return pdf if pdf.exists() else None


def send_mail(to_addr: str, subject: str, body: str, pdf: Path | None) -> None:
    user, pw = cfg("SMTP_USER"), cfg("SMTP_PASS")
    m = EmailMessage()
    m["From"] = f"SubeSeguro <{user}>"
    m["To"] = to_addr
    m["Subject"] = subject
    m["Reply-To"] = cfg("OWNER_EMAIL", user)
    m.set_content(body)
    if pdf and pdf.exists():
        m.add_attachment(pdf.read_bytes(), maintype="application", subtype="pdf",
                         filename="informe-subeseguro.pdf")
    ctx = ssl.create_default_context()
    with smtplib.SMTP_SSL(SMTP_HOST, 465, context=ctx) as s:
        s.login(user, pw)
        s.send_message(m)
    log(f"correo enviado a {to_addr}")


CLIENT_BODY = """Hola,

Gracias por enviar tu app a SubeSeguro. Adjuntamos tu informe gratuito con los
hallazgos más importantes de la revisión pre-lanzamiento (seguridad, deploy,
performance y experiencia de usuario), explicados en simple.

Si quieres el informe completo con todos los hallazgos y el paso a paso para
arreglarlos, lo puedes comprar aquí (US$29):
https://subeseguro.lemonsqueezy.com/checkout/buy/7108710e-5e74-4f3a-b96b-d621b7f4212a

Apenas nos llegue tu pago te escribimos para coordinar (si tu app tiene
repositorio, ahí te pedimos acceso de solo lectura). Y si prefieres que
apliquemos los arreglos puntuales del informe por ti (desde US$149), responde
este correo y lo vemos. Trabajo extra o hallazgos que requieran rediseñar
partes de la app se informan y se cotizan aparte, siempre antes de cobrarte.

Un abrazo,
El equipo de SubeSeguro
subeseguro.com
"""


def review_body(sub: dict) -> str:
    return (f"Nueva revisión lista para tu OK.\n\n"
            f"Cliente: {sub['email']}\n"
            f"App: {sub['url']}\n"
            f"Repo: {sub.get('repo') or '(no envió)'}\n"
            f"Le preocupa: {sub.get('preocupacion') or '-'}\n\n"
            f"Adjunto el PDF generado. Revísalo y, si está bien, reenvíalo a {sub['email']}.\n"
            f"Para enviar automático a futuro: AUTO_SEND=1 en pipeline/.env\n")


def process_once(dry: bool = False) -> int:
    load_env()
    user, pw = cfg("IMAP_USER") or cfg("SMTP_USER"), cfg("IMAP_PASS") or cfg("SMTP_PASS")
    if not user or not pw:
        log("falta IMAP_USER/IMAP_PASS en pipeline/.env — no puedo leer Gmail")
        return 1
    auto = cfg("AUTO_SEND", "0") == "1"
    limit = int(cfg("DAILY_LIMIT", "10"))
    owner = cfg("OWNER_EMAIL", user)

    M = imaplib.IMAP4_SSL(IMAP_HOST)
    M.login(user, pw)

    # Revisar INBOX Y la carpeta de spam: los correos de formsubmit a veces caen en
    # spam y el pipeline los perdería. Buscamos la carpeta \Junk sin fiarnos del nombre.
    folders = ["INBOX"]
    junk = find_junk_folder(M)
    if junk:
        folders.append(junk)

    done = 0
    for folder in folders:
        typ, _ = M.select(folder)
        if typ != "OK":
            continue
        typ, data = M.search(None, '(UNSEEN SUBJECT "SubeSeguro")')
        ids = data[0].split() if data and data[0] else []
        if ids:
            log(f"{len(ids)} solicitud(es) nueva(s) en {folder}")
        for num in ids:
            if daily_count() >= limit:
                log(f"tope diario ({limit}) alcanzado — el resto queda para mañana")
                break
            typ, md = M.fetch(num, "(RFC822)")
            msg = email.message_from_bytes(md[0][1])
            sub = parse_submission(body_text(msg))
            if not sub["ok"]:
                log(f"solicitud ilegible ({sub['motivo']}) — la dejo sin leer para revisar a mano")
                continue
            log(f"solicitud: {sub['url']} (cliente {sub['email']})")
            if dry:
                log("  [dry-run] no corro motor ni envío")
                continue

            pdf = run_engine(sub["url"], sub.get("repo"))
            if not pdf:
                log("  motor no generó PDF — la dejo para revisar a mano")
                continue

            if auto:
                send_mail(sub["email"], "Tu informe de SubeSeguro", CLIENT_BODY, pdf)
            else:
                send_mail(owner, f"[Revisar] {sub['url']}", review_body(sub), pdf)

            M.store(num, "+FLAGS", "\\Seen")   # marcar leído: no reprocesar
            bump_daily()
            done += 1

    M.logout()
    log(f"pasada lista: {done} procesada(s)")
    return 0


import re  # noqa: E402 (usado en run_engine)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--loop", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    if a.loop:
        load_env()
        interval = int(cfg("CHECK_INTERVAL", "300"))
        while True:
            try:
                process_once()
            except Exception as e:  # noqa: BLE001 — un fallo no debe matar el servicio
                log(f"error en pasada: {e}")
            time.sleep(interval)
    else:
        return process_once(dry=a.dry_run)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
