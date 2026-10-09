
export interface FilaCosto {
  proveedor: string;
  familia: string;
  producto: string;
  cod: string;
  unid: string;
  costo: number;
}

export interface ResultadoCostos {
  filas: FilaCosto[];
  fecha: string | null;
}

function parsearCosto(valor: unknown): number {
  if (typeof valor === 'number') return valor;
  if (typeof valor === 'string') {
    const limpio = valor.replace(/[^\d.,-]/g, '').trim();
    // Formato: coma como miles, punto como decimal (ej. "1,649.65")
    if (limpio.includes(',') && limpio.includes('.')) {
      return parseFloat(limpio.replace(/,/g, ''));
    }
    // Solo coma: podría ser miles o decimal según contexto
    // Para costos en Argentina, coma = miles si hay 2-3 dígitos al final
    if (limpio.includes(',') && !limpio.includes('.')) {
      const partes = limpio.split(',');
      if (partes.length === 2 && partes[1].length <= 2) {
        // Coma decimal: ej. "980,57"
        return parseFloat(partes[0] + '.' + partes[1]);
      }
      // Coma de miles
      return parseFloat(limpio.replace(/,/g, ''));
    }
    return parseFloat(limpio) || 0;
  }
  return 0;
}

function extraerFechaDeNombre(nombre: string): string | null {
  // Formato: lista_de_costos_2-10-26.xlsx => 2/10/2026
  const match = nombre.match(/(\d{1,2})-(\d{1,2})-(\d{2,4})/);
  if (match) {
    const [, dia, mes] = match;
    let anio = match[3];
    if (anio.length === 2) anio = '20' + anio;
    return `${anio}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
  }
  // También probar formato dd_mm_yyyy
  const match2 = nombre.match(/(\d{1,2})_(\d{1,2})_(\d{2,4})/);
  if (match2) {
    const [, dia, mes] = match2;
    let anio = match2[3];
    if (anio.length === 2) anio = '20' + anio;
    return `${anio}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
  }
  return null;
}

export async function parsearListaCostos(archivo: ArrayBuffer, nombreArchivo: string): Promise<ResultadoCostos> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(archivo, { type: 'array' });
  const hoja = wb.Sheets[wb.SheetNames[0]];
  const json: Record<string, unknown>[] = XLSX.utils.sheet_to_json(hoja, { raw: false });

  const filas: FilaCosto[] = json.map((row) => {
    const keys = Object.keys(row);
    const getVal = (patrones: string[]): string => {
      for (const p of patrones) {
        const key = keys.find((k) => k.toLowerCase().trim() === p.toLowerCase());
        if (key) return String(row[key] || '').trim();
      }
      return '';
    };

    return {
      proveedor: getVal(['Proveedor', 'proveedor']),
      familia: getVal(['Familia', 'familia']),
      producto: getVal(['Producto', 'producto']),
      cod: getVal(['Cod.', 'Cod', 'cod', 'Código', 'codigo']),
      unid: getVal(['Unid.', 'Unid', 'unid', 'Unidad', 'unidad']),
      costo: parsearCosto(
        (() => {
          for (const p of ['Costo', 'costo']) {
            const key = keys.find((k) => k.toLowerCase().trim() === p.toLowerCase());
            if (key) return row[key];
          }
          return 0;
        })()
      ),
    };
  }).filter((f) => f.cod && f.cod.length > 0);

  const fecha = extraerFechaDeNombre(nombreArchivo);
  return { filas, fecha };
}

export interface FilaFlete {
  km: number;
  tarifa: number;
}

export async function parsearTarifaFlete(archivo: ArrayBuffer): Promise<FilaFlete[]> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(archivo, { type: 'array' });
  const hoja = wb.Sheets[wb.SheetNames[0]];

  // La tarifa de flete tiene bloques de columnas: Km., Tarifa, Tierra repetidos
  // Leemos como array de arrays para procesar las columnas
  const rows: unknown[][] = XLSX.utils.sheet_to_json(hoja, { raw: false, header: 1 }) as unknown[][];
  const filas: FilaFlete[] = [];

  for (const row of rows) {
    // Cada bloque ocupa 3 columnas (Km, Tarifa, Tierra) y hay 4 bloques por fila
    for (let bloque = 0; bloque < 4; bloque++) {
      const offset = bloque * 3;
      const kmVal = row[offset];
      const tarifaVal = row[offset + 1];
      if (kmVal === undefined || kmVal === null || kmVal === '') continue;
      const km = typeof kmVal === 'number' ? kmVal : parseInt(String(kmVal).replace(/[^\d]/g, ''), 10);
      if (isNaN(km) || km <= 0) continue;
      const tarifa = parsearCosto(tarifaVal);
      if (tarifa > 0) {
        filas.push({ km, tarifa });
      }
    }
  }

  // Deduplicar por km, quedándonos con el último valor
  const mapa = new Map<number, number>();
  for (const f of filas) {
    mapa.set(f.km, f.tarifa);
  }
  return Array.from(mapa.entries()).map(([km, tarifa]) => ({ km, tarifa }));
}

export async function parsearMargenesExcel(archivo: ArrayBuffer): Promise<{ cod?: string; familia?: string; margen: number }[]> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(archivo, { type: 'array' });
  const hoja = wb.Sheets[wb.SheetNames[0]];
  const json: Record<string, unknown>[] = XLSX.utils.sheet_to_json(hoja, { raw: false });

  return json.map((row) => {
    const keys = Object.keys(row);
    const getVal = (patrones: string[]): string => {
      for (const p of patrones) {
        const key = keys.find((k) => k.toLowerCase().trim().startsWith(p.toLowerCase()));
        if (key) return String(row[key] || '').trim();
      }
      return '';
    };
    const cod = getVal(['Cod', 'cod', 'Código']);
    const familia = getVal(['Familia', 'familia']);
    const margenStr = getVal(['Margen', 'margen']);
    const margen = parsearCosto(margenStr);
    return cod ? { cod, margen } : familia ? { familia, margen } : { margen };
  }).filter((m) => (m.cod || m.familia) && m.margen >= 0);
}
