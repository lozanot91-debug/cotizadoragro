// Edge function: resumen semanal por notificación push.
// - La tarea programada (lunes 8:00) la llama con el secreto de los avisos (x-webhook-secreto) → a todos.
// - Un usuario logueado puede pedirse una prueba ({ prueba: true }) → solo a él.
// Al tocar la notificación se abre la pantalla "Resumen semanal" de la app.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { armarResumen, textoNotificacion } from './resumen.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const respuesta = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

function iguales(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
const hoyAR = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return respuesta({ error: 'Método no permitido' }, 405);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: cfg, error: errCfg } = await db.rpc('push_config');
  if (errCfg || !cfg?.push_vapid_privada) return respuesta({ error: 'Falta la configuración de push' }, 500);

  let soloUsuario: string | null = null;
  const secreto = req.headers.get('x-webhook-secreto');
  if (secreto) {
    if (!iguales(secreto, cfg.push_webhook_secreto || '')) return respuesta({ error: 'No autorizado' }, 401);
  } else {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return respuesta({ error: 'Hace falta iniciar sesión' }, 401);
    const { data: quien } = await db.auth.getUser(token);
    if (!quien?.user) return respuesta({ error: 'Hace falta iniciar sesión' }, 401);
    soloUsuario = quien.user.id;
  }

  const hoy = hoyAR();
  const desdeIso = new Date(Date.parse(hoy + 'T03:00:00Z') - 9 * 86400_000).toISOString();
  const [{ data: cots, error: e1 }, { data: cambios, error: e2 }, { data: cobros, error: e3 }] = await Promise.all([
    db.from('cotizaciones').select('id, fecha, estado, subtotal_usd, ganado_usd, vigencia_dias, cliente_nombre, numero, numero_cliente, motivo_perdida').limit(20000),
    db.from('historial_cambios').select('cotizacion_id, valor_nuevo, created_at').eq('tipo', 'estado').gte('created_at', desdeIso).limit(20000),
    db.from('cobranzas').select('vencimiento, monto_usd, estado').eq('estado', 'Pendiente').limit(20000),
  ]);
  if (e1 || e2 || e3) return respuesta({ error: (e1 || e2 || e3)!.message }, 500);

  const r = armarResumen(hoy, (cots || []).map((c) => ({ ...c, subtotal_usd: Number(c.subtotal_usd) || 0, ganado_usd: c.ganado_usd === null ? null : Number(c.ganado_usd) })), cambios || [], (cobros || []).map((c) => ({ ...c, monto_usd: Number(c.monto_usd) || 0 })));
  const { titulo, cuerpo } = textoNotificacion(r);

  let q = db.from('push_suscripciones').select('id, endpoint, p256dh, auth');
  if (soloUsuario) q = q.eq('usuario_id', soloUsuario);
  const { data: subs } = await q;
  if (!subs?.length) return respuesta({ enviados: 0, motivo: soloUsuario ? 'No tenés los avisos activados en este dispositivo' : 'Nadie tiene los avisos activados', titulo, cuerpo });

  webpush.setVapidDetails('mailto:lozanot91@gmail.com', cfg.push_vapid_publica, cfg.push_vapid_privada);
  const payload = JSON.stringify({ titulo, cuerpo, pantalla: 'resumen', tag: 'resumen-semanal' });
  let enviados = 0;
  const vencidas: string[] = [];
  const errores: string[] = [];
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24 * 2 });
      enviados++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) vencidas.push(s.id);
      else errores.push(`${status ?? ''} ${(e as Error).message}`.trim());
    }
  }));
  if (vencidas.length) await db.from('push_suscripciones').delete().in('id', vencidas);
  if (errores.length) console.error('resumen-semanal:', errores);
  return respuesta({ enviados, borradas: vencidas.length, errores, titulo, cuerpo });
});
