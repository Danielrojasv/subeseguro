"""Tests del correo al cliente. Corre: python pipeline/test_run.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pipeline.run import CLIENT_BODY

def test_client_body_pide_invitar_cuenta_revisor():
    # el correo debe decirle al cliente a QUÉ cuenta dar acceso read-only
    assert "subeseguro-revisor" in CLIENT_BODY
    assert "solo lectura" in CLIENT_BODY

def test_client_body_ofrece_pago_manual():
    # Lemon Squeezy rechazó la tienda (26-jul-2026): el pago del informe
    # completo se coordina respondiendo el correo, sin link de checkout
    assert "US$29" in CLIENT_BODY
    assert "quiero el informe completo" in CLIENT_BODY
    assert "datos de pago" in CLIENT_BODY
    assert "lemonsqueezy" not in CLIENT_BODY

if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_"):
            fn()
            print(f"ok {name}")
    print("todos los tests pasaron")
