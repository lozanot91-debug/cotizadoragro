import type { jsPDF } from 'jspdf';
import { nombreModalidad, textoFlete } from '@/lib/fleteTramos';
import type { Cotizacion, CotizacionLinea, Cliente, Configuracion } from '@/types';
import { formatUSD, formatDate } from '@/lib/format';
import { calcularTotalesIva, recargoPorcentaje, esContado, type TotalesIva } from '@/lib/calculations';
import { netoGuardado, resumenLiquidacion, toneladasPorMonto } from '@/lib/canje';
import { formatearFecha, sumarDias } from '@/lib/fechas';
import { fechaVencimiento } from '@/lib/vencimientos';
import { LOGO_CERES_TOLVAS } from '@/assets/logoCeresTolvas';
import { nombreCotizacion, archivoCotizacion } from '@/lib/nombreCotizacion';
import { opcionesParaMostrar, filasMatriz, totalesOpciones, tasasIvaOpciones, unidadLinea } from '@/lib/opcionesSalida';
import { calcularOpcion } from '@/lib/opcionesPago';

function tasaTxt(t: number): string {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(t || 0);
}

/** IVA de la línea; en cotizaciones viejas (sin IVA por línea) se usa el de la cabecera. */
export function ivaLinea(l: CotizacionLinea, cotiz: Cotizacion): number {
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

/** "Contado" o "vence 06/12/2026 (60 días)" (vencimiento = fecha de la cotización + días). */
export function condicionTxt(plazo: number, base: string): string {
  return !esContado(plazo) ? `vence ${formatearFecha(sumarDias(base, plazo))} (${plazo} días)` : 'Contado';
}

/**
 * Forma de pago para el cliente (cotización sin opciones). Nunca menciona tasa ni financiación.
 * Mixto: "Según artículo (ver columna Pago)" si la tabla muestra esa columna; si no, "Contado y a plazo según artículo".
 */
export function textoFormaPago(cotiz: Cotizacion, lineas: CotizacionLinea[]): string {
  const plazos = lineas.map((l) => plazoLinea(l, cotiz));
  if (plazos.every((p) => esContado(p))) return 'Contado';
  if (plazos.every((p) => p === plazos[0])) return `${plazos[0]} días (vence ${formatearFecha(sumarDias(cotiz.fecha, plazos[0]))})`;
  return hayFinanciacion(cotiz, lineas) ? 'Según artículo (ver columna Pago)' : 'Contado y a plazo según artículo';
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

/**
 * Monto que se paga con grano: el total CON IVA (lo que se factura), aunque la cotización se muestre sin IVA.
 * Cotizaciones viejas (sin parámetros de liquidación) siguen usando el total mostrado, como antes.
 */
export function montoCanjeDeCotizacion(cotiz: Cotizacion, lineas: CotizacionLinea[]): number {
  if (!cotiz.canje_params) return totalesDeCotizacion(cotiz, lineas).total;
  return calcularTotalesIva(
    lineas.map((l) => ({ totalUSD: l.total_usd, ivaPercent: ivaLinea(l, cotiz), recargoPct: financiacionLinea(l, cotiz).pct })),
    cotiz.tc
  ).total;
}

/** Equivalente en granos si la cotización es de canje; null si no. */
function datosCanje(cotiz: Cotizacion, lineas: CotizacionLinea[]): { cultivo: string; precio: number; neto: number; monto: number; tn: number; detalle: string; conIva: boolean } | null {
  if (!(cotiz.canje_precio_usd > 0)) return null;
  const neto = netoGuardado(cotiz.canje_precio_usd, cotiz.canje_params);
  const monto = montoCanjeDeCotizacion(cotiz, lineas);
  return {
    cultivo: cotiz.canje_cultivo || 'grano', precio: cotiz.canje_precio_usd, neto, monto,
    tn: toneladasPorMonto(monto, neto),
    detalle: resumenLiquidacion(cotiz.canje_precio_usd, cotiz.canje_params, (n, d) => formatUSD(n, d ?? 2)),
    conIva: !!cotiz.canje_params || cotiz.con_iva,
  };
}

// Paleta del PDF: la misma de la app (tailwind.config.js)
type RGB = [number, number, number];
const PDF = {
  cultivo800: [28, 59, 31] as RGB,   // #1C3B1F encabezado de tabla y total
  cultivo700: [37, 77, 39] as RGB,   // #254D27 número de cotización
  cultivo50: [238, 244, 234] as RGB, // #EEF4EA filas alternas
  trigo: [192, 144, 15] as RGB,      // #C0900F acento
  texto: [39, 46, 34] as RGB,        // #272E22
  suave: [114, 122, 103] as RGB,     // #727A67
  linea: [218, 221, 208] as RGB,     // #DADDD0
};
const LOGO_ANCHO_MM = 56;
const LOGO_PROPORCION = 202 / 1200; // alto / ancho de src/assets/logo-ceres-tolvas.png

/** "30567668661" → "30-56766866-1". Si no tiene 11 dígitos se deja como vino. */
export function formatCuit(cuit: string | null | undefined): string {
  const d = (cuit || '').replace(/\D/g, '');
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : (cuit || '');
}

/** Recorta el texto con "…" para que entre en el ancho dado (mm), con la fuente actual del doc. */
function recortar(doc: jsPDF, texto: string, anchoMm: number): string {
  if (doc.getTextWidth(texto) <= anchoMm) return texto;
  let t = texto;
  while (t.length > 1 && doc.getTextWidth(t + '…') > anchoMm) t = t.slice(0, -1);
  return t.trimEnd() + '…';
}

/** Arma el PDF de la cotización (sin descargarlo). `logo` es la imagen en data URL; sin logo se escribe el nombre. */
export async function construirPDF(
  cotiz: Cotizacion,
  lineas: CotizacionLinea[],
  cliente: Cliente | null,
  config: Configuracion,
  logo?: string
): Promise<jsPDF> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = 210;
  const margin = 15;
  const derecha = pageWidth - margin;
  const color = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const relleno = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const trazo = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);

  // Membrete: logo a la izquierda, número de cotización a la derecha
  const logoAlto = LOGO_ANCHO_MM * LOGO_PROPORCION;
  if (logo) {
    doc.addImage(logo, 'PNG', margin, 12, LOGO_ANCHO_MM, logoAlto, 'logo', 'FAST');
  } else {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(18); color(PDF.cultivo800);
    doc.text('Ceres Tolvas', margin, 20);
  }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); color(PDF.suave);
  doc.text('COTIZACIÓN', derecha, 14.5, { align: 'right', charSpace: 0.6 });
  // "Cliente - 001": se achica si el nombre del cliente es largo, para no pisar el logo
  const titulo = nombreCotizacion(cotiz);
  let tam = 20;
  doc.setFontSize(tam);
  while (tam > 11 && doc.getTextWidth(titulo) > 105) { tam -= 1; doc.setFontSize(tam); }
  color(PDF.cultivo700);
  doc.text(doc.getTextWidth(titulo) > 105 ? (doc.splitTextToSize(titulo, 105) as string[])[0] : titulo, derecha, 22, { align: 'right' });

  // Razón social y datos fiscales bajo el logo
  let y = 12 + logoAlto + 5;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); color(PDF.suave);
  const datosEmpresa = [
    config.empresa_nombre,
    config.empresa_cuit && `CUIT ${formatCuit(config.empresa_cuit)}`,
    config.empresa_direccion,
    config.empresa_telefono,
  ].filter(Boolean).join('   ·   ');
  if (datosEmpresa) doc.text(datosEmpresa, margin, y);
  y += 3.5;
  trazo(PDF.trigo); doc.setLineWidth(0.7);
  doc.line(margin, y, derecha, y);
  doc.setLineWidth(0.2);
  y += 8;

  // Datos de la cotización en dos columnas: etiqueta chica arriba, valor abajo
  const colDer = pageWidth / 2 + 5;
  const dato = (etiqueta: string, valor: string, x: number, yy: number) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); color(PDF.suave);
    doc.text(etiqueta.toUpperCase(), x, yy, { charSpace: 0.3 });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); color(PDF.texto);
    doc.text(recortar(doc, valor, colDer - margin - 8), x, yy + 4.6);
  };
  dato('Cliente', cotiz.cliente_nombre || cliente?.nombre || '-', margin, y);
  dato('CUIT del cliente', formatCuit(cliente?.cuit) || '-', colDer, y);
  y += 11;
  dato('Fecha', formatDate(cotiz.fecha), margin, y);
  dato('Válida hasta', `${formatDate(fechaVencimiento(cotiz))}  (${cotiz.vigencia_dias} días)`, colDer, y);
  y += 11;
  const flete = textoFlete(cotiz);
  const opciones = opcionesParaMostrar(cotiz);
  if (opciones.length === 0) dato('Forma de pago', textoFormaPago(cotiz, lineas), margin, y);
  if (flete) dato('Flete', flete, colDer, y);
  y += 15;

  const totalX = derecha - 3;
  if (opciones.length === 0) {
    // Tabla de productos. Columnas: x = borde derecho de cada columna numérica
    const conFin = hayFinanciacion(cotiz, lineas);
    const cols = [
      { label: 'Producto', x: margin + 2.5, align: 'left' as const },
      { label: 'Cant.', x: conFin ? 84 : 97, align: 'right' as const },
      { label: 'Precio USD', x: conFin ? 112 : 130, align: 'right' as const },
      { label: 'Pago', x: 132, align: 'right' as const },
      { label: 'IVA %', x: 150, align: 'right' as const },
      { label: cotiz.con_iva ? 'Total USD' : 'Total USD (sin IVA)', x: derecha - 2.5, align: 'right' as const },
    ].filter((c) => (cotiz.con_iva || c.label !== 'IVA %') && (conFin || c.label !== 'Pago'));
    const iCant = 1, iPrecio = 2;
    const iPago = cols.findIndex((c) => c.label === 'Pago');
    const iIva = cols.findIndex((c) => c.label === 'IVA %');
    const iTotal = cols.length - 1;
    const anchoProducto = cols[iCant].x - cols[0].x - 18;

    const encabezadoTabla = () => {
      relleno(PDF.cultivo800);
      doc.rect(margin, y - 4.8, pageWidth - 2 * margin, 7.5, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(255, 255, 255);
      cols.forEach((c) => doc.text(c.label, c.x, y, { align: c.align }));
      y += 7.5;
    };
    encabezadoTabla();

    lineas.forEach((linea, i) => {
      // Nombres largos: hasta dos renglones; si no entra, el segundo termina en "…"
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
      let nombre = doc.splitTextToSize(linea.producto, anchoProducto) as string[];
      if (nombre.length > 2) nombre = [nombre[0], recortar(doc, nombre.slice(1).join(' '), anchoProducto)];
      const extra = (nombre.length - 1) * 4;
      const altoFila = 10.5 + extra;
      if (y + altoFila > 272) {
        doc.addPage();
        y = 20;
        encabezadoTabla();
      }
      if (i % 2 === 1) {
        relleno(PDF.cultivo50);
        doc.rect(margin, y - 4.6, pageWidth - 2 * margin, altoFila, 'F');
      }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); color(PDF.texto);
      doc.text(nombre, cols[0].x, y);
      doc.setFont('helvetica', 'normal');
      doc.text(formatUSD(linea.cantidad, 2), cols[iCant].x, y, { align: 'right' });
      // El flete y la financiación van incluidos en el precio: al cliente no se le muestran por separado
      const fin = financiacionLinea(linea, cotiz);
      doc.text(formatUSD(fin.precioUnit, 2), cols[iPrecio].x, y, { align: 'right' });
      if (iPago >= 0) {
        // La columna es angosta: en el PDF va solo la fecha de vencimiento
        doc.setFontSize(8);
        doc.text(!esContado(fin.plazo) ? formatearFecha(sumarDias(cotiz.fecha, fin.plazo)) : 'Contado', cols[iPago].x, y, { align: 'right' });
        doc.setFontSize(9);
      }
      if (iIva >= 0) doc.text(tasaTxt(ivaLinea(linea, cotiz)), cols[iIva].x, y, { align: 'right' });
      doc.setFont('helvetica', 'bold');
      doc.text(formatUSD(fin.total, 2), cols[iTotal].x, y, { align: 'right' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); color(PDF.suave);
      const unidad = linea.es_fertilizante ? 'tn' : (linea.unid || '').toLowerCase();
      doc.text([linea.cod, linea.familia].filter(Boolean).join('  ·  '), cols[0].x, y + 4 + extra);
      if (unidad) {
        doc.text(unidad, cols[iCant].x, y + 4, { align: 'right' });
        doc.text(`USD/${unidad}`, cols[iPrecio].x, y + 4, { align: 'right' });
      }
      y += altoFila;
    });

    // Totales, alineados a la derecha
    const t = totalesDeCotizacion(cotiz, lineas);
    if (y > 225) { doc.addPage(); y = 25; }
    y += 3;
    const anchoCaja = 82;
    const xCaja = derecha - anchoCaja;
    const labelX = xCaja + 4;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); color(PDF.texto);
    if (cotiz.con_iva) {
      doc.text('Subtotal', labelX, y);
      doc.text(formatUSD(t.subtotal + t.recargo, 2), totalX, y, { align: 'right' });
      y += 5;
      t.desglose.forEach((d) => {
        doc.text(`IVA ${tasaTxt(d.tasa)} %`, labelX, y);
        doc.text(formatUSD(d.iva, 2), totalX, y, { align: 'right' });
        y += 5;
      });
    }
    y += 2.5;
    relleno(PDF.cultivo800);
    doc.rect(xCaja, y - 5.5, anchoCaja, 9, 'F');
    relleno(PDF.trigo);
    doc.rect(xCaja, y - 5.5, 1.4, 9, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(255, 255, 255);
    doc.text(cotiz.con_iva ? 'TOTAL USD' : 'TOTAL USD (SIN IVA)', labelX, y, { charSpace: 0.3 });
    doc.setFontSize(13);
    doc.text(formatUSD(t.total, 2), totalX, y + 0.3, { align: 'right' });
    y += 9;
  } else {
    // Con opciones de pago (el cliente todavía no eligió): un solo cuadro, artículo x opción, con sus totales
    const matriz = filasMatriz(cotiz, lineas);
    const tots = totalesOpciones(cotiz, lineas);
    const n = opciones.length;
    const anchoArt = 56;
    const xCant = margin + anchoArt + 16; // borde derecho de "Cant."
    const inicioOp = xCant + 3;
    const anchoCol = (derecha - inicioOp) / n;
    const xCol = (j: number) => inicioOp + (j + 1) * anchoCol - 2.5; // borde derecho de la columna j
    const texto = (j: number, i: number) => `${formatUSD(matriz[i].celdas[j].precioUnit, 2)} /${unidadLinea(matriz[i].linea) || 'un'}`;
    // Achica la letra (sin recortar números) hasta que entre el texto más ancho de cada columna
    let tamPrecio = 9;
    doc.setFont('helvetica', 'normal');
    const entra = () => matriz.every((_, i) => opciones.every((__, j) => { doc.setFontSize(tamPrecio); return doc.getTextWidth(texto(j, i)) <= anchoCol - 3.5; }));
    while (tamPrecio > 6 && !entra()) tamPrecio -= 0.5;

    const encabezadoOpciones = () => {
      relleno(PDF.cultivo800);
      doc.rect(margin, y - 4.8, pageWidth - 2 * margin, 7.5, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(255, 255, 255);
      doc.text('Producto', margin + 2.5, y);
      doc.text('Cant.', xCant, y, { align: 'right' });
      opciones.forEach((o, j) => doc.text(recortar(doc, o.nombre, anchoCol - 3.5), xCol(j), y, { align: 'right' }));
      y += 7.5;
    };
    encabezadoOpciones();
    matriz.forEach(({ linea, celdas }, i) => {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
      let nombre = doc.splitTextToSize(linea.producto, anchoArt - 4) as string[];
      if (nombre.length > 2) nombre = [nombre[0], recortar(doc, nombre.slice(1).join(' '), anchoArt - 4)];
      const extra = (nombre.length - 1) * 4;
      const altoFila = 10.5 + extra;
      if (y + altoFila > 272) { doc.addPage(); y = 20; encabezadoOpciones(); }
      if (i % 2 === 1) { relleno(PDF.cultivo50); doc.rect(margin, y - 4.6, pageWidth - 2 * margin, altoFila, 'F'); }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); color(PDF.texto);
      doc.text(nombre, margin + 2.5, y);
      doc.setFont('helvetica', 'normal');
      doc.text(formatUSD(linea.cantidad, 2), xCant, y, { align: 'right' });
      celdas.forEach((c, j) => {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(tamPrecio); color(PDF.texto);
        doc.text(texto(j, i), xCol(j), y, { align: 'right' });
        doc.setFontSize(7); color(PDF.suave);
        doc.text(!esContado(c.plazo) ? `vence ${formatearFecha(c.vence)}` : 'contado', xCol(j), y + 4, { align: 'right' });
      });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); color(PDF.suave);
      doc.text([linea.cod, linea.familia].filter(Boolean).join('  ·  '), margin + 2.5, y + 4 + extra);
      const unidad = unidadLinea(linea);
      if (unidad) doc.text(unidad, xCant, y + 4, { align: 'right' });
      y += altoFila;
    });
    // Totales por opción: mismas etiquetas que el bloque de totales común
    const tasas = tasasIvaOpciones(tots);
    const filasTot = (cotiz.con_iva ? 1 + tasas.length : 0) + 1;
    if (y + 3 + filasTot * 5 + 12 > 272) { doc.addPage(); y = 25; }
    y += 3;
    trazo(PDF.linea); doc.line(margin, y - 3, derecha, y - 3);
    const fila = (label: string, valor: (j: number) => string) => {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); color(PDF.texto);
      doc.text(label, margin + 2.5, y);
      opciones.forEach((_, j) => doc.text(valor(j), xCol(j), y, { align: 'right' }));
      y += 5;
    };
    if (cotiz.con_iva) {
      fila('Subtotal', (j) => formatUSD(tots[j].totales.subtotal + tots[j].totales.recargo, 2));
      tasas.forEach((tasa) => fila(`IVA ${tasaTxt(tasa)} %`, (j) => formatUSD(tots[j].totales.desglose.find((d) => d.tasa === tasa)?.iva ?? 0, 2)));
    }
    y += 2.5;
    relleno(PDF.cultivo800);
    doc.rect(margin, y - 5.5, pageWidth - 2 * margin, 9, 'F');
    relleno(PDF.trigo);
    doc.rect(margin, y - 5.5, 1.4, 9, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(255, 255, 255);
    doc.text(cotiz.con_iva ? 'TOTAL USD' : 'TOTAL USD (SIN IVA)', margin + 4, y, { charSpace: 0.3 });
    doc.setFontSize(Math.min(11, tamPrecio + 2));
    opciones.forEach((_, j) => doc.text(formatUSD(tots[j].totales.total, 2), xCol(j), y + 0.3, { align: 'right' }));
    y += 9;
  }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); color(PDF.suave);
  const canje = datosCanje(cotiz, lineas);
  if (canje) {
    y += 7;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); color(PDF.cultivo700);
    doc.text(`Canje: ${formatUSD(canje.tn)} tn de ${canje.cultivo}`, totalX, y, { align: 'right' });
    y += 4.5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); color(PDF.suave);
    doc.text(canje.detalle, totalX, y, { align: 'right' });
    if (canje.conIva && !cotiz.con_iva) {
      y += 4;
      doc.text(`sobre el total con IVA de USD ${formatUSD(canje.monto)}`, totalX, y, { align: 'right' });
    }
  }

  // Notas
  if (cotiz.notas) {
    y += 10;
    if (y > 260) { doc.addPage(); y = 25; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); color(PDF.suave);
    doc.text('NOTAS', margin, y, { charSpace: 0.3 });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); color(PDF.texto);
    const renglones = doc.splitTextToSize(cotiz.notas, pageWidth - 2 * margin) as string[];
    doc.text(renglones, margin, y + 4.6);
  }

  // Pie en todas las páginas
  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    trazo(PDF.linea); doc.setLineWidth(0.2);
    doc.line(margin, 281, derecha, 281);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); color(PDF.suave);
    doc.text('Cotización de carácter informativo, sujeta a confirmación de stock y condiciones de pago.', margin, 285);
    doc.text(paginas > 1 ? `Ceres Tolvas  ·  Página ${p} de ${paginas}` : 'Ceres Tolvas', derecha, 285, { align: 'right' });
  }

  return doc;
}

