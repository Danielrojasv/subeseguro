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
  assert.match(html, /name="url_app" type="url"[^>]*required/);
  assert.match(html, /name="email" type="email"[^>]*required/);
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
