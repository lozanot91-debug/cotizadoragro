import { describe, expect, it } from 'vitest';
import { pesoLegible, presentacion, rutaMarbete, separarEnvase, sugerirGrupos, validarComentario, validarMarbete } from './catalogo';

describe('separarEnvase (nombres reales de la lista)', () => {
  it.each([
    ['A 35 T (X 5 LTRS)', 'A 35 T', 'x 5 L'],
    ['A 35 T (X1L)', 'A 35 T', 'x 1 L'],
    ['ALL TEC - COADYUVANTE ALL OK (4 X 5 LT)', 'ALL TEC - COADYUVANTE ALL OK', '4 x 5 L'],
    ['ALL TEC - COADYUVANTE ALL OK (X 20 LT)', 'ALL TEC - COADYUVANTE ALL OK', 'x 20 L'],
    ['CONCENTRADO PROTEICO TORO (BL)', 'CONCENTRADO PROTEICO TORO', 'Bolsa'],
    ['CONCENTRADO PROTEICO TORO (GL)', 'CONCENTRADO PROTEICO TORO', 'Granel'],
    ['LIMITADOR ENERGETICO 10% PB BL', 'LIMITADOR ENERGETICO 10% PB', 'Bolsa'],
    ['LIMITADOR ENERGETICO 10% PB GL', 'LIMITADOR ENERGETICO 10% PB', 'Granel'],
    ['PREPARTO CSA BOLSA', 'PREPARTO CSA', 'Bolsa'],
    ['SURCOSTART (BL X 25 KG)', 'SURCOSTART', 'Bolsa x 25 kg'],
    ['CIPERMETRINA X 20', 'CIPERMETRINA', 'x 20'],
    ['DECIS FORTE X 5', 'DECIS FORTE', 'x 5'],
    ['ACTELLIC PLUS X  1', 'ACTELLIC PLUS', 'x 1'],
    ['ACTELLIC 50 (X1)', 'ACTELLIC 50', 'x 1'],
    ['FURIA X 5 (ZETAMETRINA 18%)', 'FURIA (ZETAMETRINA 18%)', 'x 5'],
    ['CORAGEN X 1 (CLORANTRANILIPROLE 20%)', 'CORAGEN (CLORANTRANILIPROLE 20%)', 'x 1'],
    ['ABAMECTINA 3.6 (X 5L)', 'ABAMECTINA 3.6', 'x 5 L'],
    ['RIBOL 5 (200 GRS)', 'RIBOL 5', 'x 200 g'],
    ['CONVEY (X LITRO)', 'CONVEY', 'por litro'],
    ['UREA GRANULADA (46-0-0) (GL)', 'UREA GRANULADA (46-0-0)', 'Granel'],
    ['TERNERO INICIADOR (BOLSA)', 'TERNERO INICIADOR', 'Bolsa'],
    ['X-TRIM POWER (X1 LT)', 'X-TRIM POWER', 'x 1 L'],
    ['TANDIL-PREMEZCLA TERMINACION 3% C/UREA GL', 'TANDIL-PREMEZCLA TERMINACION 3% C/UREA', 'Granel'],
    ['RIZO LIQ II (X 5L)', 'RIZO LIQ II', 'x 5 L'],
  ])('%s', (nombre, base, envase) => {
    expect(separarEnvase(nombre)).toEqual({ base, envase });
  });

  it.each([
    'SILO BOLSA IPESA 9 X 60 X 250',
    'SILO BOLSA AGRINPLEX 6 X 60 X 250',
    'STARFEED WEANING FASE 3 (15%)',
    'FOSFATO DIAMONICO (18-46-0)',
    'ATRAZINA 90%',
    '2,4 D 60 SIGMA',
    'SISTIVA PACK (3 LTS SISTIVA + 1 LT PREMIS)',
    'BIG BAG',
    'SYNGENTA - APRON MAXX 12 X 1 LT',
    'INTERFIELD (KIT X 5 HA)',
    'RILEGUM PACK 203 (P/2000 KGS)',
    'STARFEED WEANIN FASE 3 (30%)',
  ])('no toca: %s', (nombre) => {
    expect(separarEnvase(nombre)).toEqual({ base: nombre, envase: null });
  });
});

