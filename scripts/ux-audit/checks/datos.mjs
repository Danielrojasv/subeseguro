// checks/datos.mjs — convierte el veredicto de verificar-datos.mjs en hallazgos.
//
// Esta capa NO hace la consulta (eso vive en verificar-datos.mjs, con sus
// candados). Solo traduce el resultado ya obtenido a lenguaje de informe. Es
// pura y testeable como todas las demás.

import { finding } from '../lib.mjs';

export function chequearDatos(verificacion) {
  const out = [];
  if (!verificacion) return out;

  // La clave de servicio a la vista es crítica por sí sola, sin tocar la base.
  if (verificacion.claveDeServicio) {
    out.push(finding('datos', 'critico', 'Tu clave de administrador está en el código del navegador',
      'Encontramos una clave de servicio (service_role) en el código que se envía al navegador. ' +
      'Esa clave se salta todas las reglas de acceso: quien la copie con F12 puede leer, cambiar y borrar ' +
      'toda tu base de datos, sin límite. Hay que rotarla ya y dejar en el navegador solo la clave pública (anon).'));
  }

  const sb = verificacion.supabase;
  if (sb?.tablasAbiertas?.length) {
    out.push(finding('datos', 'critico', 'Cualquiera puede leer tu base de datos',
      `Probamos tu base con la misma clave pública que está en tu código y respondió datos sin pedir permiso. ` +
      `${sb.tablasAbiertas.length === 1 ? 'Una tabla queda' : `${sb.tablasAbiertas.length} tablas quedan`} ` +
      'abierta a cualquiera que tenga el link de tu app. Es la fuga más común en apps hechas con IA y se ' +
      'arregla activando Row Level Security en Supabase y escribiendo una política por tabla.',
      sb.tablasAbiertas));
  } else if (sb && sb.tablasVisibles > 0 && sb.tablasAbiertas && sb.tablasAbiertas.length === 0) {
    out.push(finding('datos', 'info', 'Tu base de datos rechazó el acceso anónimo',
      'Probamos leer tus tablas con la clave pública y la base respondió que no. Eso es lo correcto: ' +
      'quiere decir que tienes reglas de acceso activadas. Buena señal.'));
  } else if (sb?.incompleto) {
    out.push(finding('datos', 'info', 'Usas Supabase',
      'Detectamos Supabase pero no pudimos verificar el acceso automáticamente. Revisa que todas tus tablas ' +
      'tengan Row Level Security activado, que es la causa número uno de fugas de datos en apps hechas con IA.'));
  }

  const fb = verificacion.firebase;
  if (fb?.abierta) {
    out.push(finding('datos', 'critico', 'Tu base de Firebase está abierta',
      'Tu base de datos en tiempo real de Firebase respondió datos a una consulta sin autenticación. ' +
      'Cualquiera con el link puede leer, y según tus reglas quizás también escribir. ' +
      'Se arregla en las Rules de Firebase, exigiendo autenticación para leer y escribir.'));
  }

  return out;
}
