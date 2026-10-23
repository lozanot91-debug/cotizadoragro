import { describe, it, expect, vi } from 'vitest';
import { conTimeout, senalConTimeout } from './timeout';

describe('conTimeout', () => {
  it('devuelve el resultado si responde a tiempo', async () => {
    expect(await conTimeout(Promise.resolve(5), 100)).toBe(5);
  });
  it('falla con el mensaje si tarda de más', async () => {
    vi.useFakeTimers();
    const p = conTimeout(new Promise(() => {}), 50, 'tarda');
    const esperado = expect(p).rejects.toThrow('tarda');
    await vi.advanceTimersByTimeAsync(60);
    await esperado;
    vi.useRealTimers();
  });
});

describe('senalConTimeout', () => {
  it('se cancela sola a los ms indicados', async () => {
    vi.useFakeTimers();
    const s = senalConTimeout(30);
    expect(s.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(40);
    expect(s.aborted).toBe(true);
    vi.useRealTimers();
  });
  it('respeta la señal del llamador', () => {
    const ext = new AbortController();
    const s = senalConTimeout(10_000, ext.signal);
    ext.abort();
    expect(s.aborted).toBe(true);
  });
});
