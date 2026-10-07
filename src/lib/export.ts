import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import type { Cotizacion, CotizacionLinea, Cliente, Configuracion } from '@/types';
import { formatUSD, formatDate } from '@/lib/format';
import { calcularTotalesIva, recargoPorcentaje, toneladasCanje, type TotalesIva } from '@/lib/calculations';

function tasaTxt(t: number): string {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(t || 0);
}

/** IVA de la línea; en cotizaciones viejas (sin IVA por línea) se usa el de la cabecera. */
function ivaLinea(l: CotizacionLinea, cotiz: Cotizacion): number {
  return l.iva ?? cotiz.iva ?? 0;
}

/** Plazo de la línea en días (0 = contado); en cotizaciones viejas se usa el de la cabecera. */
export function plazoLinea(l: CotizacionLinea, cotiz: Cotizacion): number {
  return l.plazo_dias ?? cotiz.plazo_dias ?? 0;
}

/** Datos de financiación de una línea: su plazo, el recargo % y el total ya financiado. */
export function financiacionLinea(l: CotizacionLinea, cotiz: Cotizacion) {
  const plazo = plazoLinea(l, cotiz);
  const pct = recargoPorcentaje(plazo, cotiz.tasa_mensual || 0);
  const factor = 1 + pct / 100;
  return { plazo, pct, factor, precioUnit: (l.precio_usd + l.flete_usd) * factor, total: l.total_usd * factor };
}

/** Hay alguna línea financiada (con recargo real)? */
function hayFinanciacion(cotiz: Cotizacion, lineas: CotizacionLinea[]): boolean {
  return lineas.some((l) => financiacionLinea(l, cotiz).pct > 0);
}

/** "Contado" o "60 días". */
function condicionTxt(plazo: number): string {
  return plazo > 0 ? `${plazo} días` : 'Contado';
}

/** Totales calculados desde las líneas (cada una con su IVA y su financiación), para que PDF, WhatsApp y Excel coincidan. */
export function totalesDeCotizacion(cotiz: Cotizacion, lineas: CotizacionLinea[]): TotalesIva {
  return calcularTotalesIva(
    lineas.map((l) => ({
      totalUSD: l.total_usd,
      ivaPercent: cotiz.con_iva ? ivaLinea(l, cotiz) : 0,
      recargoPct: financiacionLinea(l, cotiz).pct,
    })),
    cotiz.tc
  );
}

