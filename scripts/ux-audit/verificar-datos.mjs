// verificar-datos.mjs — verificación AUTORIZADA de base de datos abierta.
//
// ============================================================================
// ESTE MÓDULO CRUZA LA LÍNEA DE "SOLO PASIVO". LEER ANTES DE TOCARLO.
// ============================================================================
//
// El resto del motor solo observa. Esto pregunta. Para saber si un Supabase o
// un Firebase quedó sin reglas de acceso, hay que hacerle una consulta con la
// clave pública que la propia app ya publica en su JavaScript. No hay otra
// forma de saberlo, y es la causa número uno de fugas en apps hechas con IA.
//
// Por eso viene con candados, y ninguno es opcional:
//
//   1. APAGADO POR DEFECTO. Solo corre con verificarDatos:true, que hoy solo
//      se pasa a mano desde la CLI (--verificar-datos) para las revisiones
//      internas. El camino público (revisar.sh, pipeline) NO lo activa. Se
//      activará cuando el formulario tenga el permiso explícito del dueño.
//   2. NADA ADIVINADO. Solo la URL y la clave que ya están expuestas en el
//      código del propio sitio. No se prueban proyectos, tablas ni claves que
//      no hayan salido de ahí.
//   3. SOLO LECTURA Y ACOTADO. GET con límite de una fila, tope de consultas,
//      timeout corto. Nunca escribir, nunca borrar, nunca enumerar de más.
//   4. NO SE GUARDA NADA. La respuesta se mira para saber si vino vacía o con
//      datos, y se bota. Al informe solo llega el veredicto y el nombre de la
//      tabla, sanitizado. Jamás un dato del cliente.
//
// Además: si lo expuesto es una clave de servicio (service_role) en vez de la
// anónima, NO se usa para nada. Eso ya es crítico por sí solo y se reporta sin
// tocar la base.

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const TOPE_CONSULTAS = 5;
const TIMEOUT_MS = 8000;
const MAX_TABLAS = 4;

/** Decodifica el payload de un JWT sin validar firma. Solo para leer el rol. */
export function rolDeClave(jwt) {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64').toString('utf8'));
    return payload.role || null;
  } catch {
    return null;
  }
}

/**
 * Saca de lo que el sitio ya publica las credenciales de su base.
 * Función pura: entra texto, salen credenciales. Testeable sin red.
 */
export function extraerCredenciales(texto = '') {
  const cred = { supabase: null, firebase: null, claveDeServicio: false };

  const jwts = texto.match(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g) || [];
  for (const jwt of jwts) {
    const rol = rolDeClave(jwt);
    if (rol === 'service_role') cred.claveDeServicio = true;
    if (rol === 'anon' && !cred.supabase) cred.supabase = { anon: jwt, url: null };
  }

  const url = texto.match(/https:\/\/([a-z0-9]{8,40})\.supabase\.co/i);
  if (url) {
    cred.supabase = cred.supabase || { anon: null, url: null };
    cred.supabase.url = `https://${url[1]}.supabase.co`;
  }
  if (cred.supabase && (!cred.supabase.url || !cred.supabase.anon)) {
    // sin los dos no se puede preguntar nada; se deja como señal, no como prueba
    cred.supabase.incompleto = true;
  }

  const rtdb = texto.match(/https:\/\/([a-z0-9-]{3,60})\.(firebaseio\.com|[a-z0-9-]+\.firebasedatabase\.app)/i);
  if (rtdb) cred.firebase = { url: rtdb[0] };

  return cred;
}

/** Guard SSRF: el host tiene que resolver a una IP pública.
 *  SUBESEGURO_ALLOW_LOCAL=1 lo relaja SOLO para pruebas propias, igual que en
 *  revisar.sh. Nunca setear esa variable en el camino público. */
async function esPublico(urlStr) {
  if (process.env.SUBESEGURO_ALLOW_LOCAL === '1') return true;
  try {
    const host = new URL(urlStr).hostname;
    const ip = isIP(host) ? host : (await lookup(host)).address;
    const privada = /^(10\.|127\.|169\.254\.|192\.168\.|0\.|::1|fc|fd)/i.test(ip)
      || /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
      || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip); // CGNAT / Tailscale
    return !privada;
  } catch {
    return false;
  }
}

async function pedir(url, headers, presupuesto) {
  if (presupuesto.usadas >= TOPE_CONSULTAS) return null;
  presupuesto.usadas++;
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'error' });
    return res;
  } catch {
    return null;
  }
}

/**
 * Verifica si la base responde datos a cualquiera.
 * Devuelve solo veredictos, NUNCA datos del cliente.
 */
export async function verificarDatos(texto) {
  const cred = extraerCredenciales(texto);
  const presupuesto = { usadas: 0 };
  const out = { corrio: true, claveDeServicio: cred.claveDeServicio, supabase: null, firebase: null };

  // ---- Supabase ----
  const sb = cred.supabase;
  if (sb && sb.url && sb.anon && await esPublico(sb.url)) {
    const headers = { apikey: sb.anon, Authorization: `Bearer ${sb.anon}` };
    const abiertas = [];
    let tablas = [];

    // El endpoint raíz de PostgREST lista las tablas visibles para ese rol.
    const raiz = await pedir(`${sb.url}/rest/v1/`, headers, presupuesto);
    if (raiz && raiz.ok) {
      try {
        const spec = await raiz.json();
        tablas = Object.keys(spec?.definitions || spec?.components?.schemas || {}).slice(0, MAX_TABLAS);
      } catch { /* respuesta que no es el spec esperado */ }
    }

    for (const tabla of tablas) {
      const res = await pedir(
        `${sb.url}/rest/v1/${encodeURIComponent(tabla)}?select=*&limit=1`, headers, presupuesto);
      if (!res || !res.ok) continue;
      try {
        const filas = await res.json();
        // Solo interesa si vino algo. El contenido se bota acá mismo.
        if (Array.isArray(filas) && filas.length > 0) abiertas.push(tabla);
      } catch { /* no era JSON */ }
    }

    out.supabase = {
      url: sb.url,
      tablasVisibles: tablas.length,
      tablasAbiertas: abiertas,
      consultas: presupuesto.usadas,
    };
  } else if (sb) {
    out.supabase = { detectado: true, incompleto: true };
  }

  // ---- Firebase Realtime Database ----
  if (cred.firebase && await esPublico(cred.firebase.url)) {
    const res = await pedir(`${cred.firebase.url}/.json?shallow=true&limitToFirst=1`, {}, presupuesto);
    if (res) {
      let abierta = false;
      if (res.ok) {
        try {
          const cuerpo = await res.json();
          abierta = cuerpo !== null && cuerpo !== undefined;
        } catch { /* noop */ }
      }
      out.firebase = { url: cred.firebase.url, abierta };
    }
  }

  return out;
}
