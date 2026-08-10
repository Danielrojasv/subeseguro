#!/usr/bin/env node
// cli.mjs — auditoría de experiencia desde la terminal.
//
// Los tres usos previstos:
//   node scripts/ux-audit/cli.mjs https://app-del-cliente.com          (motor)
//   node scripts/ux-audit/cli.mjs http://localhost:8080                (mientras construyes)
//   node scripts/ux-audit/cli.mjs http://localhost:8080 --fail-on=alto (puerta de CI)
//
// Salidas: texto legible por defecto, --json para el pipeline.

import { writeFileSync, mkdirSync } from 'node:fs';
import { auditar } from './index.mjs';
import { generarHoja } from './hoja.mjs';

const ORDEN = { critico: 0, alto: 1, medio: 2, bajo: 3, info: 4 };
const ETIQUETA = { critico: 'CRÍTICO', alto: 'ALTO', medio: 'MEDIO', bajo: 'BAJO', info: 'NOTA' };

function parseArgs(argv) {
  const opts = { url: null, json: false, out: null, shotsDir: null, failOn: null, timeout: 30000, hoja: null };
  for (const a of argv) {
    if (a === '--json') opts.json = true;
    else if (a.startsWith('--out=')) opts.out = a.slice(6);
    else if (a.startsWith('--hoja=')) opts.hoja = a.slice(7);
    else if (a.startsWith('--shots=')) opts.shotsDir = a.slice(8);
    else if (a.startsWith('--fail-on=')) opts.failOn = a.slice(10);
    else if (a.startsWith('--timeout=')) opts.timeout = Number(a.slice(10)) || 30000;
    else if (!a.startsWith('-')) opts.url = a;
  }
  return opts;
}

function uso() {
  console.error(`uso: cli.mjs <url> [--json] [--out=archivo.json] [--shots=dir] [--fail-on=alto] [--timeout=ms]

  --json          imprime los hallazgos como JSON en vez de texto
  --out=archivo   escribe el JSON completo a un archivo
  --hoja=archivo  escribe la hoja de la revisión senior (lo que no se automatiza)
  --shots=dir     guarda screen-mobile.png y screen-desktop.png en ese directorio
  --fail-on=sev   sale con código 1 si hay algún hallazgo de esa severidad o peor
                  (critico, alto, medio, bajo)`);
}

function imprimir(res) {
  console.log(`\n  Auditoría de experiencia — ${res.url}`);
  if (!res.hallazgos.length) {
    console.log('\n  Sin hallazgos. La pasada automática no encontró nada que arreglar.\n');
    return;
  }
  const porCapa = {};
  for (const h of res.hallazgos) (porCapa[h.capa] ||= []).push(h);

  for (const [capa, items] of Object.entries(porCapa)) {
    console.log(`\n  ${capa.toUpperCase()}`);
    for (const h of items) {
      console.log(`    [${ETIQUETA[h.severidad] || h.severidad}] ${h.titulo}`);
      console.log(`        ${h.detalle}`);
      for (const e of (h.evidencia || [])) console.log(`        · ${e}`);
    }
  }
  const s = res.resumen.porSeveridad;
  const linea = Object.keys(ORDEN).filter((k) => s[k]).map((k) => `${s[k]} ${k}`).join(', ');
  console.log(`\n  Total ${res.resumen.total} hallazgos (${linea})\n`);
}

const opts = parseArgs(process.argv.slice(2));
if (!opts.url) { uso(); process.exit(2); }
if (!/^https?:\/\//i.test(opts.url)) opts.url = 'http://' + opts.url;
if (opts.shotsDir) mkdirSync(opts.shotsDir, { recursive: true });

let res;
try {
  res = await auditar(opts.url, { timeout: opts.timeout, shotsDir: opts.shotsDir });
} catch (e) {
  console.error(`[ux-audit] no se pudo auditar ${opts.url}: ${e.message}`);
  process.exit(3);
}

// el snapshot crudo pesa cientos de KB; solo se escribe si lo piden explícito
const { snapshots, ...publico } = res;
if (opts.out) writeFileSync(opts.out, JSON.stringify(publico, null, 2));
if (opts.hoja) writeFileSync(opts.hoja, generarHoja(res.url, res.hallazgos));
if (opts.json) console.log(JSON.stringify(publico, null, 2));
else imprimir(res);

if (opts.failOn) {
  const tope = ORDEN[opts.failOn];
  if (tope === undefined) { console.error(`[ux-audit] severidad desconocida: ${opts.failOn}`); process.exit(2); }
  const peores = res.hallazgos.filter((h) => (ORDEN[h.severidad] ?? 9) <= tope);
  if (peores.length) {
    console.error(`[ux-audit] ${peores.length} hallazgo(s) de severidad ${opts.failOn} o peor`);
    process.exit(1);
  }
}
