/** Validación y armado de los campos de un cliente. */
import type { Campo } from '@/types';
import { formatInputNumber, parseNumberInput } from '@/lib/format';

export interface FormCampo {
  nombre: string;
  superficie: string;
  localidad: string;
  kmPuerto: string;
  planta: string;
  kmPlanta: string;
}

export const FORM_CAMPO_VACIO: FormCampo = { nombre: '', superficie: '', localidad: '', kmPuerto: '', planta: '', kmPlanta: '' };

export function formDeCampo(c: Campo): FormCampo {
  const n = (v: number | null) => (v === null || v === undefined ? '' : formatInputNumber(v, v % 1 === 0 ? 0 : 2));
  return {
    nombre: c.nombre, superficie: n(c.superficie_ha), localidad: c.localidad || '',
    kmPuerto: n(c.km_puerto), planta: c.planta || '', kmPlanta: n(c.km_planta),
  };
}

/** Número opcional: vacío = null; negativo o inválido = error. */
function numOpcional(txt: string): number | null | 'error' {
  const t = txt.trim();
  if (!t) return null;
  if (!/^[\d.,]+$/.test(t)) return 'error';
  const n = parseNumberInput(t);
  return Number.isFinite(n) && n >= 0 ? n : 'error';
}

/** Pasa el formulario a una fila de la base, o devuelve el error a mostrar. */
export function validarCampo(f: FormCampo):
  | { ok: true; datos: Pick<Campo, 'nombre' | 'superficie_ha' | 'localidad' | 'km_puerto' | 'planta' | 'km_planta'> }
  | { ok: false; error: string } {
  const nombre = f.nombre.trim();
  if (!nombre) return { ok: false, error: 'Poné el nombre del campo.' };
  if (nombre.length > 120) return { ok: false, error: 'El nombre es muy largo.' };
  const sup = numOpcional(f.superficie), kmP = numOpcional(f.kmPuerto), kmPl = numOpcional(f.kmPlanta);
  if (sup === 'error') return { ok: false, error: 'La superficie tiene que ser un número.' };
  if (kmP === 'error') return { ok: false, error: 'Los km a puerto tienen que ser un número.' };
  if (kmPl === 'error') return { ok: false, error: 'Los km a planta tienen que ser un número.' };
  return {
    ok: true,
    datos: {
      nombre,
      superficie_ha: sup,
      localidad: f.localidad.trim() || null,
      km_puerto: kmP,
      planta: f.planta.trim() || null,
      km_planta: kmPl,
    },
  };
}

/** Superficie total de los campos (ha). */
export function superficieTotal(campos: Pick<Campo, 'superficie_ha'>[]): number {
  return campos.reduce((s, c) => s + (c.superficie_ha || 0), 0);
}
