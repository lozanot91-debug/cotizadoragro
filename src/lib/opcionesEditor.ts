import type { OpcionPago } from '@/types';
import { ID_PRINCIPAL, normalizarOpciones, validarOpciones } from '@/lib/opcionesPago';
import { formatInputNumber, parseNumberInput } from '@/lib/format';

/** Opción NO principal tal como se edita: plazos por clave de línea (no por posición), tasa como texto. */
export interface OpcionEditable {
  id: string;
  nombre: string;
  tasa: string;
  plazoPorKey: Record<string, number>;
}

/** "Opción 2", "Opción 3"... el primer número libre. */
export function nombreOpcionPorDefecto(nombres: string[]): string {
  let n = 2;
  while (nombres.includes(`Opción ${n}`)) n++;
  return `Opción ${n}`;
}

export function nuevoIdOpcion(existentes: string[]): string {
  let id: string;
  do { id = `op-${Math.random().toString(36).slice(2, 8)}`; } while (existentes.includes(id));
  return id;
}

/** Cargar: posiciones -> claves, siguiendo el orden de las líneas cargadas. La principal se ignora. */
export function opcionesAEditor(opciones: OpcionPago[] | null | undefined, keys: string[]): OpcionEditable[] {
  return (opciones ?? [])
    .filter((o) => o && o.id !== ID_PRINCIPAL && Array.isArray(o.plazos))
    .map((o) => ({
      id: o.id,
      nombre: o.nombre ?? '',
      tasa: formatInputNumber(Number(o.tasa_mensual) || 0, 2),
      plazoPorKey: Object.fromEntries(keys.map((k, i) => [k, Math.max(0, Math.trunc(Number(o.plazos[i])) || 0)])),
    }));
}

/** Guardar: claves -> posiciones según el orden ACTUAL de las líneas (las claves que ya no están se descartan). */
export function editorAOpciones(ed: OpcionEditable[], keys: string[]): OpcionPago[] {
  return ed.map((o) => ({
    id: o.id,
    nombre: o.nombre.trim(),
    tasa_mensual: parseNumberInput(o.tasa),
    plazos: keys.map((k) => o.plazoPorKey[k] ?? 0),
  }));
}

/** Arreglo a guardar: [] sin extras; si hay, [principal, ...extras] normalizado + errores de validación. */
export function opcionesParaGuardar(principal: OpcionPago, ed: OpcionEditable[], keys: string[]): { opciones: OpcionPago[]; errores: string[] } {
  if (ed.length === 0) return { opciones: [], errores: [] };
  const opciones = normalizarOpciones([principal, ...editorAOpciones(ed, keys)], keys.length);
  return { opciones, errores: validarOpciones(opciones, keys.length) };
}

/** Firma de las opciones NO principales, para saber si hay cambios sin guardar. */
export function firmaExtras(opciones: OpcionPago[] | null | undefined, nLineas: number): string {
  return JSON.stringify(
    normalizarOpciones(opciones, nLineas)
      .filter((o) => o.id !== ID_PRINCIPAL)
      .map((o) => [o.id, o.nombre.trim(), o.tasa_mensual, o.plazos])
  );
}
