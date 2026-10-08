import type { ParamsCanje } from '@/lib/canje';
export type Rol = 'admin' | 'vendedor';

export interface Usuario {
  id: string;
  email: string;
  nombre: string | null;
  rol: Rol;
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
  /** Canje: parámetros de liquidación por defecto */
  canje_parametros: ParamsCanje;
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
  id?: string;
  km: number;
  /** Valor por 100 kg (× 10 = $/tn) */
  tarifa: number;
}

/** Convenio de flete: una planilla de tarifas con número y descripción. */
export interface ConvenioFlete {
  id: string;
  numero: number;
  descripcion: string;
  predeterminado: boolean;
  /** Los no vigentes no se ofrecen al cotizar, pero las cotizaciones viejas los conservan. */
  vigente: boolean;
  actualizado_at: string | null;
  created_at: string;
  /** Ordenadas por km */
  tarifas: TarifaFlete[];
}

export interface Cliente {
  id: string;
  nombre: string;
  cuit: string | null;
  zona: string | null;
  condiciones_pago: string | null;
  razon_social: string | null;
  domicilio: string | null;
  localidad: string | null;
  /** Usuario de la app dueño de la cuenta */
  vendedor_id: string | null;
  estado: EstadoCliente;
  observaciones: string | null;
  created_by: string | null;
  created_at: string;
}

export type EstadoCliente = 'Activo' | 'Prospecto' | 'Inactivo';

