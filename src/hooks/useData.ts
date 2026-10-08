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
  EstadoCotizacion,
  HistorialCambio,
  Tarea,
  Cobranza,
  PedidoPrecio,
  Visita,
  VisitaFoto,
  TipoCambioBNA,
} from '@/types';
import { hoyAR } from '@/lib/fechas';
import { usuarioActual } from '@/lib/usuarioActual';
import { ErrorApp, ok, traducirError } from '@/lib/errores';
import { validarCambioEstado } from '@/lib/estados';
import type { LineaDeCliente } from '@/lib/historialCliente';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyFilter = { range: (from: number, to: number) => Promise<{ data: any[] | null; error: unknown }> };

/**
 * Pagina una consulta de Supabase de a 1000 filas hasta traer todo (Supabase corta en 1000).
 * - La consulta DEBE tener un .order() estable; sin orden, las páginas pueden repetir o saltear filas.
 * - Si una página falla se lanza el error: nunca se devuelve una lista parcial como si fuera completa.
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
    if (error) {
      console.error('Error de base de datos (paginado):', error);
      throw new ErrorApp(traducirError(error), error);
    }
    all = all.concat((data || []) as unknown as T[]);
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

export function useData() {
  async function fetchConfig() {
    const data = await ok(supabase.from('configuracion').select('clave, valor'));
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
      iva_fertilizantes: parseFloat(map.iva_fertilizantes || '10.5'),
      iva_agroquimicos: parseFloat(map.iva_agroquimicos || '21'),
      vigencia_default: parseInt(map.vigencia_default || '15', 10),
      prob_borrador: parseFloat(map.prob_borrador || '10'),
      prob_enviada: parseFloat(map.prob_enviada || '25'),
      prob_negociacion: parseFloat(map.prob_negociacion || '50'),
      sin_respuesta_dias: parseFloat(map.sin_respuesta_dias || '7'),
      seguimiento_dias: parseFloat(map.seguimiento_dias || '3'),
      ultimo_contacto_dias: parseFloat(map.ultimo_contacto_dias || '60'),
    };
  }

  /**
   * Dólar divisa BNA (vendedor). Lo trae la edge function `tc-bna`, que guarda una lectura cada 30 min.
   * Si falla, devuelve null y la app usa el TC de respaldo de la configuración.
   */
  async function fetchTipoCambioBNA(): Promise<TipoCambioBNA | null> {
    try {
      const { data, error } = await supabase.functions.invoke('tc-bna', { body: {} });
      if (error || !data || !(Number(data.venta) > 0)) return null;
      return { fecha: data.fecha, compra: Number(data.compra), venta: Number(data.venta), desactualizado: !!data.desactualizado };
    } catch {
      return null;
    }
  }

  async function updateConfig(clave: string, valor: string) {
    await ok(supabase.from('configuracion').upsert({ clave, valor }));
  }

  async function fetchFamiliasConfig(): Promise<FamiliaConfig[]> {
    const data = await ok(supabase.from('familias_config').select('*').order('familia'));
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
    await ok(supabase.from('familias_config').upsert(patch, { onConflict: 'familia' }));
  }

  async function updateFamiliaMargen(familia: string, margen_default: number | null) {
    // Update only margen_default, preserve moneda
    await ok(supabase
      .from('familias_config')
      .update({ margen_default })
      .eq('familia', familia));
  }

  async function fetchListas(): Promise<ListaCostos[]> {
    const data = await ok(supabase.from('listas_costos').select('*').order('fecha', { ascending: false }));
    return (data || []) as ListaCostos[];
  }

  async function fetchListaVigente(): Promise<ListaCostos | null> {
    const data = await ok(supabase
      .from('listas_costos')
      .select('*')
      .order('fecha', { ascending: false })
      .limit(1)
      .maybeSingle());
    return data as ListaCostos | null;
  }

  async function fetchListaByFecha(fecha: string): Promise<ListaCostos | null> {
    const data = await ok(supabase
      .from('listas_costos')
      .select('*')
      .eq('fecha', fecha)
      .maybeSingle());
    return data as ListaCostos | null;
  }

  async function fetchProductosConCosto(listaId: string): Promise<ProductoConCosto[]> {
    // Un solo pedido paginado: costos de la lista con el producto embebido.
    // (Antes se hacía .in('id', [miles de ids]) y la URL se pasaba del límite de largo.)
    const filas = await fetchAllPaged<{ costo: number; producto: Producto | null }>(() =>
      supabase
        .from('costos_historial')
        .select('costo, producto_id, producto:productos(*)')
        .eq('lista_id', listaId)
        .order('producto_id') as unknown as AnyFilter
    );

    if (filas.length === 0) return [];

    const [famRes, margProdRes] = await Promise.all([
      ok(supabase.from('familias_config').select('*')),
      ok(supabase.from('margenes_producto').select('*')),
    ]);

    const familias = (famRes || []) as FamiliaConfig[];
    const margenesProd = (margProdRes || []) as MargenProducto[];

    const famMap = new Map(familias.map((f) => [f.familia, f]));
    const margProdMap = new Map(margenesProd.map((m) => [m.producto_id, m.margen]));

    const resultado: ProductoConCosto[] = [];
    for (const fila of filas) {
      const p = fila.producto;
      if (!p) continue;
      const famConfig = famMap.get(p.familia || '');
      const prodConCosto: ProductoConCosto = {
        ...p,
        costo: fila.costo ?? 0,
        moneda: famConfig?.moneda || 'USD',
        margen_default: famConfig?.margen_default ?? null,
        margen_producto: margProdMap.get(p.id) ?? null,
        es_fertilizante: false,
      };
      prodConCosto.es_fertilizante = esFertilizante(prodConCosto);
      resultado.push(prodConCosto);
    }
    return resultado;
  }

  /** Costo de un producto en cada lista cargada (para ver cómo fue cambiando). */
  async function fetchCostosDeProducto(productoId: string): Promise<{ fecha: string; costo: number }[]> {
    const [filas, listas] = await Promise.all([
      ok(supabase.from('costos_historial').select('costo, lista_id').eq('producto_id', productoId)),
      fetchListas(),
    ]);
    const fechaDe = new Map(listas.map((l) => [l.id, l.fecha]));
    return (filas || [])
      .map((f) => ({ fecha: fechaDe.get(f.lista_id as string) || '', costo: Number(f.costo) }))
      .filter((f) => f.fecha);
  }

  async function fetchTarifasFlete(): Promise<TarifaFlete[]> {
    const data = await fetchAllPaged<TarifaFlete>(() =>
      supabase.from('tarifa_flete').select('*').order('km') as unknown as AnyFilter
    );
    return data;
  }

  async function fetchClientes(): Promise<Cliente[]> {
    const data = await ok(supabase.from('clientes').select('*').order('nombre'));
    return (data || []) as Cliente[];
  }

  async function createCliente(cliente: Omit<Cliente, 'id' | 'created_by' | 'created_at'>): Promise<Cliente | null> {
    const data = await ok(supabase.from('clientes').insert(cliente).select().maybeSingle());
    return data as Cliente | null;
  }

  async function updateCliente(id: string, updates: Partial<Cliente>) {
    await ok(supabase.from('clientes').update(updates).eq('id', id));
  }

  async function deleteCliente(id: string) {
    await ok(supabase.from('clientes').delete().eq('id', id));
  }

  async function fetchMargenesCliente(clienteId: string): Promise<MargenCliente[]> {
    const data = await ok(supabase.from('margenes_cliente').select('*').eq('cliente_id', clienteId));
    return (data || []) as MargenCliente[];
  }

  async function upsertMargenCliente(margen: Omit<MargenCliente, 'id'>) {
    await ok(supabase.from('margenes_cliente').upsert(margen));
  }

  async function deleteMargenCliente(id: string) {
    await ok(supabase.from('margenes_cliente').delete().eq('id', id));
  }

  async function fetchCotizaciones(): Promise<(Cotizacion & { cliente?: Cliente })[]> {
    const data = await fetchAllPaged<Cotizacion & { cliente?: Cliente }>(() =>
      supabase.from('cotizaciones').select('*, cliente:clientes(*)').order('numero', { ascending: false }) as unknown as AnyFilter
    );
    return data;
  }

  async function fetchCotizacion(id: string): Promise<Cotizacion | null> {
    const data = await ok(supabase.from('cotizaciones').select('*').eq('id', id).maybeSingle());
    return data as Cotizacion | null;
  }

  async function fetchLineas(cotizacionId: string): Promise<CotizacionLinea[]> {
    const data = await ok(supabase
      .from('cotizacion_lineas')
      .select('*')
      .eq('cotizacion_id', cotizacionId)
      .order('orden'));
    return (data || []) as CotizacionLinea[];
  }

  /**
   * Guarda cabecera + líneas en UNA sola transacción (RPC guardar_cotizacion).
   * Si algo falla no se guarda nada: nunca queda una cotización sin líneas.
   * Lanza ErrorApp si falla.
   */
  async function saveCotizacion(
    cotizacion: Partial<Cotizacion>,
    lineas: Partial<CotizacionLinea>[],
    existingId?: string
  ): Promise<Cotizacion> {
    const data = await ok(
      supabase.rpc('guardar_cotizacion', {
        p_id: existingId ?? null,
        p_cotizacion: cotizacion as unknown as Record<string, unknown>,
        p_lineas: lineas as unknown as Record<string, unknown>[],
      })
    );
    if (!data) throw new ErrorApp('El servidor no devolvió la cotización guardada.');
    return data as unknown as Cotizacion;
  }

  /**
   * Cambia el estado de una cotización haciendo cumplir las reglas (src/lib/estados.ts):
   * Perdida exige motivo; desde Ganada/Perdida solo se reabre a En negociación con comentario.
   * Lee el estado actual de la base (no el de la pantalla) y falla si alguien lo cambió en el medio.
   * Al salir de Perdida (o en cualquier otro estado) motivo_perdida queda en NULL: el motivo viejo
   * sobrevive solo en el historial.
   */
  async function cambiarEstadoCotizacion(
    id: string,
    hacia: EstadoCotizacion,
    opciones: {
      motivo?: string | null;
      comentario?: string | null;
      cantidadesReales?: Record<string, { cantidad: number; precio: number }>;
    } = {}
  ): Promise<{ anterior: EstadoCotizacion; motivoAnterior: string | null }> {
    const actual = await ok(
      supabase.from('cotizaciones').select('estado, motivo_perdida, fecha_envio').eq('id', id).maybeSingle()
    );
    if (!actual) throw new ErrorApp('La cotización ya no existe. Actualizá la pantalla.');

    const anterior = actual.estado as EstadoCotizacion;
    const error = validarCambioEstado({ desde: anterior, hacia, motivo: opciones.motivo, comentario: opciones.comentario });
    if (error) throw new ErrorApp(error);

    const ahora = new Date().toISOString();
    const patch: Record<string, unknown> = {
      estado: hacia,
      motivo_perdida: hacia === 'Perdida' ? (opciones.motivo ?? '').trim() : null,
      updated_at: ahora,
    };
    if (hacia === 'Enviada' && !actual.fecha_envio) patch.fecha_envio = ahora;
    if (hacia === 'Ganada' && opciones.cantidadesReales) patch.cantidades_reales = opciones.cantidadesReales;

    // .eq('estado', anterior): si otra persona lo cambió mientras tanto, no pisamos su cambio
    const filas = await ok(
      supabase.from('cotizaciones').update(patch).eq('id', id).eq('estado', anterior).select('id')
    );
    if (!filas || filas.length === 0) {
      throw new ErrorApp('La cotización cambió de estado mientras la editabas. Actualizá la pantalla y probá de nuevo.');
    }
    return { anterior, motivoAnterior: actual.motivo_perdida ?? null };
  }

  /** Ids de las cotizaciones que tienen alguna línea con costo editado (una sola consulta paginada). */
  async function fetchCotizacionesConCostoEditado(): Promise<Set<string>> {
    const filas = await fetchAllPaged<{ id: string; cotizacion_id: string }>(() =>
      supabase.from('cotizacion_lineas').select('id, cotizacion_id').eq('costo_editado', true).order('id') as unknown as AnyFilter
    );
    return new Set(filas.map((f) => f.cotizacion_id));
  }

  async function fetchMargenesProducto(): Promise<MargenProducto[]> {
    const data = await ok(supabase.from('margenes_producto').select('*, producto:productos(*)'));
    return (data || []) as MargenProducto[];
  }

  async function upsertMargenProducto(producto_id: string, margen: number) {
    await ok(supabase.from('margenes_producto').upsert({ producto_id, margen }));
  }

  async function deleteMargenProducto(id: string) {
    await ok(supabase.from('margenes_producto').delete().eq('id', id));
  }

  async function cargarLista(
    fecha: string,
    nombre: string,
    filas: { cod: string; proveedor: string; familia: string; producto: string; unid: string; costo: number }[],
    reemplazar: boolean
  ): Promise<{ lista_id: string; productos_nuevos: number; productos_actualizados: number }> {
    const data = await ok(
      supabase.rpc('cargar_lista', {
        p_fecha: fecha,
        p_nombre: nombre,
        p_filas: filas as unknown as Record<string, unknown>[],
        p_reemplazar: reemplazar,
      })
    );
    return data as unknown as { lista_id: string; productos_nuevos: number; productos_actualizados: number };
  }

  /** Cuántas cotizaciones usan la lista de esa fecha (y cuántas siguen abiertas). */
  async function cotizacionesAfectadas(fecha: string): Promise<{ total: number; abiertas: number }> {
    const data = await ok(supabase.rpc('cotizaciones_afectadas', { p_fecha: fecha }));
    const d = (data || {}) as { total?: number; abiertas?: number };
    return { total: d.total ?? 0, abiertas: d.abiertas ?? 0 };
  }

  /** Carga la tarifa de flete completa en una transacción (reemplaza la anterior). */
  async function cargarTarifaFlete(filas: { km: number; tarifa: number }[]): Promise<number> {
    const n = await ok(
      supabase.rpc('cargar_tarifa_flete', { p_filas: filas as unknown as Record<string, unknown>[] })
    );
    return (n as number) ?? 0;
  }

  /** Líneas de todas las cotizaciones abiertas, en un solo pedido paginado (para saber cuáles usan un producto). */
  async function fetchLineasCotizacionesAbiertas(): Promise<{ cod: string; numero: number; cliente: string }[]> {
    const filas = await fetchAllPaged<{ cod: string; cotizaciones: { numero: number; cliente_nombre: string | null; estado: string } | null }>(() =>
      supabase
        .from('cotizacion_lineas')
        .select('id, cod, cotizaciones!inner(numero, cliente_nombre, estado)')
        .in('cotizaciones.estado', ['Borrador', 'Enviada', 'En negociación'])
        .order('id') as unknown as AnyFilter
    );
    return filas
      .filter((f) => f.cotizaciones)
      .map((f) => ({ cod: f.cod, numero: f.cotizaciones!.numero, cliente: f.cotizaciones!.cliente_nombre || 'Sin cliente' }));
  }

  /** Todas las líneas de las cotizaciones abiertas (una sola consulta paginada, con el estado por join). */
  async function fetchLineasDeCotizacionesAbiertas(): Promise<CotizacionLinea[]> {
    const filas = await fetchAllPaged<CotizacionLinea & { cotizaciones?: unknown }>(() =>
      supabase
        .from('cotizacion_lineas')
        .select('*, cotizaciones!inner(estado)')
        .in('cotizaciones.estado', ['Borrador', 'Enviada', 'En negociación'])
        .order('id') as unknown as AnyFilter
    );
    return filas.map((f) => {
      const { cotizaciones: _omitido, ...linea } = f;
      void _omitido;
      return linea as CotizacionLinea;
    });
  }

  /** Todas las líneas que se le cotizaron a un cliente, con los datos de su cotización. */
  async function fetchLineasDeCliente(clienteId: string): Promise<LineaDeCliente[]> {
    const filas = await fetchAllPaged<CotizacionLinea & { cotizaciones: { id: string; numero: number; fecha: string; estado: string } }>(() =>
      supabase
        .from('cotizacion_lineas')
        .select('*, cotizaciones!inner(id, numero, fecha, estado, cliente_id)')
        .eq('cotizaciones.cliente_id', clienteId)
        .order('id') as unknown as AnyFilter
    );
    return filas.map((f) => {
      const { cotizaciones: c, ...linea } = f;
      return { linea: linea as CotizacionLinea, cotizacionId: c.id, numero: c.numero, fecha: c.fecha, estado: c.estado };
    });
  }

  /** Todas las líneas de todas las cotizaciones (para rentabilidad). */
  async function fetchTodasLasLineas(): Promise<CotizacionLinea[]> {
    return fetchAllPaged<CotizacionLinea>(() =>
      supabase.from('cotizacion_lineas').select('*').order('id') as unknown as AnyFilter
    );
  }

  /** Cambia la vigencia (en días desde la fecha de la cotización). */
  async function actualizarVigencia(id: string, vigenciaDias: number) {
    await ok(supabase.from('cotizaciones').update({ vigencia_dias: vigenciaDias }).eq('id', id));
  }

  /** La lista inmediatamente anterior a una fecha (para comparar precios). */
  async function fetchListaAnteriorA(fecha: string): Promise<ListaCostos | null> {
    const data = await ok(
      supabase
        .from('listas_costos')
        .select('*')
        .lt('fecha', fecha)
        .order('fecha', { ascending: false })
        .limit(1)
        .maybeSingle()
    );
    return data as ListaCostos | null;
  }

  async function fetchHistorialCotizacion(cotizacionId: string): Promise<HistorialCambio[]> {
    const data = await ok(supabase
      .from('historial_cambios')
      .select('*')
      .eq('cotizacion_id', cotizacionId)
      .order('created_at', { ascending: false }));
    return (data || []) as HistorialCambio[];
  }


  // ============ PEDIDOS DE PRECIO A MESA DE INSUMOS ============
  /** Crea el pedido y devuelve el código del link. */
  async function crearPedidoPrecio(args: {
    cotizacion_id: string; dias: number; auto_aplicar: boolean; nota: string;
    lineas: { cod: string; producto: string; unidad: string; es_fertilizante: boolean; cantidad: number }[];
  }): Promise<string> {
    const token = await ok(supabase.rpc('crear_pedido_precio', {
      p_cotizacion_id: args.cotizacion_id, p_dias: args.dias, p_auto_aplicar: args.auto_aplicar,
      p_nota: args.nota, p_creado_por: usuarioActual(), p_lineas: args.lineas,
    }));
    return token as unknown as string;
  }

  async function fetchPedidosPrecio(): Promise<PedidoPrecio[]> {
    return fetchAllPaged<PedidoPrecio>(() =>
      supabase
        .from('pedidos_precio')
        .select('*, cotizacion:cotizaciones(numero, cliente_nombre), lineas:pedidos_precio_lineas(*)')
        .order('created_at', { ascending: false })
        .order('id') as unknown as AnyFilter
    );
  }

  /** El pedido más reciente que no esté cancelado de una cotización (con sus líneas). */
  async function fetchPedidoDeCotizacion(cotizacionId: string): Promise<PedidoPrecio | null> {
    const filas = await ok(supabase
      .from('pedidos_precio')
      .select('*, lineas:pedidos_precio_lineas(*)')
      .eq('cotizacion_id', cotizacionId)
      .neq('estado', 'Cancelado')
      .order('created_at', { ascending: false })
      .limit(1));
    const p = ((filas || []) as unknown as PedidoPrecio[])[0];
    if (!p) return null;
    p.lineas = (p.lineas || []).slice().sort((a, b) => a.orden - b.orden);
    return p;
  }

  async function extenderPedidoPrecio(id: string, venceEl: string) {
    await ok(supabase.from('pedidos_precio').update({ vence_el: venceEl }).eq('id', id));
  }

  async function cancelarPedidoPrecio(id: string) {
    await ok(supabase.from('pedidos_precio').update({ estado: 'Cancelado' }).eq('id', id));
  }

  /** Reabre un pedido ya guardado para que la mesa lo corrija. Solo desde la app, con sesión. */
  async function habilitarCorreccionPedido(id: string, venceEl: string) {
    await ok(supabase.from('pedidos_precio').update({
      estado: 'Abierto', correccion_solicitada: false, correccion_mensaje: null, aplicado_at: null, vence_el: venceEl,
    }).eq('id', id));
  }

  async function marcarPedidoAplicado(id: string) {
    await ok(supabase.from('pedidos_precio').update({ aplicado_at: new Date().toISOString() }).eq('id', id));
  }

  // ============ COBRANZAS ============
  async function fetchCobranzas(): Promise<Cobranza[]> {
    return fetchAllPaged<Cobranza>(() =>
      supabase
        .from('cobranzas')
        .select('*, cotizacion:cotizaciones(numero, cliente_nombre, canje_cultivo, canje_precio_usd, con_iva)')
        .order('vencimiento')
        .order('id') as unknown as AnyFilter
    );
  }

  async function crearCobranzas(filas: { cotizacion_id: string; vencimiento: string; plazo_dias: number; monto_usd: number }[]) {
    if (filas.length === 0) return;
    await ok(supabase.from('cobranzas').insert(filas));
  }

  async function actualizarCobranza(id: string, cambios: Partial<Pick<Cobranza, 'vencimiento' | 'monto_usd' | 'estado' | 'cobrada_el' | 'nota'>>) {
    await ok(supabase.from('cobranzas').update({ ...cambios, updated_at: new Date().toISOString() }).eq('id', id));
  }

  /** Al reabrir una cotización ganada se borran sus cobros que todavía no se cobraron. */
  async function borrarCobranzasPendientes(cotizacionId: string) {
    await ok(supabase.from('cobranzas').delete().eq('cotizacion_id', cotizacionId).eq('estado', 'Pendiente'));
  }

  async function contarCobranzas(cotizacionId: string): Promise<number> {
    const filas = await ok(supabase.from('cobranzas').select('id').eq('cotizacion_id', cotizacionId));
    return (filas || []).length;
  }

  // ============ TAREAS ============
  async function fetchTareas(): Promise<Tarea[]> {
    const data = await ok(supabase
      .from('tareas')
      .select('*, cotizacion:cotizaciones(numero), cliente:clientes(nombre)')
      .order('fecha_vencimiento', { ascending: true }));
    return (data || []) as Tarea[];
  }

  async function fetchTareasPendientes(): Promise<Tarea[]> {
    const hoy = hoyAR();
    const data = await ok(supabase
      .from('tareas')
      .select('*, cotizacion:cotizaciones(numero), cliente:clientes(nombre)')
      .eq('estado', 'Pendiente')
      .lte('fecha_vencimiento', hoy)
      .order('fecha_vencimiento', { ascending: true }));
    return (data || []) as Tarea[];
  }

  async function fetchTareasByCotizacion(cotizacionId: string): Promise<Tarea[]> {
    const data = await ok(supabase
      .from('tareas')
      .select('*')
      .eq('cotizacion_id', cotizacionId)
      .order('fecha_vencimiento', { ascending: false }));
    return (data || []) as Tarea[];
  }

  async function fetchTareasByCliente(clienteId: string): Promise<Tarea[]> {
    const data = await ok(supabase
      .from('tareas')
      .select('*')
      .eq('cliente_id', clienteId)
      .order('fecha_vencimiento', { ascending: false }));
    return (data || []) as Tarea[];
  }

  async function createTarea(tarea: Partial<Tarea>): Promise<Tarea | null> {
    const data = await ok(supabase.from('tareas').insert(tarea).select().maybeSingle());
    return data as Tarea | null;
  }

  async function updateTarea(id: string, updates: Partial<Tarea>) {
    await ok(supabase.from('tareas').update(updates).eq('id', id));
  }

  async function deleteTarea(id: string) {
    await ok(supabase.from('tareas').delete().eq('id', id));
  }

  // ============ VISITAS ============
  async function fetchVisitas(): Promise<Visita[]> {
    const data = await ok(supabase
      .from('visitas')
      .select('*, cliente:clientes(nombre), cotizacion:cotizaciones(numero)')
      .order('fecha', { ascending: true }));
    return (data || []) as Visita[];
  }

  async function fetchVisitasByCliente(clienteId: string): Promise<Visita[]> {
    const data = await ok(supabase
      .from('visitas')
      .select('*')
      .eq('cliente_id', clienteId)
      .order('fecha', { ascending: false }));
    return (data || []) as Visita[];
  }

  async function createVisita(visita: Partial<Visita>): Promise<Visita | null> {
    const data = await ok(supabase.from('visitas').insert(visita).select().maybeSingle());
    return data as Visita | null;
  }

  async function updateVisita(id: string, updates: Partial<Visita>) {
    await ok(supabase.from('visitas').update(updates).eq('id', id));
  }

  async function deleteVisita(id: string) {
    await ok(supabase.from('visitas').delete().eq('id', id));
  }

  // ============ FOTOS ============
  async function fetchFotos(visitaId: string): Promise<VisitaFoto[]> {
    const data = await ok(supabase
      .from('visita_fotos')
      .select('*')
      .eq('visita_id', visitaId)
      .order('created_at', { ascending: true }));
    return (data || []) as VisitaFoto[];
  }

  async function uploadFoto(visitaId: string, file: File, onProgress?: (pct: number) => void): Promise<VisitaFoto> {
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${visitaId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
    const { error: upErr } = await supabase.storage.from('visitas-fotos').upload(path, file, {
      contentType: file.type || 'image/jpeg',
      upsert: false,
    });
    if (upErr) {
      console.error('upload error', upErr);
      throw new ErrorApp('No se pudo subir la foto. Probá de nuevo.', upErr);
    }
    if (onProgress) onProgress(100);
    const { data, error } = await supabase
      .from('visita_fotos')
      .insert({ visita_id: visitaId, storage_path: path })
      .select()
      .maybeSingle();
    if (error || !data) {
      console.error('foto insert error', error);
      // No dejar un archivo huérfano en el storage
      await supabase.storage.from('visitas-fotos').remove([path]);
      throw new ErrorApp('La foto se subió pero no se pudo registrar. Probá de nuevo.', error);
    }
    return data as VisitaFoto;
  }

  async function getFotoUrl(storagePath: string): Promise<string | null> {
    // Una foto que no se puede firmar no debe romper toda la galería.
    const { data, error } = await supabase.storage.from('visitas-fotos').createSignedUrl(storagePath, 3600);
    if (error) console.error('signed url error', error);
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
    await ok(supabase.storage.from('visitas-fotos').remove([storagePath]));
    await ok(supabase.from('visita_fotos').delete().eq('id', id));
  }

  async function updateFotoDescripcion(id: string, descripcion: string) {
    await ok(supabase.from('visita_fotos').update({ descripcion }).eq('id', id));
  }

  // ============ COTIZACION EXTRAS ============
  async function updateCotizacionProbabilidad(id: string, probabilidad: number | null) {
    await ok(supabase.from('cotizaciones').update({ probabilidad, updated_at: new Date().toISOString() }).eq('id', id));
  }

  async function updateCotizacionFechaCierre(id: string, fecha: string | null) {
    await ok(supabase.from('cotizaciones').update({ fecha_cierre_estimada: fecha, updated_at: new Date().toISOString() }).eq('id', id));
  }

  async function deleteCotizacion(id: string) {
    await ok(supabase.from('cotizaciones').delete().eq('id', id));
  }

  return {
    fetchConfig,
    fetchTipoCambioBNA,
    updateConfig,
    fetchFamiliasConfig,
    upsertFamiliaConfig,
    updateFamiliaMargen,
    fetchListas,
    fetchListaVigente,
    fetchListaByFecha,
    fetchProductosConCosto,
    fetchTarifasFlete,
    fetchCostosDeProducto,
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
    cambiarEstadoCotizacion,
    fetchCotizacionesConCostoEditado,
    fetchMargenesProducto,
    upsertMargenProducto,
    deleteMargenProducto,
    cargarLista,
    cotizacionesAfectadas,
    fetchListaAnteriorA,
    cargarTarifaFlete,
    fetchLineasCotizacionesAbiertas,
    fetchLineasDeCotizacionesAbiertas,
    fetchTodasLasLineas,
    fetchLineasDeCliente,
    actualizarVigencia,
    fetchHistorialCotizacion,
    fetchCobranzas,
    crearPedidoPrecio,
    fetchPedidosPrecio,
    fetchPedidoDeCotizacion,
    extenderPedidoPrecio,
    cancelarPedidoPrecio,
    habilitarCorreccionPedido,
    marcarPedidoAplicado,
    crearCobranzas,
    actualizarCobranza,
    borrarCobranzasPendientes,
    contarCobranzas,
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
