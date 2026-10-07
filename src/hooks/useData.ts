import { supabase } from '@/lib/supabase';
import { esFertilizante } from '@/lib/calculations';
import type {
  Producto,
  ProductoConCosto,
  FamiliaConfig,
  MargenProducto,
  ListaCostos,
  TarifaFlete,
  Cliente,
  MargenCliente,
  Cotizacion,
  CotizacionLinea,
  HistorialCambio,
  Tarea,
  Visita,
  VisitaFoto,
} from '@/types';
import { hoyAR } from '@/lib/fechas';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFilter = { range: (from: number, to: number) => Promise<{ data: any[] | null; error: unknown }> };

/**
 * Pagina una consulta de Supabase de a 1000 filas hasta traer todo.
 * Supabase limita las respuestas a 1000 filas por defecto.
 */
async function fetchAll<T>(query: AnyFilter): Promise<T[]> {
  const pageSize = 1000;
  let from = 0;
  let all: T[] = [];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) {
      return all;
    }
    all = all.concat((data || []) as unknown as T[]);
    if (!data || data.length < pageSize) break;
    from += pageSize;
    // Rebuild the query for the next range — supabase-js consumes the builder on .range()
    // This is handled by the caller passing a fresh query builder each time via the factory.
    break; // We'll handle pagination differently below
  }
  return all;
}

/**
 * Pagina una consulta de Supabase usando un factory que crea un builder fresh cada vez.
 */