/** Equivalente en granos si la cotización es de canje; null si no. */
function datosCanje(cotiz: Cotizacion, total: number): { cultivo: string; precio: number; tn: number } | null {
  if (!(cotiz.canje_precio_usd > 0)) return null;
  return { cultivo: cotiz.canje_cultivo || 'grano', precio: cotiz.canje_precio_usd, tn: toneladasCanje(total, cotiz.canje_precio_usd) };
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
  const conFin = hayFinanciacion(cotiz, lineas);
  const cols = [
    { label: 'Producto', x: margin, align: 'left' as const },
    { label: 'Cant.', x: conFin ? 82 : 95, align: 'right' as const },
    { label: hasFert ? 'Precio USD/tn' : 'Precio USD', x: conFin ? 110 : 128, align: 'right' as const },
    { label: 'Pago', x: 130, align: 'right' as const },
    { label: 'IVA %', x: 148, align: 'right' as const },
    { label: cotiz.con_iva ? 'Total USD' : 'Total USD (sin IVA)', x: pageWidth - margin, align: 'right' as const },
  ].filter((c) => (cotiz.con_iva || c.label !== 'IVA %') && (conFin || c.label !== 'Pago'));
  const iCant = 1, iPrecio = 2;
  const iPago = cols.findIndex((c) => c.label === 'Pago');
  const iIva = cols.findIndex((c) => c.label === 'IVA %');
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
    // El flete va incluido en el precio: al cliente no se le muestra por separado
    // La financiación también va incluida en el precio de cada fila
    const fin = financiacionLinea(linea, cotiz);
    doc.text(formatUSD(fin.precioUnit, 2), cols[iPrecio].x, y, { align: 'right' });
    if (iPago >= 0) doc.text(condicionTxt(fin.plazo), cols[iPago].x, y, { align: 'right' });
    if (iIva >= 0) doc.text(tasaTxt(ivaLinea(linea, cotiz)), cols[iIva].x, y, { align: 'right' });
    doc.text(formatUSD(fin.total, 2), cols[iTotal].x, y, { align: 'right' });
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
    doc.text(formatUSD(t.subtotal + t.recargo), totalX, y, { align: 'right' });
    y += 5;
  }
  if (cotiz.con_iva) {
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
  const canje = datosCanje(cotiz, t.total);
  if (canje) {
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.text(`Equivale a ${formatUSD(canje.tn)} tn de ${canje.cultivo}`, totalX, y, { align: 'right' });
    y += 4.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(110, 110, 110);
    doc.text(`(precio de referencia USD ${formatUSD(canje.precio)}/tn)`, totalX, y, { align: 'right' });
    doc.setTextColor(40, 40, 40);
    doc.setFontSize(10);
  }

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
    'Plazo (días)': plazoLinea(l, cotiz),
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
    ...(t.recargo > 0 ? { 'Financiación USD': t.recargo, 'Tasa mensual %': cotiz.tasa_mensual } : {}),
    ...(cotiz.con_iva
      ? {
          'Subtotal USD': t.subtotal,
          ...Object.fromEntries(t.desglose.map((d) => [`IVA ${tasaTxt(d.tasa)}% USD`, d.iva])),
          'IVA total USD': t.iva,
          'Total USD': t.total,
        }
      : { 'Total USD (sin IVA)': t.total }),
    'Total ARS': t.totalARS,
    ...(datosCanje(cotiz, t.total) ? { 'Canje cultivo': cotiz.canje_cultivo, 'Canje precio USD/tn': cotiz.canje_precio_usd, 'Canje tn': datosCanje(cotiz, t.total)!.tn } : {}),
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

  const conFin = hayFinanciacion(cotiz, lineas);
  lineas.forEach((l) => {
    // Flete y financiación van incluidos en el precio de cada fila
    const fin = financiacionLinea(l, cotiz);
    const pago = conFin ? ` · ${condicionTxt(fin.plazo)}` : '';
    if (l.es_fertilizante) {
      msg += `• ${l.producto}${pago}\n  ${l.cantidad} tn × ${formatUSD(fin.precioUnit)} USD/tn = ${formatUSD(fin.total)} USD\n`;
    } else {
      msg += `• ${l.producto}${pago}\n  ${l.cantidad} × ${formatUSD(fin.precioUnit)} USD = ${formatUSD(fin.total)} USD\n`;
    }
  });

  const t = totalesDeCotizacion(cotiz, lineas);
  if (cotiz.con_iva) {
    msg += `\nSubtotal: ${formatUSD(t.subtotal + t.recargo)} USD\n`;
    t.desglose.forEach((d) => {
      msg += `IVA ${tasaTxt(d.tasa)}%: ${formatUSD(d.iva)} USD\n`;
    });
    msg += `*Total: ${formatUSD(t.total)} USD*${cotiz.con_iva ? '' : ' (precios sin IVA)'}\n`;
  } else {
    msg += `\n*Total: ${formatUSD(t.total)} USD* (precios sin IVA)\n`;
  }
  msg += `Total ARS: $${formatUSD(t.totalARS, 0)}\n`;
  const canje = datosCanje(cotiz, t.total);
  if (canje) {
    msg += `\n*Equivale a ${formatUSD(canje.tn)} tn de ${canje.cultivo}* (precio de referencia USD ${formatUSD(canje.precio)}/tn)\n`;
  }

  return msg;
}
