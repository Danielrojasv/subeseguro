"""Parseo del correo de formsubmit → datos de la solicitud de revisión.

formsubmit.co reenvía cada envío del formulario como un correo (plantilla 'table').
Extraemos de forma tolerante: URL de la app (requerida), repo (opcional) y el
correo del cliente al que hay que responder. No dependemos del orden ni del HTML
exacto: buscamos por etiqueta de campo y caemos a heurística (primera URL / primer
email plausible) si el formato cambia.
"""
from __future__ import annotations

import re
from html import unescape

# nombres de los campos del formulario (ver index.html)
FIELD_ALIASES = {
    "url_app": ("url_app", "url de tu app", "url de la app", "url"),
    "repo": ("repo", "repositorio", "link del repositorio"),
    "email": ("email", "correo", "tu correo"),
    "preocupacion": ("preocupacion", "preocupación", "qué te preocupa", "que te preocupa"),
}

_URL_RE = re.compile(r"https?://[^\s\"'<>)]+", re.I)
_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")


def _strip_html(text: str) -> str:
    text = re.sub(r"(?is)<(script|style).*?</\1>", " ", text)
    text = re.sub(r"(?is)<br\s*/?>", "\n", text)
    text = re.sub(r"(?is)</(tr|p|div|td|th)>", "\n", text)
    text = re.sub(r"(?is)<[^>]+>", " ", text)
    return unescape(text)


def _find_by_label(text: str, aliases: tuple[str, ...]) -> str | None:
    """Busca 'etiqueta: valor' en la misma línea, o el valor en la línea siguiente
    (caso tabla HTML, donde </td> deja etiqueta y valor en renglones separados)."""
    lines = [ln.strip() for ln in text.splitlines()]
    for i, line in enumerate(lines):
        low = line.lower()
        for alias in aliases:
            idx = low.find(alias)
            if idx == -1:
                continue
            # el resto del texto tras la etiqueta debe empezar donde está la etiqueta
            # (evita matchear 'email' dentro de otra palabra al final de la línea)
            rest = line[idx + len(alias):].lstrip(" :\t|-–—").strip()
            if rest:
                return rest
            # etiqueta sola → tomar la siguiente línea no vacía que no sea otra etiqueta
            for j in range(i + 1, min(i + 3, len(lines))):
                nxt = lines[j].strip()
                if nxt:
                    return nxt
    return None


_STRONG_RE = re.compile(r"<strong>\s*(.*?)\s*</strong>", re.I | re.S)
_PRE_RE = re.compile(r"<pre[^>]*>(.*?)</pre>", re.I | re.S)


def _parse_formsubmit_table(raw_body: str) -> dict:
    """Formato real de formsubmit: cada campo es <strong>etiqueta</strong> en una
    celda y <pre>valor</pre> en la siguiente. Emparejamos por orden (el header usa
    <th>, no <strong>, así que los <strong> son solo etiquetas de campo)."""
    labels = [unescape(l).strip().lower() for l in _STRONG_RE.findall(raw_body)]
    values = [unescape(v).strip() for v in _PRE_RE.findall(raw_body)]
    if not labels or not values:
        return {}
    # zip corta en el más corto: un <strong> extra del footer no rompe el emparejamiento
    out = {}
    for lab, val in zip(labels, values):
        for canon, aliases in FIELD_ALIASES.items():
            if lab in aliases:
                out[canon] = val
    return out


def parse_submission(raw_body: str) -> dict:
    """Devuelve {url, repo, email, preocupacion, ok, motivo}.

    ok=False si falta la URL o el email del cliente (no se puede responder).
    """
    # 1) formato tabla de formsubmit (el real): etiqueta <strong> + valor <pre>
    tbl = _parse_formsubmit_table(raw_body)

    text = _strip_html(raw_body)

    # 2) parseo por etiqueta línea a línea (respaldo para texto plano)
    url = tbl.get("url_app") or _find_by_label(text, FIELD_ALIASES["url_app"])
    repo = tbl.get("repo") or _find_by_label(text, FIELD_ALIASES["repo"])
    email = tbl.get("email") or _find_by_label(text, FIELD_ALIASES["email"])
    preoc = tbl.get("preocupacion") or _find_by_label(text, FIELD_ALIASES["preocupacion"])

    # normalizar: quedarnos solo con el token válido dentro del valor
    def _clean_url(v: str | None) -> str | None:
        if not v:
            return None
        m = _URL_RE.search(v)
        return m.group(0).rstrip(".,;)") if m else None

    def _clean_email(v: str | None) -> str | None:
        if not v:
            return None
        m = _EMAIL_RE.search(v)
        return m.group(0) if m else None

    url = _clean_url(url)
    repo = _clean_url(repo)
    email = _clean_email(email)

    # heurística de respaldo si el parseo por etiqueta falló
    if not url:
        urls = [u.rstrip(".,;)") for u in _URL_RE.findall(text)]
        # la primera URL que no sea de formsubmit/unsubscribe
        for u in urls:
            if "formsubmit" not in u and "unsubscribe" not in u.lower():
                url = u
                break
    if not email:
        emails = [e for e in _EMAIL_RE.findall(text)
                  if "formsubmit" not in e and "subeseguro" not in e and "vetastudios" not in e]
        email = emails[0] if emails else None

    ok = bool(url and email)
    motivo = "" if ok else ("falta URL de la app" if not url else "falta correo del cliente")
    return {"url": url, "repo": repo, "email": email,
            "preocupacion": preoc, "ok": ok, "motivo": motivo}
