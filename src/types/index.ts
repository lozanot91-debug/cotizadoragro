export type Rol = 'admin' | 'vendedor';

export interface Usuario {
  id: string;
  email: string;
  nombre: string | null;
  rol: Rol;
  puede_ver_costos: boolean;
}

export interface Configuracion {
  empresa_nombre: string;
  empresa_cuit: string;
  empresa_telefono: string;
  empresa_direccion: string;
  empresa_logo: string;
  margen_general: number;
  tipo_cambio_default: number;
  iva_default: number;
  iva_fertilizantes: number;
  iva_agroquimicos: number;
  vigencia_default: number;
  prob_borrador: number;
  prob_enviada: number;
  prob_negociacion: number;
  sin_respuesta_dias: number;
  seguimiento_dias: number;
  ultimo_contacto_dias: number;
}

export interface FamiliaConfig {
  id: string;
  familia: string;
  moneda: 'USD' | 'ARS';
  margen_default: number | null;
}

export interface Producto {
  id: string;
  cod: string;
  proveedor: string | null;
  familia: string | null;
  producto: string | null;
  unid: string | null;
}

export interface ListaCostos {
  id: string;
  fecha: string;
  nombre_archivo: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface CostoHistorial {
  id: string;
  producto_id: string;
  lista_id: string;
  costo: number;
  producto?: Producto;
}

export interface TarifaFlete {
  id: string;
  km: number;
  tarifa: number;
}

export interface Cliente {
  id: string;
  nombre: string;
  cuit: string | null;
  zona: string | null;
  condiciones_pago: string | null;
  created_by: string | null;
  created_at: string;
}

export interface MargenProducto {
  id: string;
  producto_id: string;
  margen: number;
}

export interface MargenCliente {
  id: string;
  cliente_id: string;
  producto_id: string | null;
  familia: string | null;
  margen: number;
}

export type EstadoCotizacion =
  | 'Borrador'
  | 'Enviada'
  | 'En negociación'
  | 'Ganada'
  | 'Perdida'
  | 'Vencida';

export type MotivoPerdida =
  | 'precio'
  | 'plazo de pago'
  | 'competencia'
  | 'no compró'
  | 'otro';

export interface Cotizacion {
  id: string;
  numero: number;
  cliente_id: string | null;
  cliente_nombre: string | null;
  fecha: string;
  tc: number;
  km: number;
  iva: number;
  /** Cotización formal: incluye IVA. Por defecto no. */
  con_iva: boolean;
  /** Plazo de pago más largo de las líneas (0 = todo contado) y tasa mensual (%) con la que se calcula el recargo. */
  plazo_dias: number;
  tasa_mensual: number;
  /** Recargo por financiación en USD, sin IVA. */
  recargo_usd: number;
  /** Canje: cultivo y precio de referencia (USD/tn). Precio 0 = sin canje. */
  canje_cultivo: string | null;
  canje_precio_usd: number;
  estado: EstadoCotizacion;
  motivo_perdida: string | null;
  vigencia_dias: number;
  vendedor: string | null;
  lista_id: string | null;
  subtotal_usd: number;
  iva_usd: number;
  total_usd: number;
  total_ars: number;
  notas: string | null;
  cantidades_reales: Record<string, { cantidad: number; precio: number }> | null;
  cotizacion_origen_id: string | null;
  probabilidad: number | null;
  fecha_cierre_estimada: string | null;
  fecha_envio: string | null;
  created_at: string;
  updated_at: string;
}

export interface Tarea {
  id: string;
  created_at: string;
  titulo: string;
  descripcion: string | null;
  tipo: string;
  prioridad: string;
  fecha_vencimiento: string;
  hora: string | null;
  estado: string;
  asignado_a: string | null;
  creada_por: string | null;
  cotizacion_id: string | null;
  cliente_id: string | null;
  completada_at: string | null;
  resultado: string | null;
  cotizacion?: { numero: number } | null;
  cliente?: { nombre: string } | null;
}

export interface Visita {
  id: string;
  created_at: string;
  fecha: string;
  hora: string | null;
  tipo: string;
  estado: string;
  cliente_id: string | null;
  cotizacion_id: string | null;
  establecimiento: string | null;
  lote: string | null;
  ubicacion_texto: string | null;
  latitud: number | null;
  longitud: number | null;
  cultivo: string | null;
  estadio: string | null;
  objetivo: string | null;
  observaciones: string | null;
  problema_detectado: string | null;
  recomendacion: string | null;
  proximos_pasos: string | null;
  responsable: string | null;
  creada_por: string | null;
  cliente?: { nombre: string } | null;
  cotizacion?: { numero: number } | null;
}

export interface VisitaFoto {
  id: string;
  visita_id: string;
  storage_path: string;
  descripcion: string | null;
  created_at: string;
}

export interface HistorialCambio {
  id: string;
  created_at: string;
  usuario_nombre: string;
  usuario_id: string | null;
  tipo: string;
  cotizacion_id: string | null;
  entidad: string | null;
  campo: string | null;
  valor_anterior: string | null;
  valor_nuevo: string | null;
  detalle: string | null;
}

export interface CotizacionLinea {
  id: string;
  cotizacion_id: string;
  producto_id: string | null;
  cod: string;
  producto: string;
  familia: string;
  proveedor: string;
  unid: string;
  es_fertilizante: boolean;
  cantidad: number;
  costo_usd: number;
  costo_lista_usd: number | null;
  costo_editado: boolean;
  margen: number;
  precio_usd: number;
  flete_usd: number;
  total_usd: number;
  con_flete: boolean;
  /** Plazo de pago de esta línea en días (0 = contado). null en cotizaciones viejas: se usa el de la cabecera. */
  plazo_dias: number | null;
  /** Alícuota de IVA de esta línea (%). null en cotizaciones viejas: se usa la de la cabecera. */
  iva: number | null;
  orden: number;
}

export interface ProductoConCosto extends Producto {
  costo: number;
  moneda: 'USD' | 'ARS';
  margen_default: number | null;
  margen_producto: number | null;
  es_fertilizante: boolean;
}

export interface Cobranza {
  id: string;
  cotizacion_id: string;
  vencimiento: string;
  plazo_dias: number;
  /** Monto a cobrar en USD: con financiación e IVA si la cotización lo lleva. */
  monto_usd: number;
  estado: 'Pendiente' | 'Cobrada';
  cobrada_el: string | null;
  nota: string | null;
  created_at: string;
  updated_at: string;
  cotizacion?: Pick<Cotizacion, 'numero' | 'cliente_nombre' | 'canje_cultivo' | 'canje_precio_usd' | 'con_iva'> | null;
}
