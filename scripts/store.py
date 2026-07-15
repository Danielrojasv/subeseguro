#!/usr/bin/env python3
"""Persistencia de scans de SubeSeguro en SQLite.

Dos usos (idea de Daniel):
  1. Cache: no re-escanear la misma URL si ya la vimos hace poco.
  2. Analítica: qué hallazgos son los más comunes (oro para posts y para priorizar).

Uso:
  store.py save <hallazgos.json>       guarda el scan
  store.py fresh <url> [horas]         imprime la ruta del scan cacheado si es < horas (default 24), si no nada
  store.py comunes [n]                 ranking de los N hallazgos más frecuentes
  store.py resumen                     totales (scans, apps únicas, promedio de hallazgos)

La DB vive en informes/scans.db (gitignoreada — tiene URLs de clientes).
No usamos timestamps del sistema en el import global (regla del entorno); la fecha
se pasa/lee vía SQLite CURRENT_TIMESTAMP, que corre en el motor de la DB.
"""
import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "informes" / "scans.db"


def conn():
    DB.parent.mkdir(exist_ok=True)
    c = sqlite3.connect(DB)
    c.execute("""CREATE TABLE IF NOT EXISTS scans(
        id INTEGER PRIMARY KEY,
        url TEXT NOT NULL,
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        accesible INTEGER,
        total INTEGER, n_seguridad INTEGER, n_experiencia INTEGER,
        hallazgos_json TEXT)""")
    c.execute("""CREATE TABLE IF NOT EXISTS hallazgos(
        scan_id INTEGER, categoria TEXT, severidad TEXT, titulo TEXT,
        FOREIGN KEY(scan_id) REFERENCES scans(id))""")
    c.execute("CREATE INDEX IF NOT EXISTS ix_scans_url ON scans(url)")
    c.execute("CREATE INDEX IF NOT EXISTS ix_hall_titulo ON hallazgos(titulo)")
    return c


def slug(url: str) -> str:
    import re
    return re.sub(r"[^a-zA-Z0-9]+", "-", re.sub(r"^https?://", "", url)).strip("-")[:60]


def save(path: str):
    d = json.loads(Path(path).read_text())
    c = conn()
    cnt = d.get("conteo", {})
    cur = c.execute(
        "INSERT INTO scans(url,accesible,total,n_seguridad,n_experiencia,hallazgos_json) VALUES(?,?,?,?,?,?)",
        (d["url"], 1 if d.get("accesible", True) else 0, cnt.get("total", len(d["hallazgos"])),
         cnt.get("seguridad", 0), cnt.get("experiencia", 0), json.dumps(d, ensure_ascii=False)))
    sid = cur.lastrowid
    for h in d["hallazgos"]:
        c.execute("INSERT INTO hallazgos(scan_id,categoria,severidad,titulo) VALUES(?,?,?,?)",
                  (sid, h.get("categoria", "seguridad"), h["severidad"], h["titulo"]))
    c.commit(); c.close()
    print(f"[store] guardado scan #{sid} de {d['url']}")


def fresh(url: str, horas: float = 24.0):
    """Si hay un scan de esa URL más nuevo que `horas`, imprime la ruta de su informe."""
    c = conn()
    row = c.execute(
        "SELECT id, (julianday('now')-julianday(fecha))*24 AS h FROM scans "
        "WHERE url=? ORDER BY fecha DESC LIMIT 1", (url,)).fetchone()
    c.close()
    if row and row[1] is not None and row[1] < horas:
        pdf = ROOT / "informes" / slug(url) / "informe.pdf"
        if pdf.exists():
            print(str(pdf))


def comunes(n: int = 20):
    c = conn()
    rows = c.execute(
        "SELECT titulo, categoria, COUNT(*) n FROM hallazgos GROUP BY titulo "
        "ORDER BY n DESC LIMIT ?", (n,)).fetchall()
    total = c.execute("SELECT COUNT(DISTINCT url) FROM scans").fetchone()[0] or 0
    c.close()
    print(f"Hallazgos más comunes ({total} apps revisadas):")
    for titulo, cat, cnt in rows:
        pct = f"{cnt/total*100:.0f}%" if total else "-"
        print(f"  {cnt:>3}  {pct:>4}  [{cat}] {titulo}")


def resumen():
    c = conn()
    scans = c.execute("SELECT COUNT(*) FROM scans").fetchone()[0]
    apps = c.execute("SELECT COUNT(DISTINCT url) FROM scans").fetchone()[0]
    prom = c.execute("SELECT AVG(total) FROM scans WHERE accesible=1").fetchone()[0] or 0
    c.close()
    print(f"scans: {scans} · apps únicas: {apps} · promedio hallazgos/app: {prom:.1f}")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "resumen"
    if cmd == "save":
        save(sys.argv[2])
    elif cmd == "fresh":
        fresh(sys.argv[2], float(sys.argv[3]) if len(sys.argv) > 3 else 24.0)
    elif cmd == "comunes":
        comunes(int(sys.argv[2]) if len(sys.argv) > 2 else 20)
    else:
        resumen()
