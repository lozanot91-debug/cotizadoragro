import { describe, it, expect } from 'vitest';
import { ok, ErrorApp, traducirError } from './errores';

describe('errores', () => {
  it('ok devuelve los datos si no hay error', async () => {
    expect(await ok(Promise.resolve({ data: [1, 2], error: null }))).toEqual([1, 2]);
  });
  it('ok lanza ErrorApp traducido si hay error', async () => {
    await expect(ok(Promise.resolve({ data: null, error: { code: '23505', message: 'dup' } }))).rejects.toBeInstanceOf(ErrorApp);
  });
  it('traduce mensajes propios de RAISE EXCEPTION', () => {
    expect(traducirError({ code: 'P0001', message: 'Ya existe una lista con fecha 2026-10-02' })).toBe('Ya existe una lista con fecha 2026-10-02');
  });
  it('traduce falta de red', () => {
    expect(traducirError(new TypeError('Failed to fetch'))).toMatch(/conexión/);
  });
});
