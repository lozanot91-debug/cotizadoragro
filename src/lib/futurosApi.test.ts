import { describe, expect, it } from 'vitest';
import { leerSimbolo, parsearFuturos, urlFuturos } from '../../supabase/functions/pizarra-granos/futuros';

describe('futuros Matba-Rofex', () => {
  it('lee los símbolos en USD de Rosario', () => {
    expect(leerSimbolo('SOJ.ROS/MAY27')).toEqual({ cultivo: 'Soja', posicion: '2027-05' });
    expect(leerSimbolo('MAI.ROS/ABR27')).toEqual({ cultivo: 'Maíz', posicion: '2027-04' });
    expect(leerSimbolo('TRI.ROS/DIS26')).toEqual({ cultivo: 'Trigo', posicion: 'DIS' });
    expect(leerSimbolo('SOJ.ROS.P/DIS26')).toBeNull(); // pesos
    expect(leerSimbolo('SOJ.MIN/MAY27')).toBeNull(); // mini
    expect(leerSimbolo('CRN.CME/DIC26')).toBeNull(); // Chicago
  });
  it('parsea la respuesta (forma real de la API)', () => {
    const json = { data: [
      { dateTime: '2026-10-07T00:00:00.000Z', symbol: 'SOJ.ROS/MAY27', settlement: 359.2 },
      { dateTime: '2026-10-07T00:00:00.000Z', symbol: 'SOJ.ROS/DIS26', settlement: 369.5 },
      { dateTime: '2026-10-07T00:00:00.000Z', symbol: 'SOJ.ROS.P/DIS26', settlement: 562000 },
      { dateTime: '2026-10-07T00:00:00.000Z', symbol: 'CRN.CME/NOV26', settlement: 198 },
      { dateTime: '2026-10-07T00:00:00.000Z', symbol: 'MAI.ROS/JUL27', settlement: 0 },
    ], to: '2026-10-07T00:00:00', page: 1, pageSize: 50, totalEntries: 5 };
    expect(parsearFuturos(json)).toEqual([
      { fecha: '2026-10-07', simbolo: 'SOJ.ROS/MAY27', cultivo: 'Soja', posicion: '2027-05', ajuste: 359.2 },
      { fecha: '2026-10-07', simbolo: 'SOJ.ROS/DIS26', cultivo: 'Soja', posicion: 'DIS', ajuste: 369.5 },
    ]);
    expect(parsearFuturos(null)).toEqual([]);
  });
  it('URL', () => {
    const u = new URL(urlFuturos('2026-10-01', '2026-10-07', 2));
    expect(u.host).toBe('apicem.matbarofex.com.ar');
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ segment: 'Agropecuario', type: 'FUT', from: '2026-10-01', to: '2026-10-07', page: '2' });
  });
});
