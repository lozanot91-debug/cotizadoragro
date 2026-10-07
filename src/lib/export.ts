import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import type { Cotizacion, CotizacionLinea, Cliente, Configuracion } from '@/types';
import { formatUSD, formatDate } from '@/lib/format';
import { calcularTotalesIva, type TotalesIva } from '@/lib/calculations';

function tasaTxt(t: number): string {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(t || 0);
}

/** IVA de la línea; en cotizaciones viejas (sin IVA por línea) se usa el de la cabecera. */
function ivaLinea(l: CotizacionLinea, cotiz: Cotizacion): number {
  return l.iva ?? cotiz.iva ?? 0;
}

/** Totales calculados desde las líneas (cada una con su IVA), para que PDF, WhatsApp y Excel coincidan. */
export function totalesDeCotizacion(cotiz: Cotizacion, lineas: CotizacionLinea[]): TotalesIva {
  return calcularTotalesIva(
    lineas.map((l) => ({ totalUSD: l.total_usd, ivaPercent: cotiz.con_iva ? ivaLinea(l, cotiz) : 0 })),
    cotiz.tc
  );
}

export function generarPDF(
  cotiz: Cotizacion,
  lineas: CotizacionLinea[],
  cliente: Cliente | null,
  config: Configuracion
) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = 210;
  const margin = 15;
  let y = 20;

  // Membrete
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 80, 50);
  doc.text(config.empresa_nombre, margin, y);
  y += 6;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  const datosEmpresa = [
    config.empresa_cuit && `CUIT: ${config.empresa_cuit}`,
    config.empresa_direccion,
    config.empresa_telefono,
  ].filter(Boolean).join('  |  ');
  if (datosEmpresa) {
    doc.text(datosEmpresa, margin, y);
    y += 5;
  }

  // Línea separadora
  y += 2;
  doc.setDrawColor(200, 220, 210);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  // Título cotización
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(40, 40, 40);
  doc.text(`Cotización N° ${cotiz.numero}`, margin, y);
  y += 6;

  // Datos generales
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);
  y += 2;
  const colLeft = margin;
  const colRight = pageWidth / 2 + 5;

  doc.text(`Fecha: ${formatDate(cotiz.fecha)}`, colLeft, y);
  doc.text(`Tipo de cambio: $${cotiz.tc}`, colRight, y);
  y += 5;
  doc.text(`Cliente: ${cotiz.cliente_nombre || cliente?.nombre || '-'}`, colLeft, y);
  if (cliente?.cuit) doc.text(`CUIT: ${cliente.cuit}`, colRight, y);
  y += 5;
  doc.text(`Vigencia: ${cotiz.vigencia_dias} días`, colLeft, y);
  if (cotiz.km > 0) doc.text(`Destino: ${cotiz.km} km`, colRight, y);
  y += 8;

  // Tabla de productos
  doc.setFontSize(9);
  doc.setFillColor(240, 245, 242);
  doc.rect(margin, y - 4, pageWidth - 2 * margin, 6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(50, 50, 50);

  // Columnas: x = borde derecho de cada columna numérica
  const hasFert = lineas.some((l) => l.es_fertilizante);
  const cols = [
    { label: 'Producto', x: margin, align: 'left' as const },
    { label: 'Cant.', x: 72, align: 'right' as const },
    { label: hasFert ? 'Precio USD/tn' : 'Precio USD', x: 98, align: 'right' as const },
    { label: hasFert ? 'Flete USD/tn' : 'Flete USD', x: 120, align: 'right' as const },
    { label: 'IVA %', x: 134, align: 'right' as const },
    { label: cotiz.con_iva ? 'Total USD' : 'Total USD (sin IVA)', x: pageWidth - margin, align: 'right' as const },
  ].filter((c) => cotiz.con_iva || c.label !== 'IVA %');
  const iCant = 1, iPrecio = 2, iFlete = 3;
  const iTotal = cols.length - 1;

  cols.forEach((c) => {
    doc.text(c.label, c.x, y, { align: c.align });
  });
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(40, 40, 40);

  lineas.forEach((linea) => {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(8);
    const productoText = linea.producto.length > 30 ? linea.producto.substring(0, 28) + '…' : linea.producto;
    doc.text(productoText, cols[0].x, y);
    doc.text(formatUSD(linea.cantidad, 2), cols[iCant].x, y, { align: 'right' });
    doc.text(formatUSD(linea.precio_usd, 2), cols[iPrecio].x, y, { align: 'right' });
    doc.text(formatUSD(linea.flete_usd, 2), cols[iFlete].x, y, { align: 'right' });
    if (cotiz.con_iva) doc.text(tasaTxt(ivaLinea(linea, cotiz)), cols[4].x, y, { align: 'right' });
    doc.text(formatUSD(linea.total_usd, 2), cols[iTotal].x, y, { align: 'right' });
    y += 5;
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text(`${linea.cod}  ·  ${linea.familia}`, cols[0].x, y);
    y += 6;
    doc.setTextColor(40, 40, 40);
  });

  // Totales
  const t = totalesDeCotizacion(cotiz, lineas);
  if (y > 240) { doc.addPage(); y = 20; }
  y += 4;
  doc.setDrawColor(200, 220, 210);
  doc.line(margin + 90, y, pageWidth - margin, y);
  y += 6;

  const totalX = pageWidth - margin;
  const labelX = pageWidth - margin - 70;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(40, 40, 40);
  if (cotiz.con_iva) {
    doc.text('Subtotal USD:', labelX, y);
    doc.text(formatUSD(t.subtotal), totalX, y, { align: 'right' });
    y += 5;
    t.desglose.forEach((d) => {
      doc.text(`IVA ${tasaTxt(d.tasa)}%:`, labelX, y);
      doc.text(formatUSD(d.iva), totalX, y, { align: 'right' });
      y += 5;
    });
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(cotiz.con_iva ? 'Total USD:' : 'Total USD (sin IVA):', labelX, y);
  doc.text(formatUSD(t.total), totalX, y, { align: 'right' });
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Total ARS:`, labelX, y);
  doc.text(`$${formatUSD(t.totalARS, 0)}`, totalX, y, { align: 'right' });

  // Notas
  if (cotiz.notas) {
    y += 10;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.text(`Notas: ${cotiz.notas}`, margin, y);
  }

  // Footer
  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);
  doc.text(
    'Esta cotización tiene carácter informativo y está sujeta a confirmación de stock y condiciones de pago.',
    margin,
    285
  );

  doc.save(`Cotizacion_${cotiz.numero}.pdf`);
}

export function generarExcel(cotiz: Cotizacion, lineas: CotizacionLinea[]) {
  const t = totalesDeCotizacion(cotiz, lineas);
  const data = lineas.map((l) => ({
    'Código': l.cod,
    'Producto': l.producto,
    'Familia': l.familia,
    'Proveedor': l.proveedor,
    'Unidad': l.unid,
    'Cantidad': l.cantidad,
    'Margen %': l.margen,
    ...(cotiz.con_iva ? { 'IVA %': ivaLinea(l, cotiz) } : {}),
    'Precio USD': l.precio_usd,
    'Flete USD': l.flete_usd,
    'Total USD': l.total_usd,
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Cotización');

  // Hoja de resumen
  const resumen = [{
    'Número': cotiz.numero,
    'Fecha': cotiz.fecha,
    'Cliente': cotiz.cliente_nombre,
    'Tipo de cambio': cotiz.tc,
    'KM': cotiz.km,
    ...(cotiz.con_iva
      ? {
          'Subtotal USD': t.subtotal,
          ...Object.fromEntries(t.desglose.map((d) => [`IVA ${tasaTxt(d.tasa)}% USD`, d.iva])),
          'IVA total USD': t.iva,
          'Total USD': t.total,
        }
      : { 'Total USD (sin IVA)': t.total }),
    'Total ARS': t.totalARS,
    'Estado': cotiz.estado,
  }];
  const wsResumen = XLSX.utils.json_to_sheet(resumen);
  XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');

  XLSX.writeFile(wb, `Cotizacion_${cotiz.numero}.xlsx`);
}

export function generarWhatsApp(
  cotiz: Cotizacion,
  lineas: CotizacionLinea[],
  config: Configuracion
): string {
  let msg = `*${config.empresa_nombre}*\n`;
  msg += `Cotización N° ${cotiz.numero}\n`;
  msg += `Fecha: ${formatDate(cotiz.fecha)}\n`;
  msg += `Cliente: ${cotiz.cliente_nombre || '-'}\n`;
  msg += `Tipo de cambio: $${cotiz.tc}\n`;
  if (cotiz.km > 0) msg += `Destino: ${cotiz.km} km\n`;
  msg += `Vigencia: ${cotiz.vigencia_dias} días\n`;
  msg += `\n`;

  lineas.forEach((l) => {
    if (l.es_fertilizante) {
      msg += `• ${l.producto}\n  ${l.cantidad} tn × ${formatUSD(l.precio_usd + l.flete_usd)} USD/tn`;
      if (l.flete_usd > 0) {
        msg += ` (prod: ${formatUSD(l.precio_usd)} + flete: ${formatUSD(l.flete_usd)})`;
      }
      msg += ` = ${formatUSD(l.total_usd)} USD\n`;
    } else {
      msg += `• ${l.producto}\n  ${l.cantidad} × ${formatUSD(l.precio_usd)} USD = ${formatUSD(l.total_usd)} USD\n`;
    }
  });

  const t = totalesDeCotizacion(cotiz, lineas);
  if (cotiz.con_iva) {
    msg += `\nSubtotal: ${formatUSD(t.subtotal)} USD\n`;
    t.desglose.forEach((d) => {
      msg += `IVA ${tasaTxt(d.tasa)}%: ${formatUSD(d.iva)} USD\n`;
    });
    msg += `*Total: ${formatUSD(t.total)} USD*\n`;
  } else {
    msg += `\n*Total: ${formatUSD(t.total)} USD* (precios sin IVA)\n`;
  }
  msg += `Total ARS: $${formatUSD(t.totalARS, 0)}\n`;

  return msg;
}
