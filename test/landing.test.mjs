import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const gracias = readFileSync(join(root, 'gracias/index.html'), 'utf8');

test('el formulario apunta a formsubmit y redirige a /gracias/', () => {
  assert.match(html, /action="https:\/\/formsubmit\.co\/[^"]+"/);
  assert.match(html, /name="_next" value="https:\/\/[^"]+\/gracias\/"/);
});

test('campos requeridos del embudo: url de la app y email', () => {
  // url_app va como type="text": type="url" bloquea el envío si el usuario
  // escribe "miapp.vercel.app" sin https:// (hallazgo UX 26-jul, mata
  // conversión mobile); el esquema lo completa el script antes de enviar
  assert.match(html, /name="url_app" type="text"[^>]*inputmode="url"[^>]*required/);
  assert.match(html, /name="email" type="email"[^>]*required/);
});

test('el script normaliza URLs sin esquema antes de enviar', () => {
  assert.match(html, /\^https\?:\\\/\\\//);
  assert.match(html, /'https:\/\/' \+ v/);
});

test('sin rayas largas en la prosa (regla anti-tells de IA)', () => {
  assert.ok(!html.includes('—'), 'index.html no debe tener em dash');
  assert.ok(!gracias.includes('—'), 'gracias no debe tener em dash');
});

test('el repo es opcional (sin required)', () => {
  const repoField = html.match(/<input[^>]*name="repo"[^>]*>/)[0];
  assert.ok(!repoField.includes('required'));
});

test('anti-spam: honeypot presente y captcha desactivado a propósito', () => {
  assert.match(html, /name="_honey"/);
  assert.match(html, /name="_captcha" value="false"/);
});

test('Veta: tokens.css vendorizado y linkeado, Roboto 300/400, sin bold', () => {
  assert.ok(existsSync(join(root, 'tokens.css')));
  assert.match(html, /<link rel="stylesheet" href="tokens\.css">/);
  assert.match(html, /Roboto:wght@300;400/);
  assert.ok(!/font-weight:\s*(700|bold)/.test(html), 'no debe haber bold');
});

test('sin emojis en la UI (regla Veta)', () => {
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  assert.ok(!emoji.test(html), 'index.html no debe tener emojis');
  assert.ok(!emoji.test(gracias), 'gracias no debe tener emojis');
});

test('el informe de ejemplo existe y está linkeado', () => {
  assert.ok(existsSync(join(root, 'informe/reporte-ejemplo.pdf')));
  assert.match(html, /href="informe\/reporte-ejemplo\.pdf"/);
});

test('los tres tiers de precio están presentes', () => {
  assert.match(html, /Gratis/);
  assert.match(html, /US\$29/);
  assert.match(html, /desde US\$149/);
});

test('página de gracias promete el plazo del informe', () => {
  assert.match(gracias, /48 horas/);
});

test('logo integrado: assets presentes y referenciados', () => {
  for (const f of ['assets/logo.png', 'assets/favicon-32.png', 'assets/apple-touch-icon.png', 'informe/logo.png'])
    assert.ok(existsSync(join(root, f)), `falta ${f}`);
  assert.match(html, /assets\/favicon-32\.png/);
  assert.match(html, /<img src="assets\/logo\.png" alt="SubeSeguro"/);
});

test('mobile: inputs a 16px (sin zoom iOS), teclados optimizados y theme-color', () => {
  assert.match(html, /form input,form select\{[^}]*font-size:1rem/);
  assert.match(html, /name="email"[^>]*autocomplete="email"/);
  assert.match(html, /name="url_app"[^>]*inputmode="url"/);
  assert.match(html, /<meta name="theme-color" content="#FAF6EE">/);
  assert.match(html, /@media \(max-width:640px\)/);
});

test('Nielsen H1: feedback de estado al enviar el formulario', () => {
  assert.match(html, /Enviando tu app/);
  assert.match(html, /b\.disabled = true/);
});

test('motor de revisión: scripts presentes y ejecutables', () => {
  for (const f of ['scripts/revisar.sh', 'scripts/informe.typ', 'scripts/generar-informe.sh'])
    assert.ok(existsSync(join(root, f)), `falta ${f}`);
});

test('formulario apunta al correo de soporte de Veta', () => {
  assert.match(html, /formsubmit\.co\/soporte\.vetastudios@gmail\.com/);
});

test('motor: revisar.sh es un wrapper del motor master-audit (no duplica chequeos)', () => {
  const sh = readFileSync(join(root, 'scripts/revisar.sh'), 'utf8');
  assert.match(sh, /MASTER_AUDIT_BIN:-\/opt\/master-audit\/bin\/master-audit/);
  assert.match(sh, /--out=\$OUT/);
  assert.match(sh, /--allow-local/);        // solo con SUBESEGURO_ALLOW_LOCAL=1
  assert.match(sh, /MASTER_AUDIT_UA="SubeSeguroBot/);
  assert.match(sh, /store\.py" save/);       // la persistencia es del producto
  assert.doesNotMatch(sh, /ssrf_ok|addsec|check_path/, 'los chequeos viven en master-audit');
  assert.match(sh, /exit \$rc/);            // respeta los códigos del motor (0/3/4)
});

test('motor: el motor master-audit está instalado y conserva los guards', () => {
  const engine = process.env.MASTER_AUDIT_BIN || '/opt/master-audit/bin/master-audit';
  if (!existsSync(engine)) return;          // CI ajeno sin el motor: no inventar
  const sh = readFileSync(engine, 'utf8');
  assert.match(sh, /ssrf_ok/);
  assert.match(sh, /100\.64\.0\.0\/10/);
  assert.match(sh, /"accesible": False/);
  assert.match(sh, /"conteo":/);
  const typ = readFileSync(join(root, 'scripts/informe.typ'), 'utf8');
  assert.match(typ, /No pudimos acceder a tu app/);
});

test('informe: teaser del candado con conteo real', () => {
  const typ = readFileSync(join(root, 'scripts/informe.typ'), 'utf8');
  assert.match(typ, /hallazgo\(s\) más/);
  assert.match(typ, /restantes/);
});

test('persistencia: store.py existe con save/fresh/comunes', () => {
  const py = readFileSync(join(root, 'scripts/store.py'), 'utf8');
  for (const cmd of ['def save', 'def fresh', 'def comunes'])
    assert.ok(py.includes(cmd), `falta ${cmd}`);
});

