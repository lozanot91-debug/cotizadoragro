import { describe, it, expect } from 'vitest';
import { nombreCotizacion, archivoCotizacion, correlativo, interpretarBusqueda } from './nombreCotizacion';

describe('nombreCotizacion', () => {
  it('arma "Cliente - 001"', () => {
    expect(nombreCotizacion({ cliente_nombre: 'Juan Perez', numero_cliente: 1, numero: 57 })).toBe('Juan Perez - 001');
    expect(nombreCotizacion({ cliente_nombre: 'Juan Perez', numero_cliente: 42 })).toBe('Juan Perez - 042');
    expect(nombreCotizacion({ cliente_nombre: 'Juan Perez', numero_cliente: 1234 })).toBe('Juan Perez - 1234');
  });
  it('limpia espacios y usa "Sin cliente"', () => {
    expect(nombreCotizacion({ cliente_nombre: '  Juan   Perez ', numero_cliente: 3 })).toBe('Juan Perez - 003');
    expect(nombreCotizacion({ cliente_nombre: null, numero_cliente: 3 })).toBe('Sin cliente - 003');
  });
  it('usa el cliente alternativo si la referencia no trae nombre', () => {
    expect(nombreCotizacion({ numero_cliente: 2 }, 'FARM EQUITY')).toBe('FARM EQUITY - 002');
  });
  it('sin correlativo cae al número global', () => {
    expect(nombreCotizacion({ cliente_nombre: 'Juan', numero: 57 })).toBe('Juan - N° 57');
    expect(nombreCotizacion({ numero: 57 })).toBe('N° 57');
    expect(nombreCotizacion({})).toBe('Nueva cotización');
    expect(nombreCotizacion(null)).toBe('Cotización');
  });
  it('correlativo con ceros', () => {
    expect(correlativo(7)).toBe('007');
  });
  it('nombre de archivo sin acentos ni símbolos', () => {
    expect(archivoCotizacion({ cliente_nombre: 'José Pérez & Hnos. S.A.', numero_cliente: 5 })).toBe('Jose_Perez_Hnos_S_A_005');
    expect(archivoCotizacion({ numero: 9 })).toBe('9');
  });
});

describe('interpretarBusqueda', () => {
  it('entiende nombre + correlativo, solo nombre o solo número', () => {
    expect(interpretarBusqueda(' Juan  Perez - 001 ')).toEqual({ cliente: 'Juan Perez', numero: 1 });
    expect(interpretarBusqueda('Juan Perez-12')).toEqual({ cliente: 'Juan Perez', numero: 12 });
    expect(interpretarBusqueda('Juan Perez')).toEqual({ cliente: 'Juan Perez', numero: null });
    expect(interpretarBusqueda('003')).toEqual({ cliente: '', numero: 3 });
    expect(interpretarBusqueda('Agro San-Juan')).toEqual({ cliente: 'Agro San-Juan', numero: null });
    expect(interpretarBusqueda('  ')).toBeNull();
  });
});
