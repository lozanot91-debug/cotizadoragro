// Edge function: precios pizarra (precios de Cámara) de Quequén, Bahía Blanca, Rosario y Dársena,
// leídos de la Bolsa de Cereales y Productos de Bahía Blanca (bcp.org.ar), guardados en `pizarras_granos`.
//
// - Con usuario logueado: { accion: 'actualizar' } relee los últimos días si la última lectura tiene más de 4 h.
// - Con el secreto de la tarea programada (header x-pizarra-secreto): 'actualizar' siempre, o
//   { accion: 'historia', dias } para cargar la historia.
// También guarda los ajustes de futuros en USD de Rosario (Matba-Rofex / A3) en `futuros_granos`.
// Rosario cotiza en pesos: se guarda el $ y se pasa a USD con el comprador del BNA de ese día (si lo tenemos).
// verify_jwt está apagado porque la tarea programada no manda JWT: la autenticación se hace acá adentro.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { CEREALES, PLAZAS, parsearRango, urlRango, type Cereal, type Plaza } from './parser.ts';
import { parsearFuturos, urlFuturos, type Futuro } from './futuros.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const VIGENCIA_H = 4;
const DIAS_ACTUALIZAR = 14;

function json(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

const hoyAR = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const restarDias = (f: string, d: number) => new Date(Date.parse(f + 'T00:00:00Z') - d * 86400_000).toISOString().slice(0, 10);

async function leer(url: string): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (cotizador Ceres Tolvas)', 'Accept': 'text/html, application/json' } });
    if (!r.ok) throw new Error(`${new URL(url).host} respondió ${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}

interface Fila { fecha: string; plaza: Plaza; cultivo: Cereal; precio_usd: number | null; precio_ars: number | null; obtenido_at: string }

/** Lee una plaza y un cereal en un rango. Primero en USD; si no hay nada (Rosario), en pesos. */
async function leerCombo(plaza: Plaza, cereal: Cereal, desde: string, hasta: string, tcPorFecha: (f: string) => number | null): Promise<Fila[]> {
  const ahora = new Date().toISOString();
  const usd = parsearRango(await leer(urlRango(plaza, cereal, desde, hasta, 0)));
  if (usd.length) return usd.map((r) => ({ fecha: r.fecha, plaza, cultivo: cereal, precio_usd: r.precio, precio_ars: null, obtenido_at: ahora }));
  const ars = parsearRango(await leer(urlRango(plaza, cereal, desde, hasta, 1)));
  return ars.map((r) => {
    const tc = tcPorFecha(r.fecha);
    return { fecha: r.fecha, plaza, cultivo: cereal, precio_usd: tc ? Math.round((r.precio / tc) * 100) / 100 : null, precio_ars: r.precio, obtenido_at: ahora };
  });
}

/** Ajustes de futuros en un rango de fechas (la API devuelve de a 50 filas por página). */
async function leerFuturos(desde: string, hasta: string): Promise<Futuro[]> {
  const pagina = async (n: number) => {
    const r = JSON.parse(await leer(urlFuturos(desde, hasta, n)));
    return { filas: parsearFuturos(r), total: Number(r?.totalEntries) || 0 };
  };
  const primera = await pagina(1);
  const paginas = Math.min(Math.ceil(primera.total / 50), 80);
  const resto = await enTandas(Array.from({ length: Math.max(paginas - 1, 0) }, (_, i) => () => pagina(i + 2)), 5);
  return [...primera.filas, ...resto.flatMap((r) => (r.status === 'fulfilled' ? r.value.filas : []))];
}

/** Corre las tareas de a `n` por vez. */
async function enTandas<T>(tareas: (() => Promise<T>)[], n: number): Promise<PromiseSettledResult<T>[]> {
  const res: PromiseSettledResult<T>[] = [];
  for (let i = 0; i < tareas.length; i += n) res.push(...await Promise.allSettled(tareas.slice(i, i + n).map((t) => t())));
  return res;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  // Quién llama: la tarea programada (secreto en Vault) o un usuario logueado
  const secreto = req.headers.get('x-pizarra-secreto');
  let programada = false;
  if (secreto) {
    const { data } = await db.rpc('pizarra_secreto');
    programada = !!data && data === secreto;
    if (!programada) return json({ error: 'Secreto inválido' }, 401);
  } else {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'Hace falta iniciar sesión' }, 401);
    const { data: quien } = await db.auth.getUser(token);
    if (!quien?.user) return json({ error: 'Hace falta iniciar sesión' }, 401);
  }

  let cuerpo: { accion?: string; dias?: number } = {};
  try { cuerpo = await req.json(); } catch { /* sin cuerpo */ }
  const accion = cuerpo.accion === 'historia' && programada ? 'historia' : 'actualizar';

  if (accion === 'actualizar' && !programada) {
    const { data: ult } = await db.from('pizarras_granos').select('obtenido_at').order('obtenido_at', { ascending: false }).limit(1).maybeSingle();
    if (ult && Date.now() - new Date(ult.obtenido_at).getTime() < VIGENCIA_H * 3600_000) return json({ fresco: true, obtenido_at: ult.obtenido_at });
  }

  const hasta = hoyAR();
  const dias = accion === 'historia' ? Math.min(Math.max(Number(cuerpo.dias) || 1095, 30), 4000) : DIAS_ACTUALIZAR;
  const desde = restarDias(hasta, dias);

  // TC comprador por fecha (para Rosario en pesos): el del día o el último anterior, hasta 5 días
  const { data: tcs } = await db.from('tipo_cambio_bna').select('fecha, compra').gte('fecha', restarDias(desde, 7)).order('fecha');
  const listaTc = (tcs || []).map((t) => ({ fecha: t.fecha as string, compra: Number(t.compra) }));
  const tcPorFecha = (f: string) => {
    let mejor: { fecha: string; compra: number } | null = null;
    for (const t of listaTc) if (t.fecha <= f) mejor = t;
    return mejor && Date.parse(f) - Date.parse(mejor.fecha) <= 5 * 86400_000 ? mejor.compra : null;
  };

  const combos = (Object.keys(PLAZAS) as Plaza[]).flatMap((p) => (Object.keys(CEREALES) as Cereal[]).map((c) => [p, c] as const));
  const res = await enTandas(combos.map(([p, c]) => () => leerCombo(p, c, desde, hasta, tcPorFecha)), 4);
  const filas = res.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  const errores = res.map((r, i) => (r.status === 'rejected' ? `${combos[i][0]} ${combos[i][1]}: ${r.reason}` : null)).filter(Boolean);

  for (let i = 0; i < filas.length; i += 500) {
    const { error } = await db.from('pizarras_granos').upsert(filas.slice(i, i + 500), { onConflict: 'fecha,plaza,cultivo' });
    if (error) return json({ error: `No se pudo guardar: ${error.message}`, errores }, 500);
  }
  // Futuros: la última semana (en la historia, el último mes)
  let futuros = 0;
  try {
    const ahora = new Date().toISOString();
    const fs = await leerFuturos(restarDias(hasta, accion === 'historia' ? 30 : 7), hasta);
    // Sin repetidos (la misma fecha y símbolo en dos páginas haría fallar el upsert)
    const filasF = [...new Map(fs.map((f) => [`${f.fecha}|${f.simbolo}`, { ...f, obtenido_at: ahora }])).values()];
    for (let i = 0; i < filasF.length; i += 500) {
      const { error } = await db.from('futuros_granos').upsert(filasF.slice(i, i + 500), { onConflict: 'fecha,simbolo' });
      if (error) throw new Error(error.message);
    }
    futuros = filasF.length;
  } catch (e) {
    errores.push(`futuros: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (errores.length) console.error('pizarra-granos:', errores.join(' | '));
  return json({ accion, desde, hasta, filas: filas.length, futuros, errores });
});
