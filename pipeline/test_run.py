"""Tests del correo al cliente. Corre: python pipeline/test_run.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pipeline.run import CLIENT_BODY

def test_client_body_pide_invitar_cuenta_revisor():
    # el correo debe decirle al cliente a QUÉ cuenta dar acceso read-only
    assert "subeseguro-revisor" in CLIENT_BODY
    assert "solo lectura" in CLIENT_BODY

def test_client_body_mantiene_link_de_pago():
    assert "subeseguro.lemonsqueezy.com/checkout" in CLIENT_BODY

if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_"):
            fn()
            print(f"ok {name}")
    print("todos los tests pasaron")
