/** Flete de fertilizantes por modalidad: directo, largo o largo + corto. */
import type { TramoFlete } from '@/lib/calculations';
import type { Campo, ModalidadFlete, Planta, TarifaFlete } from '@/types';
import { parseNumberInput } from '@/lib/format';
import { factorAforo } from '@/lib/fleteAforo';

export const MODALIDADES: { valor: ModalidadFlete; nombre: string; detalle: string }[] = [
  { valor: 'directo', nombre: 'Directo', detalle: 'Origen → campo' },
  { valor: 'largo', nombre: 'Largo', detalle: 'Origen → planta' },
  { valor: 'largo_corto', nombre: 'Largo + corto', detalle: 'Origen → planta → campo' },
];

export function esModalidad(v: unknown): v is ModalidadFlete {
  return v === 'directo' || v === 'largo' || v === 'largo_corto';
}

export function nombreModalidad(m: ModalidadFlete | null | undefined): string {
  return MODALIDADES.find((x) => x.valor === m)?.nombre ?? 'Directo';
}

/** Nombre del tramo principal en pantalla. */
export function nombreTramoPrincipal(m: ModalidadFlete): string {
  return m === 'directo' ? 'Directo (origen → campo)' : 'Largo (origen → planta)';
}

export const tieneCorto = (m: ModalidadFlete) => m === 'largo_corto';

/** Tramos a sumar según la modalidad. */
export function tramosDeCotizacion(input: {
  modalidad: ModalidadFlete;
  km: number;
  tarifas: TarifaFlete[];
  kmCorto: number;
  tarifasCorto: TarifaFlete[];
  /**
   * Aforo (tn) y tn cargadas con flete. En directo/largo, aforoTn va al único tramo.
   * En largo_corto el aforo va SOLO al corto (aforoCortoTn); el largo nunca lleva aforo y aforoTn se ignora.
   */
  aforoTn?: number | null;
  aforoCortoTn?: number | null;
  tnCargadas?: number;
}): TramoFlete[] {
  const tn = input.tnCargadas ?? 0;
  const conFactor = (aforo: number | null | undefined) => {
    const f = factorAforo(tn, aforo);
    return f > 1 ? { factorAforo: f } : {};
  };
  if (tieneCorto(input.modalidad)) {
    return [
      { km: input.km, tarifas: input.tarifas },
      { km: input.kmCorto, tarifas: input.tarifasCorto, ...conFactor(input.aforoCortoTn) },
    ];
  }
  return [{ km: input.km, tarifas: input.tarifas, ...conFactor(input.aforoTn) }];
}

/** Km del tramo que todavía falta cargar (para avisar). */
export function kmFaltantes(modalidad: ModalidadFlete, km: number, kmCorto: number): string[] {
  const f: string[] = [];
  if (!(km > 0)) f.push(modalidad === 'directo' ? 'km del directo' : 'km del largo');
  if (tieneCorto(modalidad) && !(kmCorto > 0)) f.push('km del corto');
  return f;
}

const norm = (s: string | null | undefined) => (s || '').trim().toLowerCase();

export function plantaDeCampo(campo: Pick<Campo, 'planta'> | null | undefined, plantas: Pick<Planta, 'nombre' | 'km_puerto'>[]) {
  if (!campo?.planta) return null;
  return plantas.find((p) => norm(p.nombre) === norm(campo.planta)) ?? null;
}

export interface KmSugerido {
  km: number;
  /** De dónde sale, para mostrarlo: "km a puerto de La Peña" */
  origen: string;
}

/**
 * Km que se pueden precargar desde el campo elegido (y su planta). null si no hay dato.
 * Directo: km del campo a puerto. Largo: km de la planta a puerto. Corto: km del campo a su planta.
 */
export function kmSugeridos(
  modalidad: ModalidadFlete,
  campo: Pick<Campo, 'nombre' | 'km_puerto' | 'planta' | 'km_planta'> | null | undefined,
  plantas: Pick<Planta, 'nombre' | 'km_puerto'>[],
): { principal: KmSugerido | null; corto: KmSugerido | null } {
  if (!campo) return { principal: null, corto: null };
  let principal: KmSugerido | null = null;
  if (modalidad === 'directo') {
    if (campo.km_puerto) principal = { km: campo.km_puerto, origen: `km a puerto de ${campo.nombre}` };
  } else {
    const p = plantaDeCampo(campo, plantas);
    if (p?.km_puerto) principal = { km: p.km_puerto, origen: `km de planta ${p.nombre} a puerto` };
  }
  const corto = tieneCorto(modalidad) && campo.km_planta
    ? { km: campo.km_planta, origen: `km de ${campo.nombre} a su planta` }
    : null;
  return { principal, corto };
}

/**
 * Lo que ve el cliente sobre el flete (PDF y WhatsApp): dónde queda puesto y los km.
 * "Puesto en campo · 180 km", "Puesto en planta · 165 km", "Puesto en campo · 165 + 25 km". null sin km.
 */
export function textoFlete(c: { km: number; flete_modalidad?: ModalidadFlete | null; km_corto?: number | null }): string | null {
  if (!(c.km > 0)) return null;
  const m = c.flete_modalidad ?? 'directo';
  if (m === 'largo') return `Puesto en planta · ${c.km} km`;
  if (m === 'largo_corto' && Number(c.km_corto) > 0) return `Puesto en campo · ${c.km} + ${Number(c.km_corto)} km`;
  return `Puesto en campo · ${c.km} km`;
}

export function validarPlanta(nombre: string, kmTxt: string, existentes: Pick<Planta, 'id' | 'nombre'>[], idActual?: string):
  | { ok: true; nombre: string; km_puerto: number | null }
  | { ok: false; error: string } {
  const n = nombre.trim();
  if (!n) return { ok: false, error: 'Poné el nombre de la planta.' };
  if (n.length > 120) return { ok: false, error: 'El nombre es muy largo.' };
  if (existentes.some((p) => p.nombre.trim().toLowerCase() === n.toLowerCase() && p.id !== idActual)) return { ok: false, error: `Ya hay una planta "${n}".` };
  const t = kmTxt.trim();
  if (!t) return { ok: true, nombre: n, km_puerto: null };
  if (!/^[\d.,]+$/.test(t)) return { ok: false, error: 'Los km tienen que ser un número.' };
  const km = parseNumberInput(t);
  if (!(km >= 0)) return { ok: false, error: 'Los km tienen que ser un número.' };
  return { ok: true, nombre: n, km_puerto: km };
}

/**
 * Resumen en una línea para el bloque de flete cerrado:
 * "Largo + corto · 165 + 25 km · USD 28,96/tn". Sin km: solo la modalidad y "sin km".
 */
export function resumenFlete(r: { modalidad: ModalidadFlete; km: number; kmCorto: number; usdTn: number | null; formato: (n: number) => string }): string {
  const partes = [nombreModalidad(r.modalidad)];
  const fmtKm = (n: number) => r.formato(n).replace(/,00$/, '');
  if (r.km > 0) partes.push(tieneCorto(r.modalidad) && r.kmCorto > 0 ? `${fmtKm(r.km)} + ${fmtKm(r.kmCorto)} km` : `${fmtKm(r.km)} km`);
  else partes.push('sin km');
  if (r.usdTn !== null && r.usdTn > 0) partes.push(`USD ${r.formato(r.usdTn)}/tn`);
  return partes.join(' · ');
}