export async function fetchAllPaged<T>(
  queryFactory: () => AnyFilter
): Promise<T[]> {
  const pageSize = 1000;
  let from = 0;
  let all: T[] = [];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await queryFactory().range(from, from + pageSize - 1);
    if (error) break;
    all = all.concat((data || []) as unknown as T[]);
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

export function useData() {
  async function fetchConfig() {
    const { data } = await supabase.from('configuracion').select('clave, valor');
    const map: Record<string, string> = {};
    (data || []).forEach((r) => { map[r.clave] = r.valor; });
    return {
      empresa_nombre: map.empresa_nombre || 'Agro Químicos S.A.',
      empresa_cuit: map.empresa_cuit || '',
      empresa_telefono: map.empresa_telefono || '',
      empresa_direccion: map.empresa_direccion || '',
      empresa_logo: map.empresa_logo || '',
      margen_general: parseFloat(map.margen_general || '8'),
      tipo_cambio_default: parseFloat(map.tipo_cambio_default || '1400'),
      iva_default: parseFloat(map.iva_default || '10.5'),
      vigencia_default: parseInt(map.vigencia_default || '15', 10),
      prob_borrador: parseFloat(map.prob_borrador || '10'),
      prob_enviada: parseFloat(map.prob_enviada || '25'),
      prob_negociacion: parseFloat(map.prob_negociacion || '50'),
      sin_respuesta_dias: parseFloat(map.sin_respuesta_dias || '7'),
      seguimiento_dias: parseFloat(map.seguimiento_dias || '3'),
      ultimo_contacto_dias: parseFloat(map.ultimo_contacto_dias || '60'),
    };
  }

  async function updateConfig(clave: string, valor: string) {
    await supabase.from('configuracion').upsert({ clave, valor });
  }

  async function fetchFamiliasConfig(): Promise<FamiliaConfig[]> {
    const { data } = await supabase.from('familias_config').select('*').order('familia');
    return (data || []) as FamiliaConfig[];
  }

  async function upsertFamiliaConfig(
    familia: string,
    updates: { moneda?: 'USD' | 'ARS'; margen_default?: number | null }
  ) {
    // Only update fields that are passed — don't overwrite others
    const patch: Record<string, unknown> = { familia };
    if (updates.moneda !== undefined) patch.moneda = updates.moneda;
    if (updates.margen_default !== undefined) patch.margen_default = updates.margen_default;
    await supabase.from('familias_config').upsert(patch, { onConflict: 'familia' });
  }

  async function updateFamiliaMargen(familia: string, margen_default: number | null) {
    // Update only margen_default, preserve moneda
    await supabase
      .from('familias_config')
      .update({ margen_default })
      .eq('familia', familia);
  }

  async function fetchListas(): Promise<ListaCostos[]> {
    const { data } = await supabase.from('listas_costos').select('*').order('fecha', { ascending: false });
    return (data || []) as ListaCostos[];
  }

  async function fetchListaVigente(): Promise<ListaCostos | null> {
    const { data } = await supabase
      .from('listas_costos')
      .select('*')
      .order('fecha', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data as ListaCostos | null;
  }

  async function fetchListaByFecha(fecha: string): Promise<ListaCostos | null> {
    const { data } = await supabase
      .from('listas_costos')
      .select('*')
      .eq('fecha', fecha)
      .maybeSingle();
    return data as ListaCostos | null;
  }

  async function fetchProductosConCosto(listaId: string): Promise<ProductoConCosto[]> {
    // Fetch all costos for this lista (could be > 1000)
    const costosRes = await fetchAllPaged<{ producto_id: string; costo: number }>(() =>
      supabase.from('costos_historial').select('producto_id, costo').eq('lista_id', listaId) as unknown as AnyFilter
    );

    if (costosRes.length === 0) return [];

    const productoIds = costosRes.map((c) => c.producto_id);

    // Fetch productos that have costs in this lista
    const [prodRes, famRes, margProdRes] = await Promise.all([
      fetchAllPaged<Producto>(() =>
        supabase.from('productos').select('*').in('id', productoIds) as unknown as AnyFilter
      ),
      supabase.from('familias_config').select('*'),
      supabase.from('margenes_producto').select('*'),
    ]);

    const productos = prodRes as Producto[];
    const familias = (famRes.data || []) as FamiliaConfig[];
    const margenesProd = (margProdRes.data || []) as MargenProducto[];

    const famMap = new Map(familias.map((f) => [f.familia, f]));
    const margProdMap = new Map(margenesProd.map((m) => [m.producto_id, m.margen]));
    const costoMap = new Map(costosRes.map((c) => [c.producto_id, c.costo]));

    return productos.map((p) => {
      const famConfig = famMap.get(p.familia || '');
      const moneda = famConfig?.moneda || 'USD';
      const prodConCosto: ProductoConCosto = {
        ...p,
        costo: costoMap.get(p.id) || 0,
        moneda,
        margen_default: famConfig?.margen_default ?? null,
        margen_producto: margProdMap.get(p.id) ?? null,
        es_fertilizante: false,
      };
      prodConCosto.es_fertilizante = esFertilizante(prodConCosto);
      return prodConCosto;
    });
  }

  async function fetchTarifasFlete(): Promise<TarifaFlete[]> {
    const data = await fetchAllPaged<TarifaFlete>(() =>
      supabase.from('tarifa_flete').select('*').order('km') as unknown as AnyFilter
    );
    return data;
  }

  async function fetchClientes(): Promise<Cliente[]> {
    const { data } = await supabase.from('clientes').select('*').order('nombre');
    return (data || []) as Cliente[];
  }

  async function createCliente(cliente: Omit<Cliente, 'id' | 'created_by' | 'created_at'>): Promise<Cliente | null> {
    const { data } = await supabase.from('clientes').insert(cliente).select().maybeSingle();
    return data as Cliente | null;
  }

  async function updateCliente(id: string, updates: Partial<Cliente>) {
    await supabase.from('clientes').update(updates).eq('id', id);
  }

  async function deleteCliente(id: string) {
    await supabase.from('clientes').delete().eq('id', id);
  }

  async function fetchMargenesCliente(clienteId: string): Promise<MargenCliente[]> {
    const { data } = await supabase.from('margenes_cliente').select('*').eq('cliente_id', clienteId);
    return (data || []) as MargenCliente[];
  }

  async function upsertMargenCliente(margen: Omit<MargenCliente, 'id'>) {
    await supabase.from('margenes_cliente').upsert(margen);
  }

  async function deleteMargenCliente(id: string) {
    await supabase.from('margenes_cliente').delete().eq('id', id);
  }

  async function fetchCotizaciones(): Promise<(Cotizacion & { cliente?: Cliente })[]> {
    const data = await fetchAllPaged<Cotizacion & { cliente?: Cliente }>(() =>
      supabase.from('cotizaciones').select('*, cliente:clientes(*)').order('numero', { ascending: false }) as unknown as AnyFilter
    );
    return data;
  }

  async function fetchCotizacion(id: string): Promise<Cotizacion | null> {
    const { data } = await supabase.from('cotizaciones').select('*').eq('id', id).maybeSingle();
    return data as Cotizacion | null;
  }

  async function fetchLineas(cotizacionId: string): Promise<CotizacionLinea[]> {
    const { data } = await supabase
      .from('cotizacion_lineas')
      .select('*')
      .eq('cotizacion_id', cotizacionId)
      .order('orden');
    return (data || []) as CotizacionLinea[];
  }

  async function getNextNumero(): Promise<number> {
    const { data } = await supabase.rpc('get_next_numero');
    return (data as number) || 1;
  }

  async function saveCotizacion(
    cotizacion: Partial<Cotizacion>,
    lineas: Partial<CotizacionLinea>[],
    existingId?: string
  ): Promise<Cotizacion | null> {
    if (existingId) {
      const { data } = await supabase
        .from('cotizaciones')
        .update({ ...cotizacion, updated_at: new Date().toISOString() })
        .eq('id', existingId)
        .select()
        .maybeSingle();
      const cotizId = existingId;
      await supabase.from('cotizacion_lineas').delete().eq('cotizacion_id', cotizId);
      if (lineas.length > 0) {
        const lineasInsert = lineas.map((l, i) => ({ ...l, cotizacion_id: cotizId, orden: i }));
        await supabase.from('cotizacion_lineas').insert(lineasInsert);
      }
      return data as Cotizacion | null;
    } else {
      const numero = await getNextNumero();
      const { data } = await supabase
        .from('cotizaciones')
        .insert({ ...cotizacion, numero })
        .select()
        .maybeSingle();
      if (!data) return null;
      if (lineas.length > 0) {
        const lineasInsert = lineas.map((l, i) => ({ ...l, cotizacion_id: data.id, orden: i }));
        await supabase.from('cotizacion_lineas').insert(lineasInsert);
      }
      return data as Cotizacion;
    }
  }

  async function updateCotizacionEstado(
    id: string,
    estado: Cotizacion['estado'],
    extra?: { motivo_perdida?: string | null; cantidades_reales?: Record<string, { cantidad: number; precio: number }> }
  ) {
    await supabase.from('cotizaciones').update({ estado, ...extra, updated_at: new Date().toISOString() }).eq('id', id);
  }

  async function fetchMargenesProducto(): Promise<MargenProducto[]> {
    const { data } = await supabase.from('margenes_producto').select('*, producto:productos(*)');
    return (data || []) as MargenProducto[];
  }

  async function upsertMargenProducto(producto_id: string, margen: number) {
    await supabase.from('margenes_producto').upsert({ producto_id, margen });
  }

  async function deleteMargenProducto(id: string) {
    await supabase.from('margenes_producto').delete().eq('id', id);
  }

  async function cargarLista(
    fecha: string,
    nombre: string,
    filas: { cod: string; proveedor: string; familia: string; producto: string; unid: string; costo: number }[],
    reemplazar: boolean
  ): Promise<{ lista_id: string; productos_nuevos: number; productos_actualizados: number } | null> {
    const { data, error } = await supabase.rpc('cargar_lista', {
      p_fecha: fecha,
      p_nombre: nombre,
      p_filas: filas as unknown as Record<string, unknown>[],
      p_reemplazar: reemplazar,
    });
    if (error) return null;
    return data as { lista_id: string; productos_nuevos: number; productos_actualizados: number } | null;
  }

  async function fetchHistorialCotizacion(cotizacionId: string): Promise<HistorialCambio[]> {
    const { data } = await supabase
      .from('historial_cambios')
      .select('*')
      .eq('cotizacion_id', cotizacionId)
      .order('created_at', { ascending: false });
    return (data || []) as HistorialCambio[];
  }

  // ============ TAREAS ============
  async function fetchTareas(): Promise<Tarea[]> {
    const { data } = await supabase
      .from('tareas')
      .select('*, cotizacion:cotizaciones(numero), cliente:clientes(nombre)')
      .order('fecha_vencimiento', { ascending: true });
    return (data || []) as Tarea[];
  }

  async function fetchTareasPendientes(): Promise<Tarea[]> {
    const hoy = hoyAR();
    const { data } = await supabase
      .from('tareas')
      .select('*, cotizacion:cotizaciones(numero), cliente:clientes(nombre)')
      .eq('estado', 'Pendiente')
      .lte('fecha_vencimiento', hoy)
      .order('fecha_vencimiento', { ascending: true });
    return (data || []) as Tarea[];
  }

  async function fetchTareasByCotizacion(cotizacionId: string): Promise<Tarea[]> {
    const { data } = await supabase
      .from('tareas')
      .select('*')
      .eq('cotizacion_id', cotizacionId)
      .order('fecha_vencimiento', { ascending: false });
    return (data || []) as Tarea[];
  }

  async function fetchTareasByCliente(clienteId: string): Promise<Tarea[]> {
    const { data } = await supabase
      .from('tareas')
      .select('*')
      .eq('cliente_id', clienteId)
      .order('fecha_vencimiento', { ascending: false });
    return (data || []) as Tarea[];
  }

  async function createTarea(tarea: Partial<Tarea>): Promise<Tarea | null> {
    const { data } = await supabase.from('tareas').insert(tarea).select().maybeSingle();
    return data as Tarea | null;
  }

  async function updateTarea(id: string, updates: Partial<Tarea>) {
    await supabase.from('tareas').update(updates).eq('id', id);
  }

  async function deleteTarea(id: string) {
    await supabase.from('tareas').delete().eq('id', id);
  }

  // ============ VISITAS ============
  async function fetchVisitas(): Promise<Visita[]> {
    const { data } = await supabase
      .from('visitas')
      .select('*, cliente:clientes(nombre), cotizacion:cotizaciones(numero)')
      .order('fecha', { ascending: true });
    return (data || []) as Visita[];
  }

  async function fetchVisitasByCliente(clienteId: string): Promise<Visita[]> {
    const { data } = await supabase
      .from('visitas')
      .select('*')
      .eq('cliente_id', clienteId)
      .order('fecha', { ascending: false });
    return (data || []) as Visita[];
  }

  async function createVisita(visita: Partial<Visita>): Promise<Visita | null> {
    const { data } = await supabase.from('visitas').insert(visita).select().maybeSingle();
    return data as Visita | null;
  }

  async function updateVisita(id: string, updates: Partial<Visita>) {
    await supabase.from('visitas').update(updates).eq('id', id);
  }

  async function deleteVisita(id: string) {
    await supabase.from('visitas').delete().eq('id', id);
  }

  // ============ FOTOS ============
  async function fetchFotos(visitaId: string): Promise<VisitaFoto[]> {
    const { data } = await supabase
      .from('visita_fotos')
      .select('*')
      .eq('visita_id', visitaId)
      .order('created_at', { ascending: true });
    return (data || []) as VisitaFoto[];
  }

  async function uploadFoto(visitaId: string, file: File, onProgress?: (pct: number) => void): Promise<VisitaFoto | null> {
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${visitaId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
    const { error: upErr } = await supabase.storage.from('visitas-fotos').upload(path, file, {
      contentType: file.type || 'image/jpeg',
      upsert: false,
    });
    if (upErr) { console.error('upload error', upErr); return null; }
    if (onProgress) onProgress(100);
    const { data, error } = await supabase
      .from('visita_fotos')
      .insert({ visita_id: visitaId, storage_path: path })
      .select()
      .maybeSingle();
    if (error) console.error('foto insert error', error);
    return data as VisitaFoto | null;
  }

  async function getFotoUrl(storagePath: string): Promise<string | null> {
    const { data } = await supabase.storage.from('visitas-fotos').createSignedUrl(storagePath, 3600);
    return data?.signedUrl || null;
  }

  async function getFotoUrls(paths: string[]): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    for (const p of paths) {
      const url = await getFotoUrl(p);
      if (url) result[p] = url;
    }
    return result;
  }

  async function deleteFoto(id: string, storagePath: string) {
    await supabase.storage.from('visitas-fotos').remove([storagePath]);
    await supabase.from('visita_fotos').delete().eq('id', id);
  }

  async function updateFotoDescripcion(id: string, descripcion: string) {
    await supabase.from('visita_fotos').update({ descripcion }).eq('id', id);
  }

  // ============ COTIZACION EXTRAS ============
  async function updateCotizacionProbabilidad(id: string, probabilidad: number | null) {
    await supabase.from('cotizaciones').update({ probabilidad, updated_at: new Date().toISOString() }).eq('id', id);
  }

  async function updateCotizacionFechaCierre(id: string, fecha: string | null) {
    await supabase.from('cotizaciones').update({ fecha_cierre_estimada: fecha, updated_at: new Date().toISOString() }).eq('id', id);
  }

  async function deleteCotizacion(id: string) {
    await supabase.from('cotizaciones').delete().eq('id', id);
  }

  return {
    fetchConfig,
    updateConfig,
    fetchFamiliasConfig,
    upsertFamiliaConfig,
    updateFamiliaMargen,
    fetchListas,
    fetchListaVigente,
    fetchListaByFecha,
    fetchProductosConCosto,
    fetchTarifasFlete,
    fetchClientes,
    createCliente,
    updateCliente,
    deleteCliente,
    fetchMargenesCliente,
    upsertMargenCliente,
    deleteMargenCliente,
    fetchCotizaciones,
    fetchCotizacion,
    fetchLineas,
    saveCotizacion,
    updateCotizacionEstado,
    fetchMargenesProducto,
    upsertMargenProducto,
    deleteMargenProducto,
    cargarLista,
    fetchHistorialCotizacion,
    fetchTareas,
    fetchTareasPendientes,
    fetchTareasByCotizacion,
    fetchTareasByCliente,
    createTarea,
    updateTarea,
    deleteTarea,
    fetchVisitas,
    fetchVisitasByCliente,
    createVisita,
    updateVisita,
    deleteVisita,
    fetchFotos,
    uploadFoto,
    getFotoUrl,
    getFotoUrls,
    deleteFoto,
    updateFotoDescripcion,
    updateCotizacionProbabilidad,
    updateCotizacionFechaCierre,
    deleteCotizacion,
  };
}
