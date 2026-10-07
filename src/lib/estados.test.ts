import { describe, it, expect } from 'vitest';
import { validarCambioEstado, motivoFinal, esReapertura } from './estados';

describe('validarCambioEstado', () => {
  it('Perdida sin motivo no se puede', () => {
    expect(validarCambioEstado({ desde: 'Enviada', hacia: 'Perdida' })).toMatch(/motivo/);
    expect(validarCambioEstado({ desde: 'Enviada', hacia: 'Perdida', motivo: '   ' })).toMatch(/motivo/);
  });
  it('Perdida con motivo sí', () => {
    expect(validarCambioEstado({ desde: 'Enviada', hacia: 'Perdida', motivo: 'Precio' })).toBeNull();
  });
  it('desde Ganada solo se reabre a En negociación', () => {
    expect(validarCambioEstado({ desde: 'Ganada', hacia: 'Borrador', comentario: 'x' })).toMatch(/reabrir/);
    expect(validarCambioEstado({ desde: 'Perdida', hacia: 'Enviada', comentario: 'x' })).toMatch(/reabrir/);
  });
  it('reabrir exige comentario', () => {
    expect(validarCambioEstado({ desde: 'Perdida', hacia: 'En negociación' })).toMatch(/comentario/);
    expect(validarCambioEstado({ desde: 'Perdida', hacia: 'En negociación', comentario: 'El cliente volvió' })).toBeNull();
  });
  it('estados abiertos pasan libremente', () => {
    expect(validarCambioEstado({ desde: 'Borrador', hacia: 'Enviada' })).toBeNull();
    expect(validarCambioEstado({ desde: 'Enviada', hacia: 'Ganada' })).toBeNull();
    expect(validarCambioEstado({ desde: 'En negociación', hacia: 'Borrador' })).toBeNull();
  });
  it('mismo estado se rechaza', () => {
    expect(validarCambioEstado({ desde: 'Enviada', hacia: 'Enviada' })).not.toBeNull();
  });
});

describe('motivoFinal / esReapertura', () => {
  it('Otro usa el texto escrito', () => {
    expect(motivoFinal('Otro', '  Sin stock ')).toBe('Sin stock');
    expect(motivoFinal('Precio', 'ignorado')).toBe('Precio');
  });
  it('reapertura', () => {
    expect(esReapertura('Ganada', 'En negociación')).toBe(true);
    expect(esReapertura('Enviada', 'En negociación')).toBe(false);
  });
});
