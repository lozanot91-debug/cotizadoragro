/** Qué le cotizaste y qué le vendiste a un cliente, producto por producto. */
import type { CotizacionLinea } from '@/types';
import { diasEntre } from '@/lib/fechas';

/** Una línea de cotización junto con los datos de su cotización. */
export interface LineaDeCliente {
  linea: CotizacionLinea;
  cotizacionId: string;
  numero: number;
  /** Nombre visible ("Cliente - 001"). */
  nombre?: string;
  fecha: string;
  estado: string;
}

export interface UltimaCotizacion {
  precio: number;
  cantidad: number;
  fecha: string;
  numero: number;
  nombre?: string;
  estado: string;
}

/** Orden: la más reciente primero (por fecha, y a igual fecha por número de cotización). */
function masReciente(a: LineaDeCliente, b: LineaDeCliente): number {
  return b.fecha.localeCompare(a.fecha) || b.numero - a.numero;
}

/** Última vez que se le cotizó este producto (sin contar la cotización que se está armando). */
export function ultimaCotizacion(lineas: LineaDeCliente[], cod: string, excluirCotizacionId?: string): UltimaCotizacion | null {
  const l = lineas
    .filter((x) => x.linea.cod === cod && x.cotizacionId !== excluirCotizacionId && x.estado !== 'Borrador')
    .sort(masReciente)[0]
    ?? lineas.filter((x) => x.linea.cod === cod && x.cotizacionId !== excluirCotizacionId).sort(masReciente)[0];
  if (!l) return null;
  return { precio: l.linea.precio_usd, cantidad: l.linea.cantidad, fecha: l.fecha, numero: l.numero, nombre: l.nombre, estado: l.estado };
}

export interface ProductoDeCliente {
  cod: string;
  producto: string;
  veces: number;
  ultima: UltimaCotizacion;
  /** Última cotización ganada de este producto (lo que realmente compró); null si nunca. */
  ultimaCompra: UltimaCotizacion | null;
  /** Días desde esa compra hasta hoy. */
  diasDesdeCompra: number | null;
}

/**
 * Productos del cliente. Primero los que ya compró, del que hace más tiempo no compra al más reciente
 * (los candidatos a reponer); después los que solo se cotizaron.
 */
export function productosDelCliente(lineas: LineaDeCliente[], hoy: string): ProductoDeCliente[] {
  const porCod = new Map<string, LineaDeCliente[]>();
  for (const l of lineas) porCod.set(l.linea.cod, [...(porCod.get(l.linea.cod) || []), l]);
  const out: ProductoDeCliente[] = [];
  for (const [cod, ls] of porCod) {
    const orden = [...ls].sort(masReciente);
    const toU = (l: LineaDeCliente): UltimaCotizacion => ({ precio: l.linea.precio_usd, cantidad: l.linea.cantidad, fecha: l.fecha, numero: l.numero, nombre: l.nombre, estado: l.estado });
    const compra = orden.find((l) => l.estado === 'Ganada');
    out.push({
      cod,
      producto: orden[0].linea.producto,
      veces: new Set(ls.map((l) => l.cotizacionId)).size,
      ultima: toU(orden[0]),
      ultimaCompra: compra ? toU(compra) : null,
      diasDesdeCompra: compra ? diasEntre(compra.fecha, hoy) : null,
    });
  }
  return out.sort((a, b) => {
    if (a.ultimaCompra && b.ultimaCompra) return b.diasDesdeCompra! - a.diasDesdeCompra!;
    if (a.ultimaCompra) return -1;
    if (b.ultimaCompra) return 1;
    return b.ultima.fecha.localeCompare(a.ultima.fecha);
  });
}
