import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import { formatUSD, formatNumber } from '@/lib/format';
import { unidadCosto } from '@/lib/pedidosPrecio';

/** Lo que ve y descarga la mesa de insumos: sin márgenes ni precios de venta. */
export interface ComprobanteMesa {
  numero: number;
  cliente: string;
  respondidoPor: string;
  respondidoAt: string;
  nota: string | null;
  lineas: { cod: string; producto: string; unidad: string | null; es_fertilizante: boolean; cantidad: number; costo_usd: number | null; proveedor: string | null }[];
}

function fechaHora(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
}

function nombreArchivo(c: ComprobanteMesa, ext: string): string {
  const cli = c.cliente.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 30) || 'cliente';
  return `Costos_cotizacion_${c.numero}_${cli}.${ext}`;
}

export function comprobanteExcel(c: ComprobanteMesa) {
  const filas: (string | number)[][] = [
    ['Costos cargados por la mesa de insumos'],
    ['Cotización N°', c.numero],
    ['Cliente', c.cliente],
    ['Cargado por', c.respondidoPor],
    ['Fecha', fechaHora(c.respondidoAt)],
    ...(c.nota ? [['Nota', c.nota]] : []),
    [],
    ['Código', 'Producto', 'Cantidad', 'Unidad del costo', 'Costo (USD)', 'Proveedor'],
    ...c.lineas.map((l) => [l.cod, l.producto, l.cantidad, unidadCosto({ es_fertilizante: l.es_fertilizante, unidad: l.unidad }), l.costo_usd ?? '', l.proveedor || '']),
  ];
  const ws = XLSX.utils.aoa_to_sheet(filas);
  ws['!cols'] = [{ wch: 16 }, { wch: 40 }, { wch: 10 }, { wch: 20 }, { wch: 12 }, { wch: 24 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Costos');
  XLSX.writeFile(wb, nombreArchivo(c, 'xlsx'));
}

export function comprobantePDF(c: ComprobanteMesa) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const ancho = doc.internal.pageSize.getWidth();
  let y = 18;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Costos cargados - Mesa de insumos', 14, y);
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const cab = [`Cotización N° ${c.numero}`, `Cliente: ${c.cliente}`, `Cargado por: ${c.respondidoPor}`, `Fecha: ${fechaHora(c.respondidoAt)}`];
  for (const t of cab) { doc.text(t, 14, y); y += 5.5; }
  if (c.nota) { doc.text(doc.splitTextToSize(`Nota: ${c.nota}`, ancho - 28), 14, y); y += 5.5 * Math.max(1, doc.splitTextToSize(`Nota: ${c.nota}`, ancho - 28).length); }
  y += 3;

  const cols = { prod: 14, cant: 100, unid: 122, costo: 160, prov: 164 };
  function encabezado() {
    doc.setFillColor(40, 60, 45);
    doc.rect(14, y - 4.5, ancho - 28, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Producto', cols.prod + 1, y);
    doc.text('Cant.', cols.cant, y, { align: 'right' });
    doc.text('Unidad costo', cols.unid - 14, y);
    doc.text('Costo USD', cols.costo, y, { align: 'right' });
    doc.text('Proveedor', cols.prov, y);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    y += 7;
  }
  encabezado();
  doc.setFontSize(9);
  for (const l of c.lineas) {
    if (y > 275) { doc.addPage(); y = 20; encabezado(); doc.setFontSize(9); }
    const nombre = doc.splitTextToSize(`${l.producto} (${l.cod})`, 66);
    doc.text(nombre, cols.prod + 1, y);
    doc.text(formatNumber(l.cantidad, l.cantidad % 1 === 0 ? 0 : 2), cols.cant, y, { align: 'right' });
    doc.text(l.es_fertilizante ? 'por tn' : `por ${l.unidad || 'unidad'}`, cols.unid - 14, y);
    doc.text(l.costo_usd !== null ? formatUSD(l.costo_usd) : '-', cols.costo, y, { align: 'right' });
    doc.text(doc.splitTextToSize(l.proveedor || '-', 30), cols.prov, y);
    y += Math.max(6, nombre.length * 4.2 + 2);
    doc.setDrawColor(220, 220, 220);
    doc.line(14, y - 3.5, ancho - 14, y - 3.5);
  }
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text('Comprobante de los costos que cargaste. Para corregir algo, pedí la corrección desde el mismo link.', 14, 287);
  doc.save(nombreArchivo(c, 'pdf'));
}
