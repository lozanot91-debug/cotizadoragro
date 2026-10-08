/**
 * Lee la cotización del dólar DIVISA de la página del Banco Nación (bna.com.ar/Personas).
 * La página tiene dos tablas: billetes (pestaña por defecto) y divisas (`id="divisas"`).
 * Se usa la de divisas. Sin dependencias: lo usan la edge function (Deno) y los tests (vitest).
 */

export interface DivisaBNA {
  /** Fecha que publica el BNA, en formato AAAA-MM-DD */
  fecha: string;
  compra: number;
  venta: number;
}

/** "1517.0000" → 1517 ; "1.517,50" → 1517.5 */
export function numeroBNA(txt: string): number {
  const t = txt.trim();
  const n = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  return Number(n);
}

/** "7/10/2026" → "2026-10-07" */
function fechaISO(d: string, m: string, a: string): string {
  return `${a}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

export function parsearDivisaBNA(html: string): DivisaBNA {
  const inicio = html.search(/id\s*=\s*["']divisas["']/i);
  if (inicio < 0) throw new Error('No se encontró la tabla de divisas en la página del BNA');
  // La sección de divisas termina donde empieza la próxima pestaña
  const resto = html.slice(inicio);
  const fin = resto.slice(20).search(/class\s*=\s*["'][^"']*tab-pane/i);
  const seccion = fin > 0 ? resto.slice(0, fin + 20) : resto.slice(0, 8000);

  const f = seccion.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!f) throw new Error('No se encontró la fecha de la cotización de divisas');

  const fila = seccion.match(/D[oó]lar\s*U\.?\s*S\.?\s*A\.?[\s\S]*?<\/tr>/i);
  if (!fila) throw new Error('No se encontró la fila del dólar en la tabla de divisas');
  const valores = [...fila[0].matchAll(/<td[^>]*>\s*([\d.,]+)\s*<\/td>/gi)].map((m) => numeroBNA(m[1]));
  if (valores.length < 2) throw new Error('La fila del dólar no tiene compra y venta');
  const [compra, venta] = valores;

  if (!(compra > 100 && venta > 100 && venta < 1_000_000 && compra <= venta)) {
    throw new Error(`Valores raros leídos del BNA: compra ${compra}, venta ${venta}`);
  }
  return { fecha: fechaISO(f[1], f[2], f[3]), compra, venta };
}
