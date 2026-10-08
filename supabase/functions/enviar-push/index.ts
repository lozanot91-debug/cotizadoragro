// Edge function: manda la notificación push cuando la mesa de insumos responde un pedido de precios.
// La llama el trigger `pedidos_precio_avisar` (pg_net) con el secreto compartido en `x-webhook-secreto`.
// Avisa al vendedor de la cotización y a los admins; borra las suscripciones que ya no existen.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function respuesta(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

/** Compara sin cortar en el primer carácter distinto (evita adivinar el secreto por tiempo). */
function iguales(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return respuesta({ error: 'Método no permitido' }, 405);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const { data: cfg, error: errCfg } = await db.rpc('push_config');
  if (errCfg || !cfg?.push_vapid_privada) return respuesta({ error: 'Falta la configuración de push' }, 500);

  let pedidoId = '', tipo = '';
  try {
    const b = await req.json();
    pedidoId = String(b.pedido_id || '');
    tipo = String(b.tipo || '');
  } catch { /* cuerpo inválido */ }

  // Dos formas de llamarla: el trigger (con el secreto) o un usuario logueado que se manda una prueba a sí mismo
  let usuarioPrueba: string | null = null;
  if (tipo === 'prueba') {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: quien } = await db.auth.getUser(token);
    if (!quien?.user) return respuesta({ error: 'Hace falta iniciar sesión' }, 401);
    usuarioPrueba = quien.user.id;
  } else {
    if (!iguales(req.headers.get('x-webhook-secreto') || '', cfg.push_webhook_secreto || '')) {
      return respuesta({ error: 'No autorizado' }, 401);
    }
    if (!pedidoId || !['respondido', 'correccion'].includes(tipo)) return respuesta({ error: 'Pedido inválido' }, 400);
  }

  let destinatarios: string[] = [];
  let titulo = '', cuerpo = '', cotizacionId: string | null = null;
  if (usuarioPrueba) {
    destinatarios = [usuarioPrueba];
    titulo = 'Avisos activados';
    cuerpo = 'Así te va a llegar el aviso cuando la mesa cargue precios.';
  } else {
    const { data: p } = await db
      .from('pedidos_precio')
      .select('id, respondido_por, correccion_mensaje, cotizacion_id, cotizaciones(numero, cliente_nombre, vendedor)')
      .eq('id', pedidoId).maybeSingle();
    if (!p) return respuesta({ error: 'No existe el pedido' }, 404);
    // deno-lint-ignore no-explicit-any
    const c = (p as any).cotizaciones as { numero: number; cliente_nombre: string | null; vendedor: string | null } | null;
    cotizacionId = p.cotizacion_id;
    const ref = c ? `N° ${c.numero}${c.cliente_nombre ? ` · ${c.cliente_nombre}` : ''}` : 'una cotización';
    if (tipo === 'respondido') {
      titulo = 'La mesa cargó los precios';
      cuerpo = `${ref}${p.respondido_por ? ` — cargó ${p.respondido_por}` : ''}. Tocá para revisar y aplicar.`;
    } else {
      titulo = 'La mesa pidió una corrección';
      cuerpo = `${ref}${p.correccion_mensaje ? `: "${p.correccion_mensaje.slice(0, 120)}"` : ''}`;
    }
    const { data: admins } = await db.from('usuarios').select('id').eq('rol', 'admin');
    destinatarios = [...new Set([c?.vendedor, ...(admins || []).map((a) => a.id)].filter(Boolean) as string[])];
  }

  const { data: subs } = await db
    .from('push_suscripciones').select('id, endpoint, p256dh, auth').in('usuario_id', destinatarios);
  if (!subs?.length) return respuesta({ enviados: 0, motivo: 'Nadie tiene los avisos activados' });

  webpush.setVapidDetails('mailto:lozanot91@gmail.com', cfg.push_vapid_publica, cfg.push_vapid_privada);
  const payload = JSON.stringify({ titulo, cuerpo, cotizacionId, tag: usuarioPrueba ? 'prueba' : `pedido-${pedidoId}` });

  let enviados = 0;
  const vencidas: string[] = [];
  const errores: string[] = [];
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24 });
      enviados++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) vencidas.push(s.id);
      else errores.push(`${status ?? ''} ${(e as Error).message}`.trim());
    }
  }));
  if (vencidas.length) await db.from('push_suscripciones').delete().in('id', vencidas);
  if (errores.length) console.error('enviar-push:', errores);

  return respuesta({ enviados, borradas: vencidas.length, errores });
});
