/**
 * Manejo de fechas en zona horaria de Argentina.
 *
 * Reglas:
 * - Las fechas "sin hora" (columnas date de la base) viajan siempre como texto 'YYYY-MM-DD'.
 *   Nunca se pasan por new Date('YYYY-MM-DD'), que JavaScript interpreta como UTC y en
 *   Argentina muestra el día anterior.
 * - "Hoy" se calcula en America/Argentina/Buenos_Aires, no en UTC: a partir de las 21:00
 *   hora local, toISOString() ya devuelve el día siguiente.
 * - Los timestamps con hora (timestamptz) se muestran siempre en zona Buenos Aires.
 */

export const ZONA_AR = 'America/Argentina/Buenos_Aires';

function partesAR(ahora: Date): { y: string; m: string; d: string; hh: string; mm: string } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_AR,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(ahora)) p[part.type] = part.value;
  return { y: p.year, m: p.month, d: p.day, hh: p.hour, mm: p.minute };
}

/** Fecha de hoy 'YYYY-MM-DD' en zona Buenos Aires. */
export function hoyAR(ahora: Date = new Date()): string {
  const { y, m, d } = partesAR(ahora);
  return `${y}-${m}-${d}`;
}

/** Mes actual 'YYYY-MM' en zona Buenos Aires. */
export function mesActualAR(ahora: Date = new Date()): string {
  return hoyAR(ahora).slice(0, 7);
}

function aUTC(fecha: string): number {
  const [y, m, d] = fecha.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function deUTC(ms: number): string {
  const dt = new Date(ms);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Suma (o resta) días a un 'YYYY-MM-DD' sin depender de la zona del navegador. */
export function sumarDias(fecha: string, dias: number): string {
  return deUTC(aUTC(fecha) + dias * 86400000);
}

/** Días enteros entre dos fechas 'YYYY-MM-DD' (hasta - desde). */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((aUTC(hasta) - aUTC(desde)) / 86400000);
}

/** Días transcurridos desde una fecha hasta hoy (en Argentina). */
export function diasDesde(fecha: string, ahora: Date = new Date()): number {
  return diasEntre(fecha.slice(0, 10), hoyAR(ahora));
}

/** 'YYYY-MM-DD' → 'dd/mm/aaaa' cortando el texto, sin new Date(). */
export function formatearFecha(fecha: string): string {
  if (!fecha) return '';
  const [y, m, d] = fecha.slice(0, 10).split('-');
  if (!y || !m || !d) return fecha;
  return `${d}/${m}/${y}`;
}

/** Timestamp ISO (timestamptz) → 'dd/mm/aaaa hh:mm' en zona Buenos Aires. */
export function formatearFechaHora(iso: string): string {
  if (!iso) return '';
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return iso;
  const { y, m, d, hh, mm } = partesAR(dt);
  return `${d}/${m}/${y} ${hh}:${mm}`;
}

/** Timestamp ISO (timestamptz) → fecha 'YYYY-MM-DD' en zona Buenos Aires. */
export function fechaDeTimestamp(iso: string): string {
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return iso.slice(0, 10);
  return hoyAR(dt);
}

/** true si la fecha ya pasó (es anterior a hoy en Argentina). */
export function esFechaVencida(fecha: string, ahora: Date = new Date()): boolean {
  return fecha.slice(0, 10) < hoyAR(ahora);
}

/** Componentes de una fecha 'YYYY-MM-DD' (mes 1-12) para armar calendarios sin new Date(string). */
export function partesFecha(fecha: string): { anio: number; mes: number; dia: number } {
  const [anio, mes, dia] = fecha.slice(0, 10).split('-').map(Number);
  return { anio, mes, dia };
}

/** Arma 'YYYY-MM-DD' desde componentes (mes 1-12). */
export function armarFecha(anio: number, mes: number, dia: number): string {
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** Cantidad de días de un mes (mes 1-12). */
export function diasDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

/** Día de la semana (0 = domingo) de una fecha 'YYYY-MM-DD'. */
export function diaDeLaSemana(fecha: string): number {
  return new Date(aUTC(fecha)).getUTCDay();
}

/** Autoverificación (para tests y consola en desarrollo). Devuelve los casos que fallan. */
export function verificarFechas(): string[] {
  const fallos: string[] = [];
  const caso = (nombre: string, obtenido: unknown, esperado: unknown) => {
    if (obtenido !== esperado) fallos.push(`${nombre}: obtuvo ${String(obtenido)}, esperaba ${String(esperado)}`);
  };
  caso('hoyAR 22:30 AR', hoyAR(new Date('2026-10-06T01:30:00Z')), '2026-10-05');
  caso('hoyAR 00:30 AR', hoyAR(new Date('2026-10-05T03:30:00Z')), '2026-10-05');
  caso('sumarDias fin de mes', sumarDias('2026-10-31', 1), '2026-11-01');
  caso('sumarDias fin de año', sumarDias('2026-12-31', 1), '2027-01-01');
  caso('sumarDias negativo', sumarDias('2026-03-01', -1), '2026-02-28');
  caso('diasEntre', diasEntre('2026-10-01', '2026-10-05'), 4);
  caso('formatearFecha', formatearFecha('2026-10-05'), '05/10/2026');
  caso('formatearFechaHora', formatearFechaHora('2026-10-06T01:30:00Z'), '05/10/2026 22:30');
  return fallos;
}
