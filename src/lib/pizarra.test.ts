import { describe, expect, it } from 'vitest';
import { numeroPizarra, parsearRango, urlRango } from '../../supabase/functions/pizarra-granos/parser';

// Recorte real de la consulta por rango de bcp.org.ar (Quequén, soja)
const html = `
<table id="tablaRango" class="d-none"> <tr> <th><b>Puerto</b></th> <th><b>Cereal</b></th> <th>MÃ­nimo</th> <th>MÃ¡ximo</th> <th>Promedio</th> <th>Fecha</th> <th>Precio US$/Ton</th> </tr>
<tr> <td>QuequÃ©n</td><td>Soja</td><td>330.00</td><td>367.00</td><td>355.26</td> <td>4/8/2026</td> <td>333</td> </tr>
<tr> <td></td><td></td><td></td><td></td><td></td> <td>19/8/2026</td> <td>349.8</td> </tr>
<tr> <td></td><td></td><td></td><td></td><td></td> <td>5/10/2026</td> <td>355</td> </tr>
<tr> <td></td><td></td><td></td><td></td><td></td> <td>6/10/2026</td> <td>0</td> </tr>
</table> <!-- <td>1/1/2020</td> <td>999</td> -->`;

describe('pizarra BCP', () => {
  it('lee fecha y precio de cada día, sin los de precio 0', () => {
    expect(parsearRango(html)).toEqual([
      { fecha: '2026-08-04', precio: 333 },
      { fecha: '2026-08-19', precio: 349.8 },
      { fecha: '2026-10-05', precio: 355 },
    ]);
  });
  it('sin tabla devuelve vacío', () => {
    expect(parsearRango('<p>Resultados</p>')).toEqual([]);
  });
  it('números', () => {
    expect(numeroPizarra('560.000,50')).toBe(560000.5);
    expect(numeroPizarra('349.8')).toBe(349.8);
    expect(numeroPizarra('')).toBeNaN();
  });
  it('arma la URL de la consulta', () => {
    const u = new URL(urlRango('Quequén', 'Soja', '2026-08-01', '2026-10-07', 0));
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ Tipo: 'Rgo', DiaPrecio1: '1', MesPrecio1: '8', AnoPrecio1: '2026', DiaPrecio2: '7', MesPrecio2: '10', Puerto: '4', Cereal: '5', Unidad: '0' });
  });
});
