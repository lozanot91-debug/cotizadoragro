import { describe, expect, it } from 'vitest';
import { base64UrlABytes, nombreDispositivo, VAPID_PUBLICA } from './pushUtil';

describe('base64UrlABytes', () => {
  it('la clave VAPID pública es un punto P-256 sin comprimir (65 bytes, empieza con 0x04)', () => {
    const b = base64UrlABytes(VAPID_PUBLICA);
    expect(b.length).toBe(65);
    expect(b[0]).toBe(4);
  });
});

describe('nombreDispositivo', () => {
  it('reconoce Android con Chrome y iPhone con Safari', () => {
    expect(nombreDispositivo('Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36')).toBe('Android · Chrome');
    expect(nombreDispositivo('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1')).toBe('iPhone/iPad · Safari');
  });
});