describe('presentacion', () => {
  it('usa el envase del nombre o la unidad de la lista', () => {
    expect(presentacion({ producto: 'A 35 T (X 5 LTRS)', unid: 'LTS' })).toBe('x 5 L');
    expect(presentacion({ producto: 'ATRAZINA 90%', unid: 'KGS' })).toBe('Por kg');
    expect(presentacion({ producto: 'GLIFOSATO', unid: 'LTS' })).toBe('Por litro');
    expect(presentacion({ producto: 'UREA GRANULADA (46-0-0)', unid: 'KGRS', es_fertilizante: true })).toBe('Por tonelada');
  });
});

describe('sugerirGrupos', () => {
  const ps = [
    { cod: '1', producto: 'A 35 T (X 5 LTRS)', familia: 'COADYUVANTES' },
    { cod: '2', producto: 'A 35 T (X1L)', familia: 'COADYUVANTES' },
    { cod: '3', producto: 'A 35 T GOLD (X 1L)', familia: 'COADYUVANTES' },
    { cod: '4', producto: 'DESTETE PRECOZ (BL)', familia: 'AB PRODUCTO' },
    { cod: '5', producto: 'DESTETE PRECOZ (GL)', familia: 'AB PRODUCTO' },
    { cod: '6', producto: 'ATRAZINA 90%', familia: 'HERBICIDAS' },
    { cod: '7', producto: 'SILO BOLSA IPESA 9 X 60 X 250', familia: 'SILO BOLSA' },
    { cod: '8', producto: 'SILO BOLSA IPESA 9 X 75 X 250', familia: 'SILO BOLSA' },
  ];
  it('junta envases del mismo producto y deja separados los distintos', () => {
    const g = sugerirGrupos(ps, new Set());
    const porNombre = Object.fromEntries(g.map((x) => [x.nombre, x.codigos.map((c) => c.cod).sort()]));
    expect(porNombre['A 35 T']).toEqual(['1', '2']);
    expect(porNombre['A 35 T GOLD']).toEqual(['3']);
    expect(porNombre['DESTETE PRECOZ']).toEqual(['4', '5']);
    expect(porNombre['ATRAZINA 90%']).toEqual(['6']);
    expect(porNombre['SILO BOLSA IPESA 9 X 60 X 250']).toEqual(['7']);
    expect(g).toHaveLength(6);
  });
  it('saltea los códigos que ya tienen ficha', () => {
    const g = sugerirGrupos(ps, new Set(['1', '2', '3', '4', '5', '6', '7']));
    expect(g.map((x) => x.codigos.map((c) => c.cod))).toEqual([['8']]);
  });
});

describe('validaciones', () => {
  it('marbete: solo PDF y hasta 5 MB', () => {
    expect(validarMarbete({ name: 'marbete.pdf', type: 'application/pdf', size: 350_000 })).toBeNull();
    expect(validarMarbete({ name: 'foto.jpg', type: 'image/jpeg', size: 100 })).toContain('PDF');
    expect(validarMarbete({ name: 'grande.pdf', type: 'application/pdf', size: 6 * 1024 * 1024 })).toContain('5 MB');
  });
  it('ruta del archivo segura', () => {
    expect(rutaMarbete('f1', 'Marbete Glifosato 66,2% Ñ.pdf', 123)).toBe('f1/123-Marbete-Glifosato-66-2-N.pdf');
    expect(rutaMarbete('f1', '###.pdf', 1)).toBe('f1/1-marbete.pdf');
  });
  it('peso legible', () => {
    expect(pesoLegible(350_000)).toBe('342 KB');
    expect(pesoLegible(2_500_000)).toBe('2,4 MB');
  });
  it('comentario', () => {
    expect(validarComentario('  ', '')).toBe('Escribí el comentario.');
    expect(validarComentario('Aplicar con 80 L/ha', 'Manejo')).toBeNull();
    expect(validarComentario('x', 'Otra')).toBe('Etiqueta inválida.');
  });
});
