/** Nombre del usuario logueado, para firmar los registros del historial sin depender de React. */
let nombre = 'Admin';

export function fijarUsuarioActual(n: string) {
  nombre = n || 'Admin';
}

export function usuarioActual(): string {
  return nombre;
}
