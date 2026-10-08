/** Ficha del cliente: formulario, filtros de la lista y búsqueda. */
import type { Cliente, EstadoCliente } from '@/types';

export const ESTADOS_CLIENTE: EstadoCliente[] = ['Activo', 'Prospecto', 'Inactivo'];

export interface FormCliente {
  nombre: string;
  razon_social: string;
  cuit: string;
  domicilio: string;
  localidad: string;
  zona: string;
  condiciones_pago: string;
  vendedor_id: string;
  estado: EstadoCliente;
  observaciones: string;
}

export function formClienteVacio(vendedorId = ''): FormCliente {
  return {
    nombre: '', razon_social: '', cuit: '', domicilio: '', localidad: '', zona: '',
    condiciones_pago: '', vendedor_id: vendedorId, estado: 'Activo', observaciones: '',
  };
}

export function formDeCliente(c: Cliente): FormCliente {
  return {
    nombre: c.nombre, razon_social: c.razon_social || '', cuit: c.cuit || '', domicilio: c.domicilio || '',
    localidad: c.localidad || '', zona: c.zona || '', condiciones_pago: c.condiciones_pago || '',
    vendedor_id: c.vendedor_id || '', estado: c.estado || 'Activo', observaciones: c.observaciones || '',
  };
}

export type DatosCliente = Pick<Cliente,
  'nombre' | 'razon_social' | 'cuit' | 'domicilio' | 'localidad' | 'zona' | 'condiciones_pago' | 'vendedor_id' | 'estado' | 'observaciones'>;

export function validarCliente(f: FormCliente): { ok: true; datos: DatosCliente } | { ok: false; error: string } {
  const t = (s: string) => s.trim() || null;
  const nombre = f.nombre.trim();
  if (!nombre) return { ok: false, error: 'Poné el nombre del cliente.' };
  if ((f.razon_social.trim()).length > 160) return { ok: false, error: 'La razón social es muy larga.' };
  if ((f.domicilio.trim()).length > 200) return { ok: false, error: 'El domicilio es muy largo.' };
  if ((f.localidad.trim()).length > 120) return { ok: false, error: 'La localidad es muy larga.' };
  if ((f.observaciones.trim()).length > 2000) return { ok: false, error: 'Las observaciones son muy largas (máximo 2000 caracteres).' };
  if (!ESTADOS_CLIENTE.includes(f.estado)) return { ok: false, error: 'Elegí un estado válido.' };
  return {
    ok: true,
    datos: {
      nombre, razon_social: t(f.razon_social), cuit: t(f.cuit), domicilio: t(f.domicilio),
      localidad: t(f.localidad), zona: t(f.zona), condiciones_pago: t(f.condiciones_pago),
      vendedor_id: f.vendedor_id || null, estado: f.estado, observaciones: t(f.observaciones),
    },
  };
}

/** Lo que se muestra de cada cliente en la lista, además de sus datos. */
export interface ResumenCliente {
  contacto: { nombre: string; cargo: string | null; telefono: string | null } | null;
  /** Nombres y mails de todos sus contactos, para buscar. */
  textoContactos: string;
  telefonos: string[];
  hectareas: number;
}

export type FiltroEstado = 'vigentes' | 'todos' | EstadoCliente;

export interface FiltrosClientes {
  busqueda: string;
  estado: FiltroEstado;
  /** '' = todos; 'sin' = sin vendedor; o el id del usuario */
  vendedor: string;
}

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function filtrarClientes(
  clientes: Cliente[],
  resumen: Record<string, ResumenCliente | undefined>,
  f: FiltrosClientes,
): Cliente[] {
  const q = normalizar(f.busqueda.trim());
  const qDigitos = f.busqueda.replace(/\D/g, '');
  return clientes.filter((c) => {
    const estado = c.estado || 'Activo';
    if (f.estado === 'vigentes' ? estado === 'Inactivo' : f.estado !== 'todos' && estado !== f.estado) return false;
    if (f.vendedor === 'sin' ? !!c.vendedor_id : f.vendedor && c.vendedor_id !== f.vendedor) return false;
    if (!q) return true;
    const texto = normalizar([c.nombre, c.razon_social, c.localidad, c.zona, resumen[c.id]?.textoContactos].filter(Boolean).join(' '));
    if (texto.includes(q)) return true;
    // Por número: CUIT o teléfono, sin importar guiones y espacios
    if (qDigitos.length >= 4 && qDigitos.length === f.busqueda.replace(/[\s\-./()+]/g, '').length) {
      return [c.cuit, ...(resumen[c.id]?.telefonos || [])].some((x) => (x || '').replace(/\D/g, '').includes(qDigitos));
    }
    return false;
  });
}
