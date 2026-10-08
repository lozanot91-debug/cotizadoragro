// Edge function: dólar divisa del Banco Nación.
// Devuelve la última cotización guardada; si tiene más de 30 minutos (o se pide `forzar`), vuelve a leer
// bna.com.ar, la guarda en `tipo_cambio_bna` y devuelve la nueva. Si el BNA no responde, devuelve la
// última guardada marcada como desactualizada. Requiere un usuario logueado (verify_jwt).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { parsearDivisaBNA } from './parser.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};
const VIGENCIA_CACHE_MIN = 30;

function json(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

async function leerBNA() {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const r = await fetch('https://www.bna.com.ar/Personas', {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (cotizador Ceres Tolvas)', 'Accept': 'text/html' },
    });
    if (!r.ok) throw new Error(`El BNA respondió ${r.status}`);
    return parsearDivisaBNA(await r.text());
  } finally {
    clearTimeout(t);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  // verify_jwt deja pasar la clave pública (anon): además se exige un usuario logueado de verdad
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: quien } = await db.auth.getUser(token);
  if (!quien?.user) return json({ error: 'Hace falta iniciar sesión' }, 401);

  let forzar = false;
  if (req.method === 'POST') {
    try { forzar = !!(await req.json())?.forzar; } catch { /* sin cuerpo */ }
  }

  const { data: ultima } = await db
    .from('tipo_cambio_bna').select('fecha, compra, venta, obtenido_at')
    .order('fecha', { ascending: false }).limit(1).maybeSingle();

  const edadMin = ultima ? (Date.now() - new Date(ultima.obtenido_at).getTime()) / 60_000 : Infinity;
  if (ultima && !forzar && edadMin < VIGENCIA_CACHE_MIN) {
    return json({ ...ultima, desactualizado: false });
  }

  try {
    const d = await leerBNA();
    const fila = { fecha: d.fecha, compra: d.compra, venta: d.venta, obtenido_at: new Date().toISOString() };
    const { error } = await db.from('tipo_cambio_bna').upsert(fila, { onConflict: 'fecha' });
    if (error) throw new Error(`No se pudo guardar: ${error.message}`);
    return json({ ...fila, desactualizado: false });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('tc-bna:', msg);
    if (ultima) return json({ ...ultima, desactualizado: true, error: msg });
    return json({ error: msg }, 502);
  }
});