export interface Contacto {
  id: string;
  cliente_id: string;
  nombre: string;
  cargo: string | null;
  telefono: string | null;
  email: string | null;
  notas: string | null;
  principal: boolean;
  created_at: string;
  updated_at: string;
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

export type ModalidadFlete = 'directo' | 'largo' | 'largo_corto';

export interface Planta {
  id: string;
  nombre: string;
  km_puerto: number | null;
  created_at: string;
  updated_at: string;
}

/** Lo mínimo para mostrar el nombre de una cotización en tareas, visitas, cobros, etc. */
export interface RefCotizacion {
  numero: number;
  numero_cliente?: number | null;
  cliente_nombre?: string | null;
}

export interface Cotizacion {
  id: string;
  /** Número global interno (no se muestra). */
  numero: number;
  /** Correlativo del cliente: el nombre visible es "Cliente - 001" (ver nombreCotizacion). Lo asigna la base. */
  numero_cliente?: number | null;
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
  /** Parámetros de la liquidación del canje (neto por tn). null = cotización vieja: tn = total / precio. */
  canje_params?: ParamsCanje | null;
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
  /** Ganada: cantidad y precio reales por id de línea; motivo de lo que no se ganó (cantidad real menor a la cotizada). */
  /** Convenio de flete con el que se calculó (null = el predeterminado). En largo + corto, el del largo. */
  convenio_flete_id?: string | null;
  /** Fertilizantes: directo (origen → campo), largo (origen → planta) o largo + corto (+ planta → campo). */
  flete_modalidad?: ModalidadFlete;
  /** Tramo corto (solo largo + corto) */
  km_corto?: number;
  convenio_corto_id?: string | null;
  /** Campo del cliente del que se precargaron los km */
  campo_id?: string | null;
  /** TC con el que se pasó el flete a dólares (comprador divisa BNA). null = cotización vieja: se usó tc. */
  tc_flete?: number | null;
  cantidades_reales: Record<string, { cantidad: number; precio: number; motivo?: string | null }> | null;
  /** Ganada: subtotal realmente ganado (sin IVA ni financiación). Null si no está Ganada. */
  ganado_usd?: number | null;
  /** Ganada: lo que no se ganó, con su motivo. Null si no está Ganada. */
  no_ganado?: { cod: string; producto: string; cantidad: number; cotizada: number; usd: number; motivo: string | null }[] | null;
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
  cotizacion?: RefCotizacion | null;
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
  cotizacion?: RefCotizacion | null;
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
  cotizacion?: Pick<Cotizacion, 'numero' | 'numero_cliente' | 'cliente_nombre' | 'canje_cultivo' | 'canje_precio_usd' | 'canje_params' | 'con_iva'> | null;
}

export interface PedidoPrecioLinea {
  id: string;
  pedido_id: string;
  orden: number;
  cod: string;
  producto: string;
  unidad: string | null;
  es_fertilizante: boolean;
  cantidad: number;
  /** Costo cargado por la mesa: USD/tn en fertilizantes, USD por unidad en el resto. Null = pendiente. */
  costo_usd: number | null;
  proveedor: string | null;
}

export interface PedidoPrecio {
  id: string;
  cotizacion_id: string;
  token: string;
  estado: 'Abierto' | 'Respondido' | 'Cancelado';
  vence_el: string;
  auto_aplicar: boolean;
  nota: string | null;
  creado_por: string | null;
  respondido_por: string | null;
  respondido_at: string | null;
  nota_respuesta: string | null;
  correccion_solicitada: boolean;
  correccion_mensaje: string | null;
  aplicado_at: string | null;
  created_at: string;
  cotizacion?: Pick<Cotizacion, 'numero' | 'numero_cliente' | 'cliente_nombre'> | null;
  lineas?: PedidoPrecioLinea[];
}

/** Dólar divisa del Banco Nación (lo guarda la edge function tc-bna). */
export interface TipoCambioBNA {
  fecha: string;
  compra: number;
  venta: number;
  /** true si el BNA no respondió y es la última lectura guardada */
  desactualizado: boolean;
}

/** Campo de un cliente. */
export interface Campo {
  id: string;
  cliente_id: string;
  nombre: string;
  superficie_ha: number | null;
  localidad: string | null;
  km_puerto: number | null;
  /** Planta asignada */
  planta: string | null;
  km_planta: number | null;
  created_at: string;
  updated_at: string;
}

/** Ficha de un producto comercial (agrupa los códigos de sus envases). */
export interface FichaProducto {
  id: string;
  nombre: string;
  marbete_path: string | null;
  marbete_nombre: string | null;
  marbete_bytes: number | null;
  marbete_subido_at: string | null;
  marbete_subido_por: string | null;
  created_at: string;
  updated_at: string;
}

export interface ComentarioFicha {
  id: string;
  ficha_id: string;
  autor_id: string | null;
  autor_nombre: string | null;
  etiqueta: 'Manejo' | 'Posicionamiento' | 'Técnico' | null;
  texto: string;
  created_at: string;
  updated_at: string;
}

/** Pedido de facturación (foto de lo que se manda a facturar). */
export interface PedidoFacturacion {
  id: string;
  cotizacion_id: string;
  token: string;
  estado: 'Pendiente' | 'Facturado' | 'Observado' | 'Cancelado';
  vence_el: string;
  nota_venta: string | null;
  observaciones: string | null;
  cliente: ClienteFacturacion;
  condiciones: import('@/lib/facturacion').CondicionPago[];
  lineas: import('@/lib/facturacion').LineaFacturacion[];
  totales: import('@/lib/facturacion').TotalesFacturacion;
  extra: ExtraFacturacion;
  creado_por: string | null;
  enviado_at: string;
  factura_numero: string | null;
  factura_fecha: string | null;
  facturado_por: string | null;
  facturado_at: string | null;
  observacion: string | null;
  observado_por: string | null;
  observado_at: string | null;
  created_at: string;
  cotizacion?: { numero: number; numero_cliente?: number | null; cliente_nombre: string | null; estado: string } | null;
}

export interface ClienteFacturacion {
  nombre: string;
  razon_social: string | null;
  cuit: string | null;
  domicilio: string | null;
  localidad: string | null;
}

export interface ExtraFacturacion {
  numero?: number;
  numero_cliente?: number | null;
  fecha_cotizacion?: string;
  tc?: number;
  tc_flete?: number | null;
  flete?: string | null;
  vendedor?: string | null;
}

/** Cálculo de canje guardado desde la calculadora (historial por cliente). */
export interface CanjeGuardado {
  id: string;
  cliente_id: string | null;
  cliente_nombre: string | null;
  cotizacion_id: string | null;
  cultivo: string;
  precio_usd: number;
  params: ParamsCanje;
  neto_usd: number;
  /** Total de insumos con IVA */
  monto_usd: number;
  iva_insumos_pct: number | null;
  tn: number;
  tc_compra: number | null;
  notas: string | null;
  autor_id: string | null;
  autor_nombre: string | null;
  created_at: string;
}

/** Precio del grano que pasa el acopio, uno por cultivo y día. */
export interface PrecioGrano {
  id: string;
  fecha: string;
  cultivo: string;
  precio_usd: number;
  destino: string | null;
  usuario_nombre: string | null;
  created_at: string;
  updated_at: string;
}
