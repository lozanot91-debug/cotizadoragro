/** Excel y PDF del pedido de facturación: lo que necesita quien factura. */
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import { formatUSD, formatNumber, formatDate } from '@/lib/format';
import { describirCondicion, precioFinal, totalLinea, type CondicionPago, type LineaFacturacion, type TotalesFacturacion } from '@/lib/facturacion';
import type { ClienteFacturacion, ExtraFacturacion, PedidoFacturacion } from '@/types';

export interface DocFacturacion {
  numero: number;
  estado: string;
  nota_venta: string | null;
  observaciones: string | null;
  cliente: ClienteFacturacion;
  condiciones: CondicionPago[];
  lineas: LineaFacturacion[];
  totales: TotalesFacturacion;
  extra: ExtraFacturacion;
  enviado_por: string | null;
  enviado_at: string;
  factura_numero?: string | null;
  factura_fecha?: string | null;
}

export function docDePedido(p: PedidoFacturacion, numero: number): DocFacturacion {
  return {
    numero, estado: p.estado, nota_venta: p.nota_venta, observaciones: p.observaciones, cliente: p.cliente,
    condiciones: p.condiciones, lineas: p.lineas, totales: p.totales, extra: p.extra,
    enviado_por: p.creado_por, enviado_at: p.enviado_at, factura_numero: p.factura_numero, factura_fecha: p.factura_fecha,
  };
}

const fmt = (n: number, d = 2) => formatUSD(n, d);
/** Redondeo para el Excel (evita 22468.800000000003). */
const r2 = (n: number) => Math.round((n || 0) * 100) / 100;
const cant = (n: number) => formatNumber(n, n % 1 === 0 ? 0 : 2);
const unidad = (l: LineaFacturacion) => (l.es_fertilizante ? 'tn' : l.unidad || 'un');

function fechaHora(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
}

function nombreArchivo(d: DocFacturacion, ext: string): string {
  const cli = d.cliente.nombre.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 30) || 'cliente';
  return `Facturar_cotizacion_${d.numero}_${cli}.${ext}`;
}

function cabecera(d: DocFacturacion): [string, string][] {
  const c = d.cliente;
  return [
    ['Cotización N°', String(d.numero)],
    ['Nota de venta', d.nota_venta || '-'],
    ['Cliente', c.nombre],
    ['Razón social', c.razon_social || '-'],
    ['CUIT', c.cuit || '-'],
    ['Domicilio', [c.domicilio, c.localidad].filter(Boolean).join(', ') || '-'],
    ['Enviado por', `${d.enviado_por || '-'} · ${fechaHora(d.enviado_at)}`],
    ...(d.extra.tc ? [['TC (vendedor)', `$ ${fmt(d.extra.tc)}`] as [string, string]] : []),
    ...(d.extra.flete ? [['Flete', `${d.extra.flete}${d.extra.tc_flete ? ` · TC comprador $ ${fmt(d.extra.tc_flete)}` : ''}`] as [string, string]] : []),
    ...(d.factura_numero ? [['Factura', `${d.factura_numero}${d.factura_fecha ? ` del ${formatDate(d.factura_fecha)}` : ''}`] as [string, string]] : []),
  ];
}

