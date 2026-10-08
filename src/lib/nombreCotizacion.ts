/**
 * Nombre visible de una cotización: "Cliente - 001".
 * El correlativo es por cliente y lo asigna la base (cotizaciones.numero_cliente).
 * Si todavía no lo tiene (por ejemplo, datos viejos en caché), cae al número global.
 */
export interface DatosNombre {
  cliente_nombre?: string | null;
  numero_cliente?: number | null;
  numero?: number | null;
}

export function correlativo(n: number): string {
  return String(Math.trunc(n)).padStart(3, '0');
}

function cliente(c: DatosNombre, fallback?: string | null): string {
  return (c.cliente_nombre || fallback || '').trim().replace(/\s+/g, ' ') || 'Sin cliente';
}

/** "Juan Perez - 001". `clienteFallback` se usa cuando la referencia no trae el nombre (p. ej. tareas con cliente aparte). */
export function nombreCotizacion(c: DatosNombre | null | undefined, clienteFallback?: string | null): string {
  if (!c) return 'Cotización';
  if (c.numero_cliente) return `${cliente(c, clienteFallback)} - ${correlativo(c.numero_cliente)}`;
  if (c.numero) return `${c.cliente_nombre || clienteFallback ? `${cliente(c, clienteFallback)} - ` : ''}N° ${c.numero}`;
  return 'Nueva cotización';
}

/** Para nombres de archivo: "Juan_Perez_001" (sin acentos ni caracteres raros). */
export function archivoCotizacion(c: DatosNombre, clienteFallback?: string | null): string {
  return limpiarParaArchivo(nombreCotizacion(c, clienteFallback));
}

/** "Juan Perez - 001" → "Juan_Perez_001". */
export function limpiarParaArchivo(nombre: string): string {
  return nombre
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/N° /g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'cotizacion';
}

/**
 * Lo que alguien escribe para buscar una cotización: "Juan Perez - 001" → cliente + correlativo;
 * "Juan Perez" → todas las de ese cliente; "001" o "7" → ese correlativo en cualquier cliente.
 */
export function interpretarBusqueda(texto: string): { cliente: string; numero: number | null } | null {
  const t = texto.trim().replace(/\s+/g, ' ');
  if (!t) return null;
  const m = t.match(/^(.*?)\s*-\s*(\d+)$/);
  if (m) return { cliente: m[1].trim(), numero: parseInt(m[2], 10) || null };
  if (/^\d+$/.test(t)) return { cliente: '', numero: parseInt(t, 10) || null };
  return { cliente: t, numero: null };
}
