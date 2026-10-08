export const MIN_PASSWORD = 8;

/** Valida la contraseña nueva. Devuelve el error a mostrar o null si está bien. */
export function validarPasswordNueva(password: string, repetida: string): string | null {
  if (password.length < MIN_PASSWORD) return `La contraseña tiene que tener al menos ${MIN_PASSWORD} caracteres.`;
  if (password !== repetida) return 'Las dos contraseñas no coinciden.';
  return null;
}
