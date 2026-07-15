"""Tests del parser de correos formsubmit. Corre: python -m pytest pipeline/test_parse.py
o sin pytest: python pipeline/test_parse.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pipeline.parse import parse_submission

# fixture: correo formsubmit plantilla 'table' (HTML), como el que llega de verdad
FORMSUBMIT_HTML = """
<html><body>
<h2>Nueva revisión solicitada</h2>
<table>
<tr><td>url_app</td><td>https://mikiosco.vercel.app</td></tr>
<tr><td>repo</td><td>https://github.com/juan/kiosco</td></tr>
<tr><td>email</td><td>juan.perez@gmail.com</td></tr>
<tr><td>preocupacion</td><td>seguridad</td></tr>
</table>
<p>Sent from <a href="https://formsubmit.co">FormSubmit</a></p>
</body></html>
"""

FORMSUBMIT_PLAIN = """url_app: https://otraapp.netlify.app
email: maria@empresa.cl
preocupacion: deploy
Sent with FormSubmit.co
"""


def check(name, cond):
    print(("ok  " if cond else "FAIL") + " " + name)
    assert cond, name


def main():
    a = parse_submission(FORMSUBMIT_HTML)
    check("html: url", a["url"] == "https://mikiosco.vercel.app")
    check("html: repo", a["repo"] == "https://github.com/juan/kiosco")
    check("html: email cliente", a["email"] == "juan.perez@gmail.com")
    check("html: preocupacion", a["preocupacion"] == "seguridad")
    check("html: ok", a["ok"] is True)

    b = parse_submission(FORMSUBMIT_PLAIN)
    check("plain: url", b["url"] == "https://otraapp.netlify.app")
    check("plain: sin repo", b["repo"] is None)
    check("plain: email", b["email"] == "maria@empresa.cl")
    check("plain: ok", b["ok"] is True)

    # sin URL → no procesable
    c = parse_submission("email: solo@correo.com\nhola")
    check("falta url: ok=False", c["ok"] is False)
    check("falta url: motivo", "URL" in c["motivo"])

    # no confundir el correo de formsubmit/soporte con el del cliente
    d = parse_submission(
        "url_app: https://x.app\nemail: cliente@real.com\n"
        "Sent by no-reply@formsubmit.co to soporte.vetastudios@gmail.com")
    check("email: ignora formsubmit/soporte", d["email"] == "cliente@real.com")

    print("\nTODO OK")


if __name__ == "__main__":
    main()