export function facturacionExcel(d: DocFacturacion) {
  const filas: (string | number)[][] = [['Pedido de facturación'], ...cabecera(d)];
  if (d.observaciones) filas.push(['Observaciones', d.observaciones]);
  filas.push([]);
  for (const t of d.totales.porCondicion) {
    if (!t.lineas) continue;
    filas.push([describirCondicion(t.condicion, fmt)]);
    filas.push(['Código', 'Producto', 'Cantidad', 'Unidad', 'Costo USD', 'Precio USD (sin flete)', 'Flete USD', 'Precio final USD', 'Margen %', 'IVA %', 'Subtotal USD']);
    for (const l of d.lineas.filter((x) => x.condicion_id === t.condicion.id)) {
      filas.push([l.cod, l.producto, l.cantidad, unidad(l), r2(l.costo_usd), r2(l.precio_usd), r2(l.flete_usd), r2(precioFinal(l)), r2(l.margen), l.iva, r2(totalLinea(l))]);
    }
    filas.push(['', '', '', '', '', '', '', '', '', 'Subtotal', r2(t.subtotal)]);
    if (t.recargo) filas.push(['', '', '', '', '', '', '', '', '', `Financiación ${fmt(t.recargoPct)} %`, r2(t.recargo)]);
    filas.push(['', '', '', '', '', '', '', '', '', 'IVA', r2(t.iva)]);
    filas.push(['', '', '', '', '', '', '', '', '', 'Total', r2(t.total)]);
    if (t.toneladas) filas.push(['', '', '', '', '', '', '', '', '', 'Toneladas', r2(t.toneladas)]);
    if (t.ndMonto) filas.push(['', '', '', '', '', '', '', '', '', `Nota de débito ${fmt(t.condicion.nd_pct || 0)} %`, r2(t.ndMonto)]);
    filas.push([]);
  }
  filas.push(['', '', '', '', '', '', '', '', '', 'TOTAL', r2(d.totales.total)]);
  const ws = XLSX.utils.aoa_to_sheet(filas);
  ws['!cols'] = [{ wch: 16 }, { wch: 38 }, { wch: 10 }, { wch: 8 }, { wch: 11 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 9 }, { wch: 22 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Facturar');
  XLSX.writeFile(wb, nombreArchivo(d, 'xlsx'));
}

export function facturacionPDF(d: DocFacturacion) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  const m = 12;
  let y = 16;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(`Pedido de facturación · Cotización N° ${d.numero}`, m, y);
  y += 7;
  doc.setFontSize(9);
  const cab = cabecera(d).slice(1);
  const mitad = Math.ceil(cab.length / 2);
  cab.forEach(([k, v], i) => {
    const x = i < mitad ? m : ancho / 2;
    const yy = y + (i % mitad) * 5;
    doc.setFont('helvetica', 'bold'); doc.text(`${k}:`, x, yy);
    doc.setFont('helvetica', 'normal'); doc.text(doc.splitTextToSize(v, ancho / 2 - 40)[0], x + 28, yy);
  });
  y += mitad * 5 + 2;
  if (d.observaciones) {
    const t = doc.splitTextToSize(`Observaciones: ${d.observaciones}`, ancho - 2 * m);
    doc.text(t, m, y); y += t.length * 4.5 + 2;
  }

  // Columnas: x es el borde derecho para las numéricas
  const C = { prod: m, cant: 128, uni: 131, costo: 160, precio: 184, flete: 204, final: 228, margen: 245, iva: 260, sub: ancho - m - 1.5 };
  function encabezado() {
    doc.setFillColor(40, 60, 45);
    doc.rect(m, y - 4.2, ancho - 2 * m, 6.5, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
    doc.text('Producto', C.prod + 1, y);
    doc.text('Cant.', C.cant, y, { align: 'right' }); doc.text('Un.', C.uni, y);
    doc.text('Costo', C.costo, y, { align: 'right' }); doc.text('Precio', C.precio, y, { align: 'right' });
    doc.text('Flete', C.flete, y, { align: 'right' }); doc.text('P. final', C.final, y, { align: 'right' });
    doc.text('Marg.%', C.margen, y, { align: 'right' }); doc.text('IVA%', C.iva, y, { align: 'right' });
    doc.text('Subtotal', C.sub, y, { align: 'right' });
    doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'normal');
    y += 6.5;
  }
  const salto = (h: number) => { if (y + h > alto - 14) { doc.addPage(); y = 16; encabezado(); } };

  for (const t of d.totales.porCondicion) {
    if (!t.lineas) continue;
    salto(24);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text(describirCondicion(t.condicion, fmt), m, y);
    y += 5;
    encabezado();
    doc.setFontSize(8);
    for (const l of d.lineas.filter((x) => x.condicion_id === t.condicion.id)) {
      const nombre = doc.splitTextToSize(`${l.producto} (${l.cod})`, C.cant - C.prod - 18);
      salto(nombre.length * 3.8 + 3);
      doc.text(nombre, C.prod + 1, y);
      doc.text(cant(l.cantidad), C.cant, y, { align: 'right' }); doc.text(unidad(l), C.uni, y);
      doc.text(fmt(l.costo_usd), C.costo, y, { align: 'right' }); doc.text(fmt(l.precio_usd), C.precio, y, { align: 'right' });
      doc.text(l.flete_usd ? fmt(l.flete_usd) : '-', C.flete, y, { align: 'right' }); doc.text(fmt(precioFinal(l)), C.final, y, { align: 'right' });
      doc.text(fmt(l.margen, 1), C.margen, y, { align: 'right' }); doc.text(fmt(l.iva, 1), C.iva, y, { align: 'right' });
      doc.text(fmt(totalLinea(l)), C.sub, y, { align: 'right' });
      y += Math.max(5, nombre.length * 3.8 + 1.5);
      doc.setDrawColor(225, 225, 225); doc.line(m, y - 3.2, ancho - m, y - 3.2);
    }
    const tot: [string, number][] = [['Subtotal', t.subtotal]];
    if (t.recargo) tot.push([`Financiación ${fmt(t.recargoPct)} %`, t.recargo]);
    tot.push(['IVA', t.iva], ['Total USD', t.total]);
    salto(tot.length * 4.5 + 8);
    for (const [k, v] of tot) {
      doc.setFont('helvetica', k === 'Total USD' ? 'bold' : 'normal');
      doc.text(k, C.final, y, { align: 'right' }); doc.text(fmt(v), C.sub, y, { align: 'right' }); y += 4.5;
    }
    doc.setFont('helvetica', 'normal');
    if (t.toneladas) { doc.text(`Equivale a ${fmt(t.toneladas)} tn de ${t.condicion.cultivo || 'grano'}`, C.sub, y, { align: 'right' }); y += 4.5; }
    if (t.ndMonto) { doc.text(`Nota de débito ${fmt(t.condicion.nd_pct || 0)} %: USD ${fmt(t.ndMonto)}`, C.sub, y, { align: 'right' }); y += 4.5; }
    y += 4;
  }
  salto(10);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text(`TOTAL A FACTURAR: USD ${fmt(d.totales.total)}`, ancho - m, y, { align: 'right' });
  if (d.totales.ndTotal) { y += 5; doc.setFontSize(9); doc.text(`Notas de débito: USD ${fmt(d.totales.ndTotal)}`, ancho - m, y, { align: 'right' }); }

  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(130, 130, 130);
    doc.text(`Uso interno: incluye costos y márgenes. Página ${i} de ${n}`, m, alto - 6);
    doc.setTextColor(0, 0, 0);
  }
  doc.save(nombreArchivo(d, 'pdf'));
}