export async function generarPDF(
  cotiz: Cotizacion,
  lineas: CotizacionLinea[],
  cliente: Cliente | null,
  config: Configuracion
): Promise<void> {
  (await construirPDF(cotiz, lineas, cliente, config, LOGO_CERES_TOLVAS)).save(`Cotizacion_${archivoCotizacion(cotiz)}.pdf`);
}

export async function generarExcel(cotiz: Cotizacion, lineas: CotizacionLinea[]): Promise<void> {
  const XLSX = await import('xlsx');
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
    'Vencimiento': plazoLinea(l, cotiz) > 0 ? formatearFecha(sumarDias(cotiz.fecha, plazoLinea(l, cotiz))) : '',
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
    'Cotización': nombreCotizacion(cotiz),
    'Fecha': cotiz.fecha,
    'Cliente': cotiz.cliente_nombre,
    'KM': cotiz.km,
    'Modalidad de flete': nombreModalidad(cotiz.flete_modalidad),
    ...(cotiz.aforo_tn && cotiz.flete_modalidad !== 'largo_corto' ? { 'Aforo tramo principal (tn)': cotiz.aforo_tn } : {}),
    ...(cotiz.aforo_corto_tn ? { 'Aforo tramo corto (tn)': cotiz.aforo_corto_tn } : {}),
    ...(cotiz.flete_modalidad === 'largo_corto' ? { 'KM corto': Number(cotiz.km_corto) || 0 } : {}),
    ...(t.recargo > 0 ? { 'Financiación USD': t.recargo, 'Tasa mensual %': cotiz.tasa_mensual } : {}),
    ...(cotiz.con_iva
      ? {
          'Subtotal USD': t.subtotal,
          ...Object.fromEntries(t.desglose.map((d) => [`IVA ${tasaTxt(d.tasa)}% USD`, d.iva])),
          'IVA total USD': t.iva,
          'Total USD': t.total,
        }
      : { 'Total USD (sin IVA)': t.total }),
    ...(datosCanje(cotiz, lineas) ? { 'Canje cultivo': cotiz.canje_cultivo, 'Canje precio USD/tn': cotiz.canje_precio_usd, 'Canje neto USD/tn': datosCanje(cotiz, lineas)!.neto, 'Canje monto USD': datosCanje(cotiz, lineas)!.monto, 'Canje tn': datosCanje(cotiz, lineas)!.tn, ...(cotiz.canje_params?.destino ? { 'Canje destino': cotiz.canje_params.destino } : {}) } : {}),
    'Estado': cotiz.estado,
  }];
  const wsResumen = XLSX.utils.json_to_sheet(resumen);
  XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');

  // Opciones de pago (hoja aparte, solo si el cliente todavía no eligió)
  const opcionesXl = opcionesParaMostrar(cotiz);
  if (opcionesXl.length > 1) {
    const matriz = filasMatriz(cotiz, lineas);
    const tots = totalesOpciones(cotiz, lineas);
    const aoa: (string | number)[][] = [
      ['Artículo', 'Cantidad', 'Unidad', ...opcionesXl.flatMap((o) => [`${o.nombre} · Plazo (días)`, `${o.nombre} · Vencimiento`, `${o.nombre} · Precio USD/unid`, `${o.nombre} · Total USD`])],
      ...matriz.map(({ linea, celdas }) => [
        linea.producto, linea.cantidad, linea.unid,
        ...celdas.flatMap((c) => [c.plazo, c.vence ? formatearFecha(c.vence) : '', c.precioUnit, c.total]),
      ]),
    ];
    const filaTot = (label: string, v: (t: TotalesIva) => number) =>
      [label, '', '', ...tots.flatMap((x) => ['', '', '', v(x.totales)])];
    aoa.push(filaTot('Subtotal', (t) => t.subtotal), filaTot('Financiación', (t) => t.recargo));
    if (cotiz.con_iva) aoa.push(filaTot('IVA', (t) => t.iva));
    aoa.push(filaTot(cotiz.con_iva ? 'Total' : 'Total (sin IVA)', (t) => t.total));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Opciones de pago');
  }

  XLSX.writeFile(wb, `Cotizacion_${archivoCotizacion(cotiz)}.xlsx`);
}

