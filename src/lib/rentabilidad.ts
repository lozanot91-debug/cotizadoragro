/**
 * Rentabilidad real: cuánta plata se gana (o se regala) en cada cotización.
 *
 * Reglas:
 *  - Ganancia = (precio − costo) × cantidad, sin IVA, sin flete (el flete se paga al transportista)
 *    y sin el recargo por financiación (es interés, no margen comercial).
 *  - Margen real = ganancia / venta (sobre precio de venta, igual que el margen que se carga).
 *  - En las cotizaciones Ganadas, si se cargaron cantidades/precios reales, se usan esos.
 */
import type { Cotizacion, CotizacionLinea } from '@/types';
import { realDeLinea } from '@/lib/ganadaParcial';

export interface GananciaLinea {
  venta: number;
  costo: number;
  ganancia: number;
  /** Margen real sobre el precio de venta (%). 0 si no hay venta. */
  margenPct: number;
  usoReales: boolean;
}

/** Ganancia de una línea; `reales` son las cantidades/precios reales de una cotización ganada (por id de línea). */
export function gananciaLinea(
  l: Pick<CotizacionLinea, 'id' | 'cantidad' | 'precio_usd' | 'costo_usd'>,
  reales?: Cotizacion['cantidades_reales']
): GananciaLinea {
  // Cantidad real 0 = esa línea no se ganó (ganada parcial): no suma venta ni costo
  const { cantidad, precio } = realDeLinea(l, reales);
  const venta = precio * cantidad;
  const costo = (l.costo_usd || 0) * cantidad;
  const ganancia = venta - costo;
  return { venta, costo, ganancia, margenPct: venta > 0 ? (ganancia / venta) * 100 : 0, usoReales: Math.abs(cantidad - l.cantidad) > 0.005 || Math.abs(precio - l.precio_usd) > 0.005 };
}

export interface Fila {
  clave: string;
  detalle?: string;
  venta: number;
  costo: number;
  ganancia: number;
  margenPct: number;
  /** Cantidad de líneas y de cotizaciones distintas que aportaron. */
  lineas: number;
  cotizaciones: number;
  /** Id de la cotización (solo en la vista por cotización). */
  cotizacionId?: string;
}

export type Agrupar = 'producto' | 'proveedor' | 'familia' | 'cliente' | 'cotizacion';

export interface Opciones {
  estados: string[];
  /** 'YYYY-MM-DD' inclusive; vacío = sin límite. */
  desde?: string;
  hasta?: string;
}

export interface ResumenRentabilidad {
  venta: number;
  costo: number;
  ganancia: number;
  margenPct: number;
  cotizaciones: number;
  /** Cotizaciones incluidas con costo editado a mano en alguna línea. */
  conCostoEditado: number;
  filas: Record<Agrupar, Fila[]>;
}

function acumular(m: Map<string, Fila & { _cots: Set<string> }>, clave: string, g: GananciaLinea, cotizId: string, detalle?: string) {
  let f = m.get(clave);
  if (!f) {
    f = { clave, detalle, venta: 0, costo: 0, ganancia: 0, margenPct: 0, lineas: 0, cotizaciones: 0, _cots: new Set() };
    m.set(clave, f);
  }
  f.venta += g.venta; f.costo += g.costo; f.ganancia += g.ganancia; f.lineas++;
  f._cots.add(cotizId);
}

function cerrar(m: Map<string, Fila & { _cots: Set<string> }>): Fila[] {
  return [...m.values()]
    .map(({ _cots, ...f }) => ({ ...f, cotizaciones: _cots.size, margenPct: f.venta > 0 ? (f.ganancia / f.venta) * 100 : 0 }))
    .sort((a, b) => b.ganancia - a.ganancia);
}

export function calcularRentabilidad(
  cotizaciones: Cotizacion[],
  lineas: CotizacionLinea[],
  { estados, desde, hasta }: Opciones
): ResumenRentabilidad {
  const incluidas = new Map<string, Cotizacion>();
  for (const c of cotizaciones) {
    if (!estados.includes(c.estado)) continue;
    if (desde && c.fecha < desde) continue;
    if (hasta && c.fecha > hasta) continue;
    incluidas.set(c.id, c);
  }

  const maps: Record<Agrupar, Map<string, Fila & { _cots: Set<string> }>> = {
    producto: new Map(), proveedor: new Map(), familia: new Map(), cliente: new Map(), cotizacion: new Map(),
  };
  let venta = 0, costo = 0;
  const conEditado = new Set<string>();

  for (const l of lineas) {
    const c = incluidas.get(l.cotizacion_id);
    if (!c) continue;
    const g = gananciaLinea(l, c.estado === 'Ganada' ? c.cantidades_reales : null);
    venta += g.venta; costo += g.costo;
    if (l.costo_editado) conEditado.add(c.id);
    acumular(maps.producto, l.cod, g, c.id, l.producto);
    acumular(maps.proveedor, l.proveedor || 'Sin proveedor', g, c.id);
    acumular(maps.familia, l.familia || 'Sin familia', g, c.id);
    acumular(maps.cliente, c.cliente_nombre || 'Sin cliente', g, c.id);
    acumular(maps.cotizacion, `N° ${c.numero}`, g, c.id, c.cliente_nombre || 'Sin cliente');
  }

  const filas = {
    producto: cerrar(maps.producto), proveedor: cerrar(maps.proveedor), familia: cerrar(maps.familia),
    cliente: cerrar(maps.cliente), cotizacion: cerrar(maps.cotizacion),
  };
  // El id de la cotización viaja en la fila para poder abrirla
  const idPorClave = new Map([...incluidas.values()].map((c) => [`N° ${c.numero}`, c.id]));
  filas.cotizacion = filas.cotizacion.map((f) => ({ ...f, cotizacionId: idPorClave.get(f.clave) }));

  const ganancia = venta - costo;
  return {
    venta, costo, ganancia, margenPct: venta > 0 ? (ganancia / venta) * 100 : 0,
    cotizaciones: incluidas.size, conCostoEditado: conEditado.size, filas,
  };
}
