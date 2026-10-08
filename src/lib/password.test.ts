import { describe, expect, it } from 'vitest';
import { validarPasswordNueva } from './password';

describe('validarPasswordNueva', () => {
  it('rechaza contraseñas cortas', () => {
    expect(validarPasswordNueva('abc123', 'abc123')).toMatch(/al menos 8/);
  });
  it('rechaza si no coinciden', () => {
    expect(validarPasswordNueva('tolvas2026', 'tolvas2025')).toMatch(/no coinciden/);
  });
  it('acepta una contraseña válida', () => {
    expect(validarPasswordNueva('tolvas2026', 'tolvas2026')).toBeNull();
  });
});