export function generarWhatsApp(
  cotiz: Cotizacion,
  lineas: CotizacionLinea[],
  config: Configuracion
): string {
  let msg = `*${config.empresa_nombre}*\n`;
  msg += `Cotización ${nombreCotizacion(cotiz)}\n`;
  msg += `Fecha: ${formatDate(cotiz.fecha)}\n`;
  msg += `Cliente: ${cotiz.cliente_nombre || '-'}\n`;
  const fleteTxt = textoFlete(cotiz);
  if (fleteTxt) msg += `Flete: ${fleteTxt}\n`;
  msg += `Vigencia: ${cotiz.vigencia_dias} días\n`;
  const conFin = hayFinanciacion(cotiz, lineas);
  // Con financiación cada fila ya dice su plazo; si no, se aclara acá
  if (opcionesParaMostrar(cotiz).length === 0 && !conFin) msg += `Forma de pago: ${textoFormaPago(cotiz, lineas)}\n`;
  msg += `\n`;

  lineas.forEach((l) => {
    // Flete y financiación van incluidos en el precio de cada fila
    const fin = financiacionLinea(l, cotiz);
    const pago = conFin ? ` · ${condicionTxt(fin.plazo, cotiz.fecha)}` : '';
    if (l.es_fertilizante) {
      msg += `• ${l.producto}${pago}\n  ${l.cantidad} tn × ${formatUSD(fin.precioUnit)} USD/tn = ${formatUSD(fin.total)} USD\n`;
    } else {
      const u = (l.unid || '').toLowerCase() || 'un';
      msg += `• ${l.producto}${pago}\n  ${l.cantidad} ${u} × ${formatUSD(fin.precioUnit)} USD/${u} = ${formatUSD(fin.total)} USD\n`;
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
  const canje = datosCanje(cotiz, lineas);
  if (canje) {
    msg += `\n*Equivale a ${formatUSD(canje.tn)} tn de ${canje.cultivo}*\n(${canje.detalle}${canje.conIva && !cotiz.con_iva ? `; sobre el total con IVA de USD ${formatUSD(canje.monto)}` : ''})\n`;
  }

  const opcionesWa = opcionesParaMostrar(cotiz);
  if (opcionesWa.length > 1) {
    msg += `\n*Opciones de pago*\n`;
    opcionesWa.slice(1).forEach((op) => {
      const r = calcularOpcion(cotiz, lineas, op);
      const hayPlazo = r.lineas.some((x) => !esContado(x.plazo));
      msg += `\n*${op.nombre}*\n`;
      lineas.forEach((l, i) => {
        const x = r.lineas[i];
        const pago = hayPlazo ? ` · ${condicionTxt(x.plazo, cotiz.fecha)}` : '';
        const u = unidadLinea(l) || 'un';
        msg += `• ${l.producto}${pago}\n  ${l.cantidad} ${u} × ${formatUSD(x.precioUnit)} USD/${u} = ${formatUSD(x.total)} USD\n`;
      });
      msg += `*Total: ${formatUSD(r.totales.total)} USD*${cotiz.con_iva ? '' : ' (precios sin IVA)'}\n`;
    });
  }

  return msg;
}
