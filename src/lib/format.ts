import { fechaDeTimestamp, formatearFecha, hoyAR, partesFecha } from '@/lib/fechas';

export function formatARS(value: number, decimals = 2): string {
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value || 0);
}

export function formatUSD(value: number, decimals = 2): string {
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value || 0);
}

export function formatNumber(value: number, decimals = 2): string {
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value || 0);
}

export function formatPercent(value: number, decimals = 1): string {
  return `${formatNumber(value, decimals)}%`;
}

/** Normaliza lo que llegue (texto 'YYYY-MM-DD', timestamp ISO o Date) a 'YYYY-MM-DD' en zona Argentina. */
function aFechaAR(date: string | Date): string {
  if (typeof date === 'string') {
    // Fecha sin hora: se usa tal cual (new Date('YYYY-MM-DD') la correría un día en Argentina).
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
    return fechaDeTimestamp(date);
  }
  return hoyAR(date);
}

export function formatDate(date: string | Date): string {
  if (!date) return '';
  return formatearFecha(aFechaAR(date));
}

export function formatDateLong(date: string | Date): string {
  if (!date) return '';
  const { anio, mes, dia } = partesFecha(aFechaAR(date));
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(anio, mes - 1, dia)));
}

/**
 * Convierte lo que se escribe en un campo a número. Acepta formato argentino ("1.500,25")
 * y también punto decimal ("10.5"). Un punto seguido de exactamente 3 dígitos se toma
 * como separador de miles ("1.500" = 1500).
 */
export function parseNumberInput(value: string): number {
  if (!value) return 0;
  let s = String(value).trim().replace(/\s/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

export function formatInputNumber(value: number, decimals = 2): string {
  if (!value) return '';
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(value);
}
