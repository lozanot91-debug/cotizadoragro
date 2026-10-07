import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { formatUSD } from '@/lib/format';

export interface CambioHistorial {
  tipo: string;
  cotizacion_id?: string | null;
  entidad?: string | null;
  campo?: string | null;
  valor_anterior?: string | null;
  valor_nuevo?: string | null;
  detalle?: string | null;
}

function getUsuarioNombre(): string {
  try {
    const stored = localStorage.getItem('operador_nombre');
    return stored || 'Admin';
  } catch {
    return 'Admin';
  }
}

export async function registrarCambio(cambio: CambioHistorial): Promise<void> {
  try {
    const { error } = await supabase.from('historial_cambios').insert({
      usuario_nombre: getUsuarioNombre(),
      tipo: cambio.tipo,
      cotizacion_id: cambio.cotizacion_id ?? null,
      entidad: cambio.entidad ?? null,
      campo: cambio.campo ?? null,
      valor_anterior: cambio.valor_anterior ?? null,
      valor_nuevo: cambio.valor_nuevo ?? null,
      detalle: cambio.detalle ?? null,
    });
    if (error) console.error('historial insert error:', error);
  } catch (e) {
    console.error('historial error:', e);
  }
}

export async function registrarCambios(cambios: CambioHistorial[]): Promise<void> {
  if (cambios.length === 0) return;
  try {
    const usuario_nombre = getUsuarioNombre();
    const rows = cambios.map((c) => ({
      usuario_nombre,
      tipo: c.tipo,
      cotizacion_id: c.cotizacion_id ?? null,
      entidad: c.entidad ?? null,
      campo: c.campo ?? null,
      valor_anterior: c.valor_anterior ?? null,
      valor_nuevo: c.valor_nuevo ?? null,
      detalle: c.detalle ?? null,
    }));
    const { error } = await supabase.from('historial_cambios').insert(rows);
    if (error) console.error('historial batch insert error:', error);
  } catch (e) {
    console.error('historial batch error:', e);
  }
}

export function fmtMargen(v: number | null | undefined): string {
  if (v === null || v === undefined) return 'General';
  return `${v}%`;
}

export function fmtUSD(v: number | null | undefined): string {
  return `USD ${formatUSD(v || 0)}`;
}
