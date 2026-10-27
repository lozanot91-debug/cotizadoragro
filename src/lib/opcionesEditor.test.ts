import { describe, it, expect } from 'vitest';
import type { OpcionPago } from '@/types';
import { diasDesdeVencimiento, vencimientoDesdeDias } from './fechas';
import {
  nombreOpcionPorDefecto, nuevoIdOpcion, opcionesAEditor, editorAOpciones, opcionesParaGuardar, firmaExtras,
} from './opcionesEditor';
import { aplicarOpcion, ID_PRINCIPAL } from './opcionesPago';
import type { Cotizacion, CotizacionLinea } from '@/types';

const principal: OpcionPago = { id: ID_PRINCIPAL, nombre: 'Contado', tasa_mensual: 0, plazos: [0, 0, 0] };
const guardada: OpcionPago[] = [principal, { id: 'op-a', nombre: 'A 60', tasa_mensual: 1.5, plazos: [60, 0, 90] }];

describe('nombres e ids', () => {
  it('nombres por defecto', () => {
    expect(nombreOpcionPorDefecto([])).toBe('Opción 2');
    expect(nombreOpcionPorDefecto(['Opción 2'])).toBe('Opción 3');
    expect(nombreOpcionPorDefecto(['Opción 3'])).toBe('Opción 2');
  });
  it('id nuevo no repite', () => {
    expect(nuevoIdOpcion(['op-x'])).toMatch(/^op-/);
    expect(nuevoIdOpcion(['op-x'])).not.toBe('op-x');
  });
});

describe('posiciones <-> claves', () => {
  it('roundtrip', () => {
    const keys = ['k1', 'k2', 'k3'];
    const ed = opcionesAEditor(guardada, keys);
    expect(ed).toHaveLength(1);
    expect(ed[0].plazoPorKey).toEqual({ k1: 60, k2: 0, k3: 90 });
    expect(ed[0].tasa).toBe('1,5');
    expect(editorAOpciones(ed, keys)).toEqual([guardada[1]]);
  });
  it('si se reordena una línea, los plazos siguen al artículo', () => {
    const ed = opcionesAEditor(guardada, ['k1', 'k2', 'k3']);
    expect(editorAOpciones(ed, ['k3', 'k1', 'k2'])[0].plazos).toEqual([90, 60, 0]);
  });
  it('si se quita una línea, se saca su plazo; una nueva queda contado', () => {
    const ed = opcionesAEditor(guardada, ['k1', 'k2', 'k3']);
    expect(editorAOpciones(ed, ['k1', 'k3'])[0].plazos).toEqual([60, 90]);
    expect(editorAOpciones(ed, ['k1', 'k2', 'k3', 'nueva'])[0].plazos).toEqual([60, 0, 90, 0]);
  });
  it('carga ignora la principal y rellena plazos faltantes', () => {
    expect(opcionesAEditor([principal], ['k1'])).toEqual([]);
    expect(opcionesAEditor(undefined, ['k1'])).toEqual([]);
    expect(opcionesAEditor([{ ...guardada[1], plazos: [30] }], ['a', 'b'])[0].plazoPorKey).toEqual({ a: 30, b: 0 });
  });
});

describe('opcionesParaGuardar', () => {
  const keys = ['k1', 'k2', 'k3'];
  it('sin extras guarda []', () => {
    expect(opcionesParaGuardar(principal, [], keys)).toEqual({ opciones: [], errores: [] });
  });
  it('con extras: principal primero y válidas', () => {
    const r = opcionesParaGuardar(principal, opcionesAEditor(guardada, keys), keys);
    expect(r.errores).toEqual([]);
    expect(r.opciones.map((o) => o.id)).toEqual([ID_PRINCIPAL, 'op-a']);
  });
  it('detecta opción igual a la principal y nombre vacío', () => {
    const ed = opcionesAEditor(guardada, keys);
    ed[0].plazoPorKey = { k1: 0, k2: 0, k3: 0 };
    ed[0].tasa = '';
    expect(opcionesParaGuardar(principal, ed, keys).errores.join(' ')).toMatch(/igual a la principal/);
    ed[0].nombre = '  ';
    expect(opcionesParaGuardar(principal, ed, keys).errores.join(' ')).toMatch(/no tiene nombre/);
  });
});

describe('firmaExtras', () => {
  it('ignora la principal y cambia con los plazos', () => {
    expect(firmaExtras(guardada, 3)).toBe(firmaExtras([{ ...principal, nombre: 'Otro' }, guardada[1]], 3));
    expect(firmaExtras(guardada, 3)).not.toBe(firmaExtras([principal, { ...guardada[1], plazos: [60, 0, 0] }], 3));
  });
});

describe('plazo desde una fecha', () => {
  it('días <-> vencimiento', () => {
    expect(diasDesdeVencimiento('2026-10-07', '2026-12-06')).toBe(60);
    expect(vencimientoDesdeDias('2026-10-07', 60)).toBe('2026-12-06');
    expect(diasDesdeVencimiento('2026-10-07', '')).toBe(0);
  });
});

describe('aplicarOpcion con elegida null (volver a las opciones)', () => {
  const lin = (plazo: number): CotizacionLinea => ({
    id: 'x', cotizacion_id: '', producto_id: null, cod: 'C', producto: 'P', familia: 'F', proveedor: 'P', unid: 'LT',
    es_fertilizante: false, cantidad: 1, costo_usd: 0, costo_lista_usd: null, costo_editado: false, margen: 10,
    precio_usd: 100, flete_usd: 0, total_usd: 100, con_flete: false, iva: 21, plazo_dias: plazo, orden: 0,
  });
  const cotiz = { tc: 1000, con_iva: false, plazo_dias: 60, tasa_mensual: 1.5 } as Cotizacion;
  it('restaura la principal y limpia la elegida', () => {
    const { cotizPatch, lineasPatch } = aplicarOpcion(cotiz, [lin(60)], { ...principal, plazos: [0] }, null);
    expect(cotizPatch.opcion_elegida).toBeNull();
    expect(cotizPatch.plazo_dias).toBe(0);
    expect(cotizPatch.recargo_usd).toBe(0);
    expect(lineasPatch).toEqual([{ index: 0, plazo_dias: 0, tasa_mensual: null }]);
  });
  it('por defecto deja el id de la opción', () => {
    expect(aplicarOpcion(cotiz, [lin(0)], guardada[1]).cotizPatch.opcion_elegida).toBe('op-a');
  });
});
