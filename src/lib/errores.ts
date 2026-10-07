/**
 * Errores de la aplicación: todo fallo de base de datos se convierte en un ErrorApp
 * con un mensaje en castellano que se le puede mostrar al usuario.
 */

export class ErrorApp extends Error {
  readonly causa?: unknown;
  constructor(mensaje: string, causa?: unknown) {
    super(mensaje);
    this.name = 'ErrorApp';
    this.causa = causa;
  }
}

interface ErrorSupabase {
  message?: string;
  code?: string;
  details?: string;
}

/** Traduce un error de Supabase/Postgres a un mensaje entendible. */
export function traducirError(err: unknown): string {
  if (err instanceof ErrorApp) return err.message;
  const e = (err ?? {}) as ErrorSupabase;
  const msg = e.message || (err instanceof Error ? err.message : '') || '';

  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
    return 'No se pudo conectar con el servidor. Revisá tu conexión a internet.';
  }
  if (e.code === '23503') return 'No se puede completar la operación porque hay datos que dependen de este registro.';
  if (e.code === '23505') return 'Ya existe un registro con esos datos.';
  if (e.code === '23514') return 'Los datos no cumplen una regla de validación (por ejemplo, falta el motivo de pérdida).';
  if (e.code === '42501') return 'No tenés permiso para hacer esta operación.';
  // Mensajes propios levantados con RAISE EXCEPTION en las funciones SQL
  if (e.code === 'P0001' && msg) return msg;
  return msg ? `Error: ${msg}` : 'Ocurrió un error inesperado.';
}

interface RespuestaSupabase<T> {
  data: T;
  error: { message?: string; code?: string; details?: string } | null;
}

/** Espera una consulta de Supabase; si devolvió error lo lanza como ErrorApp. */
export async function ok<T>(consulta: PromiseLike<RespuestaSupabase<T>>): Promise<T> {
  const { data, error } = await consulta;
  if (error) {
    console.error('Error de base de datos:', error);
    throw new ErrorApp(traducirError(error), error);
  }
  return data;
}
