import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useData } from '@/hooks/useData';
import { useAuth } from '@/context/AuthContext';
import { calcularLinea, calcularTotalesIva, resolverMargen } from '@/lib/calculations';
import { formatUSD, formatInputNumber, parseNumberInput } from '@/lib/format';
import { generarPDF, generarExcel, generarWhatsApp } from '@/lib/export';
import { registrarCambio, registrarCambios, fmtMargen, type CambioHistorial } from '@/lib/historial';
import type { ProductoConCosto, Cliente, CotizacionLinea, Cotizacion, Configuracion, TarifaFlete, HistorialCambio } from '@/types';
import { Search, Plus, Trash2, Save, Copy, FileDown, FileSpreadsheet, Package, Loader2, Check, X, Pencil, RotateCcw, AlertTriangle, Lock, History, Link2 } from 'lucide-react';
import { hoyAR, formatearFechaHora } from '@/lib/fechas';
import { traducirError } from '@/lib/errores';
import { useCargaSegura } from '@/hooks/useCargaSegura';
import ErrorCarga from '@/components/ErrorCarga';

interface LineaEditable {
  key: string;
  producto: ProductoConCosto;
  cantidad: number;
  margen: number;
  margenOriginal: number;
  conFlete: boolean;
  cantidadStr: string;
  margenStr: string;
  costoOverrideUSD: number | null;
  costoStr: string;
  /** Alícuota de IVA de esta línea (%). */
  iva: number;
  ivaStr: string;
}

/**
 * IVA de una línea guardada. En cotizaciones viejas (sin IVA por línea) se usa el de la cabecera,
 * salvo que sea absurdo (hubo un error que guardaba 105% en vez de 10,5%): ahí se usa el sugerido.
 */
function ivaDeLinea(
  l: CotizacionLinea,
  cotiz: Cotizacion,
  cfg: Configuracion
): number {
  if (l.iva !== null && l.iva !== undefined) return l.iva;
  if (cotiz.iva > 0 && cotiz.iva <= 30) return cotiz.iva;
  return l.es_fertilizante ? cfg.iva_fertilizantes : cfg.iva_agroquimicos;
}

interface LineaComparacion {
  cod: string;
  producto: string;
  precioAnt: number;
  precioNuevo: number;
  diff: number;
  pct: number;
}

export default function NuevaCotizacion({ editId, duplicateFromId, onDeleted }: { editId?: string; duplicateFromId?: string; onDeleted?: () => void }) {
  const data = useData();

  const [config, setConfig] = useState<Configuracion | null>(null);
  const [productos, setProductos] = useState<ProductoConCosto[]>([]);
  const [tarifas, setTarifas] = useState<TarifaFlete[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [clienteId, setClienteId] = useState('');
  const [clienteBusqueda, setClienteBusqueda] = useState('');
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null);
  const [mostrarNuevoCliente, setMostrarNuevoCliente] = useState(false);
  const [nuevoClienteNombre, setNuevoClienteNombre] = useState('');
  const [fecha, setFecha] = useState(hoyAR());
  const [tc, setTc] = useState('');
  const [km, setKm] = useState('');
  const [vigencia, setVigencia] = useState('');
  const [conIva, setConIva] = useState(false);
  const [notas, setNotas] = useState('');
  const [lineas, setLineas] = useState<LineaEditable[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [editData, setEditData] = useState<Cotizacion | null>(null);
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [kmWarning, setKmWarning] = useState(false);
  const listaIdRef = useRef<string | null>(null);
  const [origenId, setOrigenId] = useState<string | null>(null);
  const [origenNumero, setOrigenNumero] = useState<number | null>(null);
  const [comparacion, setComparacion] = useState<{ lineas: LineaComparacion[]; totalAnt: number; totalNuevo: number } | null>(null);
  const [productosFaltantes, setProductosFaltantes] = useState<string[]>([]);
  const [historial, setHistorial] = useState<HistorialCambio[]>([]);
  const [showHistorial, setShowHistorial] = useState(false);
  const [modalEliminar, setModalEliminar] = useState(false);
  const [showInsumoManual, setShowInsumoManual] = useState(false);
  const [insumoForm, setInsumoForm] = useState({ nombre: '', unid: 'un', costoUSD: '', familia: '' });

  const puedeVerCostos = true;
  const esReadOnly = editData?.estado === 'Ganada' || editData?.estado === 'Perdida';

  const cargar = useCallback(async () => {
    const [cfg, lista, tars, cls] = await Promise.all([
      data.fetchConfig(),
      data.fetchListaVigente(),
      data.fetchTarifasFlete(),
      data.fetchClientes(),
    ]);
    setConfig(cfg);
    setTc(String(cfg.tipo_cambio_default));
    setVigencia(String(cfg.vigencia_default));
    setTarifas(tars);
    setClientes(cls);
    listaIdRef.current = lista?.id || null;

    let productosLista: ProductoConCosto[] = [];
    if (lista) {
      productosLista = await data.fetchProductosConCosto(lista.id);
      setProductos(productosLista);
    }

    if (editId) {
      const cotiz = await data.fetchCotizacion(editId);
      if (cotiz) {
        setEditData(cotiz);
        setClienteId(cotiz.cliente_id || '');
        setClienteBusqueda(cotiz.cliente_nombre || '');
        setFecha(cotiz.fecha);
        setTc(String(cotiz.tc));
        setKm(String(cotiz.km));
        setVigencia(String(cotiz.vigencia_dias));
        setConIva(!!cotiz.con_iva);
        setNotas(cotiz.notas || '');
        listaIdRef.current = cotiz.lista_id;

        if (cotiz.cotizacion_origen_id) {
          setOrigenId(cotiz.cotizacion_origen_id);
          const origen = await data.fetchCotizacion(cotiz.cotizacion_origen_id);
          setOrigenNumero(origen?.numero || null);
        }

        // Load historial for this cotización
        const hist = await data.fetchHistorialCotizacion(editId);
        setHistorial(hist);

        let productosCotiz = productosLista;
        if (cotiz.lista_id && cotiz.lista_id !== lista?.id) {
          productosCotiz = await data.fetchProductosConCosto(cotiz.lista_id);
          setProductos(productosCotiz);
        }

        const lins = await data.fetchLineas(editId);
        const lineasEdit: LineaEditable[] = lins.map((l) => {
          const prod = productosCotiz.find((p) => p.id === l.producto_id) ||
                       productosCotiz.find((p) => p.cod === l.cod) || null;

          let productoLinea: ProductoConCosto;
          if (prod) {
            productoLinea = prod;
          } else {
            const costoKg = l.es_fertilizante ? (l.costo_usd / 1000) : l.costo_usd;
            productoLinea = {
              id: l.producto_id || '', cod: l.cod, proveedor: l.proveedor, familia: l.familia,
              producto: l.producto, unid: l.unid, costo: costoKg, moneda: 'USD',
              margen_default: null, margen_producto: null, es_fertilizante: l.es_fertilizante,
            };
          }

          const costoOverride = l.costo_editado ? l.costo_usd : null;
          return {
            key: l.id || Math.random().toString(),
            producto: productoLinea,
            cantidad: l.cantidad, margen: l.margen, margenOriginal: l.margen,
            conFlete: l.con_flete,
            cantidadStr: formatInputNumber(l.cantidad, 2),
            margenStr: formatInputNumber(l.margen, 1),
            costoOverrideUSD: costoOverride,
            costoStr: formatInputNumber(costoOverride ?? (l.es_fertilizante ? productoLinea.costo * 1000 : productoLinea.costo), 2),
            iva: ivaDeLinea(l, cotiz, cfg),
            ivaStr: formatInputNumber(ivaDeLinea(l, cotiz, cfg), 2),
          };
        });
        setLineas(lineasEdit);
      }
    } else if (duplicateFromId) {
      // Duplicar: load original and open with vigente lista costs
      const cotiz = await data.fetchCotizacion(duplicateFromId);
      if (cotiz) {
        setOrigenId(cotiz.id);
        setOrigenNumero(cotiz.numero);
        setClienteId(cotiz.cliente_id || '');
        setClienteBusqueda(cotiz.cliente_nombre || '');
        setKm(String(cotiz.km));
        setConIva(!!cotiz.con_iva);
        setNotas(cotiz.notas || '');
        setTc(String(cotiz.tc));
        setVigencia(String(cfg.vigencia_default));

        const origLineas = await data.fetchLineas(duplicateFromId);
        const faltantes: string[] = [];
        const compLineas: LineaComparacion[] = [];
        let totalAnt = 0;

        const nuevasLineas: LineaEditable[] = [];
        for (const l of origLineas) {
          const prod = productosLista.find((p) => p.cod === l.cod);
          if (!prod) {
            faltantes.push(`${l.producto} (${l.cod})`);
            totalAnt += l.total_usd;
            continue;
          }
          const margenesCli = cotiz.cliente_id ? await data.fetchMargenesCliente(cotiz.cliente_id) : [];
          const margenCliArr = margenesCli.map((m) => ({ producto_id: m.producto_id, familia: m.familia, margen: m.margen }));
          const margen = resolverMargen(prod, cfg.margen_general, margenCliArr);
          const costoDisplay = prod.es_fertilizante
            ? (prod.moneda === 'ARS' ? prod.costo / parseFloat(cotiz.tc.toString()) : prod.costo) * 1000
            : (prod.moneda === 'ARS' ? prod.costo / parseFloat(cotiz.tc.toString()) : prod.costo);

          const calc = calcularLinea({
            producto: prod, cantidad: l.cantidad, margen, conFlete: l.con_flete,
            tc: parseFloat(cotiz.tc.toString()), km: cotiz.km, tarifaFlete: tars,
          });

          compLineas.push({
            cod: l.cod, producto: l.producto,
            precioAnt: l.precio_usd, precioNuevo: calc.precioUSD,
            diff: calc.precioUSD - l.precio_usd,
            pct: l.precio_usd > 0 ? ((calc.precioUSD - l.precio_usd) / l.precio_usd) * 100 : 0,
          });
          totalAnt += l.total_usd;

          nuevasLineas.push({
            key: Math.random().toString(36), producto: prod, cantidad: l.cantidad,
            margen, margenOriginal: margen, conFlete: l.con_flete,
            cantidadStr: formatInputNumber(l.cantidad, 2),
            margenStr: formatInputNumber(margen, 1),
            costoOverrideUSD: null,
            costoStr: formatInputNumber(costoDisplay, 2),
            iva: ivaDeLinea(l, cotiz, cfg),
            ivaStr: formatInputNumber(ivaDeLinea(l, cotiz, cfg), 2),
          });
        }
        setLineas(nuevasLineas);
        setProductosFaltantes(faltantes);

        // Build comparison
        const totalNuevo = nuevasLineas.reduce((sum, l) => {
          const calc = calcularLinea({
            producto: l.producto, cantidad: l.cantidad, margen: l.margen,
            conFlete: l.conFlete, tc: parseFloat(tc || '0'), km: parseInt(km || '0') || cotiz.km,
            tarifaFlete: tars,
          });
          return sum + calc.totalUSD;
        }, 0);
        setComparacion({ lineas: compLineas, totalAnt, totalNuevo });
      }
    }
  }, [editId, duplicateFromId]);

  const { load, reintentar, errorCarga } = useCargaSegura(cargar, setLoading);
  useEffect(() => { load(); }, [load]);

  const kmNum = parseInt(km) || 0;
  useEffect(() => { setKmWarning(kmNum > 1200); }, [kmNum]);

  const clientesFiltrados = useMemo(() => {
    if (!clienteBusqueda) return [];
    const q = clienteBusqueda.toLowerCase();
    return clientes.filter((c) => c.nombre.toLowerCase().includes(q)).slice(0, 5);
  }, [clienteBusqueda, clientes]);

  const productosFiltrados = useMemo(() => {
    if (!busqueda) return [];
    const q = busqueda.toLowerCase();
    return productos
      .filter((p) =>
        (p.producto || '').toLowerCase().includes(q) ||
        p.cod.toLowerCase().includes(q) ||
        (p.proveedor || '').toLowerCase().includes(q) ||
        (p.familia || '').toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [busqueda, productos]);

  const [margenesClienteState, setMargenesClienteState] = useState<
    { producto_id: string | null; familia: string | null; margen: number }[]
  >([]);

  useEffect(() => {
    if (clienteId) {
      data.fetchMargenesCliente(clienteId).then((ms) => {
        setMargenesClienteState(ms.map((m) => ({ producto_id: m.producto_id, familia: m.familia, margen: m.margen })));
      });
    } else {
      setMargenesClienteState([]);
    }
  }, [clienteId]);

  const tcNum = parseNumberInput(tc);

  const lineasCalc = useMemo(() => {
    return lineas.map((l) => {
      const costoListaTn = l.producto.es_fertilizante
        ? (l.producto.moneda === 'ARS' ? l.producto.costo / tcNum : l.producto.costo) * 1000
        : (l.producto.moneda === 'ARS' ? l.producto.costo / tcNum : l.producto.costo);
      const calc = calcularLinea({
        producto: l.producto, cantidad: l.cantidad, margen: l.margen, conFlete: l.conFlete,
        tc: tcNum, km: kmNum, tarifaFlete: tarifas, costoOverrideUSD: l.costoOverrideUSD,
      });
      return { ...l, ...calc, costoListaDisplay: costoListaTn };
    });
  }, [lineas, tcNum, kmNum, tarifas]);

  const totales = useMemo(() => {
    return calcularTotalesIva(lineasCalc.map((l) => ({ totalUSD: l.totalUSD, ivaPercent: conIva ? l.iva : 0 })), tcNum);
  }, [lineasCalc, tcNum, conIva]);

  const tarifaFaltante = lineasCalc.some((l) => l.tarifaFaltante);
  const costoZero = lineasCalc.some((l) => l.costoUSD <= 0);

  function agregarProducto(producto: ProductoConCosto) {
    if (esReadOnly) return;
    if (producto.costo <= 0) {
      setSaveMsg({ type: 'error', text: `No se puede agregar ${producto.producto || producto.cod}: costo en cero` });
      setTimeout(() => setSaveMsg(null), 3000);
      return;
    }
    const margen = resolverMargen(producto, config?.margen_general || 8, margenesClienteState);
    const costoDisplay = producto.es_fertilizante
      ? (producto.moneda === 'ARS' ? producto.costo / tcNum : producto.costo) * 1000
      : (producto.moneda === 'ARS' ? producto.costo / tcNum : producto.costo);
    setLineas([...lineas, {
      key: Math.random().toString(36), producto, cantidad: 1, margen, margenOriginal: margen,
      conFlete: producto.es_fertilizante, cantidadStr: '1',
      margenStr: formatInputNumber(margen, 1), costoOverrideUSD: null,
      costoStr: formatInputNumber(costoDisplay, 2),
      iva: ivaSugerido(producto.es_fertilizante), ivaStr: formatInputNumber(ivaSugerido(producto.es_fertilizante), 2),
    }]);
    setBusqueda('');
  }

  function actualizarLinea(key: string, updates: Partial<LineaEditable>) {
    if (esReadOnly) return;
    setLineas(lineas.map((l) => (l.key === key ? { ...l, ...updates } : l)));
  }

  function agregarInsumoManual() {
    if (esReadOnly) return;
    const nombre = insumoForm.nombre.trim();
    const costo = parseNumberInput(insumoForm.costoUSD);
    if (!nombre) { setSaveMsg({ type: 'error', text: 'Ingresá el nombre del insumo' }); setTimeout(() => setSaveMsg(null), 3000); return; }
    if (costo <= 0) { setSaveMsg({ type: 'error', text: 'Ingresá un costo mayor a cero' }); setTimeout(() => setSaveMsg(null), 3000); return; }
    const productoManual: ProductoConCosto = {
      id: '', cod: `MANUAL-${Date.now()}`, proveedor: '',
      familia: insumoForm.familia.trim() || 'Otros',
      producto: nombre, unid: insumoForm.unid.trim() || 'un',
      costo, moneda: 'USD', margen_default: null, margen_producto: null, es_fertilizante: false,
    };
    const margen = resolverMargen(productoManual, config?.margen_general || 8, margenesClienteState);
    setLineas([...lineas, {
      key: Math.random().toString(36), producto: productoManual, cantidad: 1, margen, margenOriginal: margen,
      conFlete: false, cantidadStr: '1', margenStr: formatInputNumber(margen, 1),
      costoOverrideUSD: null, costoStr: formatInputNumber(costo, 2),
      iva: ivaSugerido(false), ivaStr: formatInputNumber(ivaSugerido(false), 2),
    }]);
    setInsumoForm({ nombre: '', unid: 'un', costoUSD: '', familia: '' });
    setShowInsumoManual(false);
    setBusqueda('');
  }
  function eliminarLinea(key: string) {
    if (esReadOnly) return;
    setLineas(lineas.filter((l) => l.key !== key));
  }
  function handleCantidadChange(key: string, value: string) {
    actualizarLinea(key, { cantidadStr: value, cantidad: parseNumberInput(value) });
  }
  function handleMargenChange(key: string, value: string) {
    actualizarLinea(key, { margenStr: value, margen: parseNumberInput(value) });
  }
  /** IVA sugerido según el tipo de producto (config). Se puede editar en cada línea. */
  function ivaSugerido(esFertilizante: boolean): number {
    return esFertilizante ? (config?.iva_fertilizantes ?? 10.5) : (config?.iva_agroquimicos ?? 21);
  }
  function handleIvaChange(key: string, value: string) {
    const n = parseNumberInput(value);
    actualizarLinea(key, { ivaStr: value, iva: Math.min(100, Math.max(0, n)) });
  }
  function handleCostoChange(key: string, value: string) {
    actualizarLinea(key, { costoStr: value, costoOverrideUSD: parseNumberInput(value) });
  }
  function restablecerCosto(key: string) {
    const linea = lineas.find((l) => l.key === key);
    if (!linea) return;
    const costoLista = linea.producto.es_fertilizante
      ? (linea.producto.moneda === 'ARS' ? linea.producto.costo / tcNum : linea.producto.costo) * 1000
      : (linea.producto.moneda === 'ARS' ? linea.producto.costo / tcNum : linea.producto.costo);
    actualizarLinea(key, { costoOverrideUSD: null, costoStr: formatInputNumber(costoLista, 2) });
  }

  async function seleccionarCliente(cliente: Cliente) {
    if (esReadOnly) return;
    setClienteId(cliente.id);
    setClienteBusqueda(cliente.nombre);
    setClienteSeleccionado(cliente);
  }

  async function crearClienteRapido() {
    if (!nuevoClienteNombre.trim()) return;
    const nuevo = await data.createCliente({ nombre: nuevoClienteNombre, cuit: '', zona: '', condiciones_pago: '' });
    if (nuevo) {
      setClientes([...clientes, nuevo]);
      seleccionarCliente(nuevo);
      setMostrarNuevoCliente(false);
      setNuevoClienteNombre('');
    }
  }

  function buildLineasData() {
    return lineasCalc.map((l) => ({
      producto_id: l.producto.id || null, cod: l.producto.cod,
      producto: l.producto.producto || '', familia: l.producto.familia || '',
      proveedor: l.producto.proveedor || '', unid: l.producto.unid || '',
      es_fertilizante: l.producto.es_fertilizante, cantidad: l.cantidad,
      costo_usd: l.costoUSD, costo_lista_usd: l.costoListaUSD, costo_editado: l.costoEditado,
      margen: l.margen, precio_usd: l.precioUSD, flete_usd: l.fleteUSD,
      total_usd: l.totalUSD, con_flete: l.conFlete, iva: l.iva,
    }));
  }

  function buildCotizData(): Partial<Cotizacion> {
    return {
      cliente_id: clienteId, cliente_nombre: clienteBusqueda, fecha, tc: tcNum,
      km: kmNum, con_iva: conIva, iva: conIva ? totales.ivaEfectivo : 0, vigencia_dias: parseInt(vigencia) || 15,
      estado: editData?.estado || 'Borrador', vendedor: null,
      lista_id: listaIdRef.current, subtotal_usd: totales.subtotal, iva_usd: totales.iva,
      total_usd: totales.total, total_ars: totales.totalARS, notas,
      ...(origenId && !editId ? { cotizacion_origen_id: origenId } : {}),
    };
  }

  async function handleGuardar() {
    setSaving(true);
    setSaveMsg(null);

    if (!clienteId || !clienteBusqueda) { setSaveMsg({ type: 'error', text: 'Seleccioná un cliente' }); setSaving(false); return; }
    if (!tcNum || tcNum <= 0) { setSaveMsg({ type: 'error', text: 'El tipo de cambio es obligatorio' }); setSaving(false); return; }
    if (lineas.length === 0) { setSaveMsg({ type: 'error', text: 'Agregá al menos una línea' }); setSaving(false); return; }
    if (tarifaFaltante) { setSaveMsg({ type: 'error', text: 'Falta tarifa de flete. No se puede guardar.' }); setSaving(false); return; }
    if (costoZero) { setSaveMsg({ type: 'error', text: 'Hay líneas con costo en cero.' }); setSaving(false); return; }

    // If editing, compare with previous lines for historial
    let cambiosHist: CambioHistorial[] = [];
    if (editId && editData) {
      const prevLineas = await data.fetchLineas(editId).catch((e) => {
        setSaveMsg({ type: 'error', text: `No se pudo leer la cotización actual. ${traducirError(e)}` });
        return null;
      });
      if (!prevLineas) { setSaving(false); return; }
      const prevByCod = new Map(prevLineas.map((l) => [l.cod, l]));
      const newCods = new Set(lineasCalc.map((l) => l.producto.cod));

      // Lines removed
      for (const [cod, pl] of prevByCod) {
        if (!newCods.has(cod)) {
          cambiosHist.push({ tipo: 'linea', cotizacion_id: editId, entidad: `Producto ${cod}`, campo: 'línea', valor_anterior: `${pl.cantidad} × ${formatUSD(pl.precio_usd)}`, valor_nuevo: null, detalle: 'Línea quitada' });
        }
      }

      // Lines added or changed
      for (const l of lineasCalc) {
        const prev = prevByCod.get(l.producto.cod);
        if (!prev) {
          cambiosHist.push({ tipo: 'linea', cotizacion_id: editId, entidad: `Producto ${l.producto.cod}`, campo: 'línea', valor_anterior: null, valor_nuevo: `${l.cantidad} × ${formatUSD(l.precioUSD)}`, detalle: 'Línea agregada' });
        } else {
          if (prev.cantidad !== l.cantidad) cambiosHist.push({ tipo: 'linea', cotizacion_id: editId, entidad: `Producto ${l.producto.cod}`, campo: 'cantidad', valor_anterior: String(prev.cantidad), valor_nuevo: String(l.cantidad) });
          if (prev.margen !== l.margen) cambiosHist.push({ tipo: 'margen', cotizacion_id: editId, entidad: `Producto ${l.producto.cod}`, campo: 'margen', valor_anterior: fmtMargen(prev.margen), valor_nuevo: fmtMargen(l.margen) });
          if (prev.con_flete !== l.conFlete) cambiosHist.push({ tipo: 'linea', cotizacion_id: editId, entidad: `Producto ${l.producto.cod}`, campo: 'flete', valor_anterior: prev.con_flete ? 'Sí' : 'No', valor_nuevo: l.conFlete ? 'Sí' : 'No' });
          if (prev.costo_editado !== l.costoEditado) cambiosHist.push({ tipo: 'costo', cotizacion_id: editId, entidad: `Producto ${l.producto.cod}`, campo: 'costo editado', valor_anterior: prev.costo_editado ? 'Sí' : 'No', valor_nuevo: l.costoEditado ? 'Sí' : 'No' });
          const ivaPrev = ivaDeLinea(prev, editData, config!);
          if (conIva && editData.con_iva && ivaPrev !== l.iva) cambiosHist.push({ tipo: 'linea', cotizacion_id: editId, entidad: `Producto ${l.producto.cod}`, campo: 'IVA', valor_anterior: `${ivaPrev}%`, valor_nuevo: `${l.iva}%` });
          if (Math.abs(prev.precio_usd - l.precioUSD) > 0.01) cambiosHist.push({ tipo: 'linea', cotizacion_id: editId, entidad: `Producto ${l.producto.cod}`, campo: 'precio', valor_anterior: `USD ${formatUSD(prev.precio_usd)}`, valor_nuevo: `USD ${formatUSD(l.precioUSD)}` });
        }
      }

      // Header changes
      if (!!editData.con_iva !== conIva) cambiosHist.push({ tipo: 'cotizacion', cotizacion_id: editId, campo: 'IVA', valor_anterior: editData.con_iva ? 'Con IVA' : 'Sin IVA', valor_nuevo: conIva ? 'Con IVA' : 'Sin IVA' });
      if (editData.tc !== tcNum) cambiosHist.push({ tipo: 'cotizacion', cotizacion_id: editId, campo: 'tipo de cambio', valor_anterior: String(editData.tc), valor_nuevo: String(tcNum) });
      if (editData.km !== kmNum) cambiosHist.push({ tipo: 'cotizacion', cotizacion_id: editId, campo: 'km', valor_anterior: String(editData.km), valor_nuevo: String(kmNum) });
      if (editData.cliente_nombre !== clienteBusqueda) cambiosHist.push({ tipo: 'cotizacion', cotizacion_id: editId, campo: 'cliente', valor_anterior: editData.cliente_nombre || '', valor_nuevo: clienteBusqueda });
      if (editData.vigencia_dias !== (parseInt(vigencia) || 15)) cambiosHist.push({ tipo: 'cotizacion', cotizacion_id: editId, campo: 'vigencia', valor_anterior: `${editData.vigencia_dias} días`, valor_nuevo: `${parseInt(vigencia) || 15} días` });
    }

    try {
      const saved = await data.saveCotizacion(buildCotizData(), buildLineasData(), editId);
      setSaveMsg({ type: 'success', text: `Cotización N° ${saved.numero} guardada` });
      setEditData(saved);

      if (!editId) {
        // New cotización or duplicate
        await registrarCambio({ tipo: 'cotizacion', cotizacion_id: saved.id, campo: 'creación', valor_nuevo: `N° ${saved.numero}`, detalle: origenId ? `Duplicada de N° ${origenNumero}` : null });
        if (origenId) {
          await registrarCambio({ tipo: 'cotizacion', cotizacion_id: origenId, detalle: `Duplicada como N° ${saved.numero}` });
        }
      } else {
        // Register changes for existing
        if (cambiosHist.length > 0) await registrarCambios(cambiosHist);
      }

      // Refresh historial
      const hist = await data.fetchHistorialCotizacion(saved.id);
      setHistorial(hist);

      if (!editId) {
        setTimeout(() => {
          setLineas([]); setClienteId(''); setClienteBusqueda(''); setClienteSeleccionado(null);
          setNotas(''); setSaveMsg(null); setOrigenId(null); setOrigenNumero(null);
          setComparacion(null); setProductosFaltantes([]);
        }, 2000);
      }
    } catch (e) {
      // La cotización NO se guardó (la operación es atómica): lo que está en pantalla sigue intacto.
      setSaveMsg({ type: 'error', text: `No se pudo guardar la cotización. ${traducirError(e)}` });
    } finally {
      setSaving(false);
    }
  }

  /** Líneas en el formato que esperan PDF / WhatsApp / Excel (CotizacionLinea). */
  function lineasParaExport(): CotizacionLinea[] {
    return lineasCalc.map((l, i) => ({
      id: l.key, cotizacion_id: editData?.id || '', producto_id: l.producto.id || null,
      cod: l.producto.cod, producto: l.producto.producto || '', familia: l.producto.familia || '',
      proveedor: l.producto.proveedor || '', unid: l.producto.unid || '',
      es_fertilizante: l.producto.es_fertilizante, cantidad: l.cantidad,
      costo_usd: l.costoUSD, costo_lista_usd: l.costoListaUSD, costo_editado: l.costoEditado,
      margen: l.margen, precio_usd: l.precioUSD, flete_usd: l.fleteUSD,
      total_usd: l.totalUSD, con_flete: l.conFlete, iva: l.iva, orden: i,
    }));
  }

  function cotizParaExport(): Cotizacion {
    return { id: editData?.id || '', numero: editData?.numero || 0, ...buildCotizData(), motivo_perdida: null, cantidades_reales: null, created_at: '', updated_at: '' } as Cotizacion;
  }
  function avisarExport(type: 'success' | 'error', text: string, ms = 3000) {
    setSaveMsg({ type, text });
    setTimeout(() => setSaveMsg(null), ms);
  }
  async function handleCopiarWhatsApp() {
    try {
      const msg = generarWhatsApp(cotizParaExport(), lineasParaExport(), config!);
      await navigator.clipboard.writeText(msg);
      avisarExport('success', 'Texto copiado para WhatsApp', 2000);
    } catch (e) {
      console.error('Error al copiar para WhatsApp:', e);
      avisarExport('error', 'No se pudo copiar el texto. Probá de nuevo.');
    }
  }
  function handleDescargarPDF() {
    try {
      generarPDF(cotizParaExport(), lineasParaExport(), clienteSeleccionado, config!);
    } catch (e) {
      console.error('Error al generar el PDF:', e);
      avisarExport('error', 'No se pudo generar el PDF. Probá de nuevo.');
    }
  }
  function handleDescargarExcel() {
    try {
      generarExcel(cotizParaExport(), lineasParaExport());
    } catch (e) {
      console.error('Error al generar el Excel:', e);
      avisarExport('error', 'No se pudo generar el Excel. Probá de nuevo.');
    }
  }

  function formatFechaHora(iso: string): string {
    return formatearFechaHora(iso);
  }

  if (errorCarga && !loading) return <ErrorCarga error={errorCarga} onReintentar={reintentar} />;

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-emerald-600 animate-spin" /></div>;
  }
  if (productos.length === 0 && !editId) {
    return (
      <div className="max-w-2xl mx-auto bg-amber-50 border border-amber-200 rounded-xl p-8 text-center">
        <Package className="w-12 h-12 text-amber-500 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-amber-800 mb-2">No hay lista de costos cargada</h2>
        <p className="text-sm text-amber-600">Necesitás subir una lista de costos desde la pantalla de Listas.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-800">
          {editId ? `Editar cotización N° ${editData?.numero}` : duplicateFromId ? `Duplicar cotización N° ${origenNumero}` : 'Nueva cotización'}
        </h1>
        {esReadOnly && (
          <span className="text-xs px-3 py-1 rounded-full bg-gray-100 text-gray-600 font-medium flex items-center gap-1">
            <Lock className="w-3 h-3" /> Solo lectura — {editData?.estado}
          </span>
        )}
        {origenNumero && (
          <span className="text-xs px-3 py-1 rounded-full bg-blue-50 text-blue-600 font-medium flex items-center gap-1">
            <Link2 className="w-3 h-3" /> Duplicada de N° {origenNumero}
          </span>
        )}
      </div>

      {/* Productos faltantes al duplicar */}
      {productosFaltantes.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm text-amber-800 font-medium mb-1">Productos que ya no están en la lista vigente:</p>
          <p className="text-sm text-amber-700">{productosFaltantes.join(', ')}</p>
        </div>
      )}

      {/* Panel de comparación al duplicar */}
      {comparacion && (
        <div className="bg-white rounded-xl shadow-sm border border-blue-200 p-5">
          <h3 className="font-semibold text-blue-800 mb-3">Comparación: cotización original vs. nueva</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-200">
                <th className="text-left py-2 px-2 font-medium text-gray-600">Producto</th>
                <th className="text-right py-2 px-2 font-medium text-gray-600">Precio anterior</th>
                <th className="text-right py-2 px-2 font-medium text-gray-600">Precio nuevo</th>
                <th className="text-right py-2 px-2 font-medium text-gray-600">Diferencia</th>
                <th className="text-right py-2 px-2 font-medium text-gray-600">%</th>
              </tr></thead>
              <tbody>
                {comparacion.lineas.map((c) => (
                  <tr key={c.cod} className={`border-b border-gray-100 ${c.diff > 0 ? 'bg-red-50/40' : c.diff < 0 ? 'bg-emerald-50/40' : ''}`}>
                    <td className="py-2 px-2 text-gray-700">{c.producto}</td>
                    <td className="py-2 px-2 text-right text-gray-500">{formatUSD(c.precioAnt)}</td>
                    <td className="py-2 px-2 text-right text-gray-700 font-medium">{formatUSD(c.precioNuevo)}</td>
                    <td className={`py-2 px-2 text-right font-medium ${c.diff > 0 ? 'text-red-600' : c.diff < 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                      {c.diff > 0 ? '+' : ''}{formatUSD(c.diff)}
                    </td>
                    <td className={`py-2 px-2 text-right font-medium ${c.pct > 0 ? 'text-red-600' : c.pct < 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                      {c.pct > 0 ? '+' : ''}{c.pct.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200">
                  <td className="py-2 px-2 font-medium text-gray-700">Total</td>
                  <td className="py-2 px-2 text-right text-gray-500">{formatUSD(comparacion.totalAnt)}</td>
                  <td className="py-2 px-2 text-right font-bold text-gray-800">{formatUSD(comparacion.totalNuevo)}</td>
                  <td colSpan={2} className={`py-2 px-2 text-right font-medium ${comparacion.totalNuevo > comparacion.totalAnt ? 'text-red-600' : 'text-emerald-600'}`}>
                    {comparacion.totalNuevo > comparacion.totalAnt ? '+' : ''}{formatUSD(comparacion.totalNuevo - comparacion.totalAnt)} ({((comparacion.totalNuevo - comparacion.totalAnt) / (comparacion.totalAnt || 1) * 100).toFixed(1)}%)
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Datos generales */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 lg:p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
            <div className="relative">
              <input type="text" value={clienteBusqueda} disabled={esReadOnly}
                onChange={(e) => { setClienteBusqueda(e.target.value); setClienteSeleccionado(null); if (!e.target.value) setClienteId(''); }}
                placeholder="Buscar cliente..." className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none disabled:bg-gray-50" />
              {clientesFiltrados.length > 0 && !clienteSeleccionado && !esReadOnly && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {clientesFiltrados.map((c) => (
                    <button key={c.id} onClick={() => seleccionarCliente(c)} className="w-full text-left px-3 py-2 hover:bg-emerald-50 text-sm border-b border-gray-100 last:border-0">
                      <span className="font-medium">{c.nombre}</span>{c.zona && <span className="text-gray-400 ml-2">{c.zona}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {!esReadOnly && (
              <button onClick={() => setMostrarNuevoCliente(!mostrarNuevoCliente)} className="text-xs text-emerald-600 hover:text-emerald-700 mt-1 flex items-center gap-1">
                <Plus className="w-3 h-3" /> Cliente nuevo
              </button>
            )}
            {mostrarNuevoCliente && !esReadOnly && (
              <div className="flex gap-2 mt-2">
                <input type="text" value={nuevoClienteNombre} onChange={(e) => setNuevoClienteNombre(e.target.value)} placeholder="Nombre del cliente" className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
                <button onClick={crearClienteRapido} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700">Crear</button>
              </div>
            )}
          </div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label><input type="date" value={fecha} disabled={esReadOnly} onChange={(e) => setFecha(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none disabled:bg-gray-50" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Tipo de cambio ($/USD)</label><input type="text" value={tc} disabled={esReadOnly} onChange={(e) => setTc(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none disabled:bg-gray-50" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">KM destino</label><input type="number" value={km} disabled={esReadOnly} onChange={(e) => setKm(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none disabled:bg-gray-50" />{kmWarning && <p className="text-xs text-red-500 mt-1">Fuera de tabla (máx. 1200 km)</p>}</div>
          
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Vigencia (días)</label><input type="number" value={vigencia} disabled={esReadOnly} onChange={(e) => setVigencia(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none disabled:bg-gray-50" /></div>
          <div className="flex items-end">
            <label className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm w-full ${conIva ? 'border-emerald-400 bg-emerald-50 text-emerald-800' : 'border-gray-300 text-gray-700'} ${esReadOnly ? 'opacity-60' : 'cursor-pointer'}`}>
              <input type="checkbox" checked={conIva} disabled={esReadOnly} onChange={(e) => setConIva(e.target.checked)} className="w-4 h-4 accent-emerald-600" />
              Cotización formal: incluir IVA
            </label>
          </div>
        </div>
      </div>

      {tarifaFaltante && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <span className="text-sm text-red-700">Falta la tarifa de flete. Cargá la tarifa desde Listas o reducí los km.</span>
        </div>
      )}

      {/* Buscador de productos */}
      {!esReadOnly && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar producto por nombre, código, proveedor o familia..." className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none" />
          </div>
          {productosFiltrados.length > 0 && (
            <div className="mt-2 border border-gray-200 rounded-lg max-h-72 overflow-y-auto">
              {productosFiltrados.map((p) => (
                <button key={p.id} onClick={() => agregarProducto(p)} className="w-full text-left px-4 py-2.5 hover:bg-emerald-50 border-b border-gray-100 last:border-0 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1"><p className="text-sm font-medium text-gray-800 truncate">{p.producto}</p><p className="text-xs text-gray-400">{p.cod} · {p.familia} · {p.proveedor}</p></div>
                  <div className="flex items-center gap-2 flex-shrink-0">{p.es_fertilizante && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Fert.</span>}<Plus className="w-4 h-4 text-emerald-600" /></div>
                </button>
              ))}
            </div>
          )}
          <div className="mt-2 flex items-center gap-2">
            <button onClick={() => setShowInsumoManual(!showInsumoManual)} className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 font-medium">
              <Plus className="w-3.5 h-3.5" /> Agregar insumo que no está en la lista
            </button>
          </div>
          {showInsumoManual && (
            <div className="mt-3 border border-blue-200 bg-blue-50/50 rounded-lg p-4 space-y-3">
              <h4 className="text-sm font-semibold text-blue-800">Insumo manual</h4>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Nombre *</label>
                  <input type="text" value={insumoForm.nombre} onChange={(e) => setInsumoForm({ ...insumoForm, nombre: e.target.value })} placeholder="Ej: Flete especial, Serv. técnico..." className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" onKeyDown={(e) => { if (e.key === 'Enter') agregarInsumoManual(); }} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Unidad</label>
                  <input type="text" value={insumoForm.unid} onChange={(e) => setInsumoForm({ ...insumoForm, unid: e.target.value })} placeholder="un, hr, kg..." className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Costo USD *</label>
                  <input type="text" value={insumoForm.costoUSD} onChange={(e) => setInsumoForm({ ...insumoForm, costoUSD: e.target.value })} placeholder="0.00" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" onKeyDown={(e) => { if (e.key === 'Enter') agregarInsumoManual(); }} />
                </div>
              </div>
              <div className="flex items-end justify-between gap-2">
                <div className="flex-1 max-w-48">
                  <label className="block text-xs text-gray-500 mb-1">Familia (opcional)</label>
                  <input type="text" value={insumoForm.familia} onChange={(e) => setInsumoForm({ ...insumoForm, familia: e.target.value })} placeholder="Otros" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" onKeyDown={(e) => { if (e.key === 'Enter') agregarInsumoManual(); }} />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowInsumoManual(false)} className="px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Cancelar</button>
                  <button onClick={agregarInsumoManual} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 flex items-center gap-1"><Plus className="w-4 h-4" /> Agregar</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tabla de líneas */}
      {lineas.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2 font-medium text-gray-600">Producto</th>
                <th className="text-right px-2 py-2 font-medium text-gray-600 whitespace-nowrap">Cant.</th>
                {puedeVerCostos && <th className="text-right px-2 py-2 font-medium text-gray-600 whitespace-nowrap">Costo {lineas.some(l => l.producto.es_fertilizante) ? 'USD/tn' : 'USD'}</th>}
                <th className="text-right px-2 py-2 font-medium text-gray-600 whitespace-nowrap">Margen %</th>
                <th className="text-right px-2 py-2 font-medium text-gray-600 whitespace-nowrap">Precio USD</th>
                <th className="text-center px-2 py-2 font-medium text-gray-600 whitespace-nowrap">Flete</th>
                {conIva && <th className="text-right px-2 py-2 font-medium text-gray-600 whitespace-nowrap">IVA %</th>}
                <th className="text-right px-2 py-2 font-medium text-gray-600 whitespace-nowrap">Total USD</th>
                <th className="px-2 py-2"></th>
              </tr></thead>
              <tbody>
                {lineasCalc.map((l) => (
                  <tr key={l.key} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2"><div className="flex items-center gap-2"><p className="font-medium text-gray-800">{l.producto.producto}</p>{!l.producto.id && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">Manual</span>}</div><p className="text-xs text-gray-400">{l.producto.cod} · {l.producto.familia}</p>{l.producto.es_fertilizante && <span className="text-xs text-amber-600">Por tonelada</span>}</td>
                    <td className="px-2 py-2 text-right"><input type="text" value={l.cantidadStr} disabled={esReadOnly} onChange={(e) => handleCantidadChange(l.key, e.target.value)} className="w-20 px-2 py-1 border border-gray-300 rounded text-right text-sm focus:ring-1 focus:ring-emerald-500 outline-none disabled:bg-gray-50" /><span className="text-xs text-gray-400 ml-1">{l.producto.es_fertilizante ? 'tn' : l.producto.unid}</span></td>
                    {puedeVerCostos && (<td className="px-2 py-2 text-right"><div className="flex items-center gap-1 justify-end"><input type="text" value={l.costoStr} disabled={esReadOnly} onChange={(e) => handleCostoChange(l.key, e.target.value)} className={`w-20 px-2 py-1 border rounded text-right text-sm focus:ring-1 focus:ring-emerald-500 outline-none disabled:bg-gray-50 ${l.costoEditado ? 'border-amber-400 bg-amber-50' : 'border-gray-300 text-gray-500'}`} />{l.costoEditado && !esReadOnly && (<><Pencil className="w-3 h-3 text-amber-500 flex-shrink-0" /><button onClick={() => restablecerCosto(l.key)} className="p-0.5 text-gray-400 hover:text-gray-600" title="Restablecer"><RotateCcw className="w-3 h-3" /></button></>)}</div>{l.costoEditado && <p className="text-xs text-gray-400 mt-0.5">lista: {formatUSD(l.costoListaDisplay)}</p>}{l.margenEfectivo !== null && l.margenEfectivo < 0 && <p className="text-xs text-amber-600 mt-0.5 flex items-center gap-1 justify-end"><AlertTriangle className="w-3 h-3" /> Margen negativo</p>}</td>)}
                    <td className="px-2 py-2 text-right"><input type="text" value={l.margenStr} disabled={esReadOnly} onChange={(e) => handleMargenChange(l.key, e.target.value)} className={`w-16 px-2 py-1 border rounded text-right text-sm focus:ring-1 focus:ring-emerald-500 outline-none disabled:bg-gray-50 ${l.margen !== l.margenOriginal ? 'border-amber-400 bg-amber-50' : 'border-gray-300'}`} /></td>
                    <td className="px-2 py-2 text-right font-medium text-gray-700 whitespace-nowrap">{formatUSD(l.precioUSD)}</td>
                    <td className="px-2 py-2 text-center">{l.producto.es_fertilizante ? (<div className="flex flex-col items-center"><input type="checkbox" checked={l.conFlete} disabled={esReadOnly} onChange={(e) => actualizarLinea(l.key, { conFlete: e.target.checked })} className="w-4 h-4 accent-emerald-600" />{l.conFlete && l.fleteUSD > 0 && <span className="text-xs text-gray-400 whitespace-nowrap">{formatUSD(l.fleteUSD)}</span>}{l.tarifaFaltante && <span className="text-xs text-red-500">Sin tarifa</span>}</div>) : <span className="text-gray-300">—</span>}</td>
                    {conIva && (<td className="px-2 py-2 text-right"><input type="text" inputMode="decimal" value={l.ivaStr} disabled={esReadOnly} aria-label={`IVA % de ${l.producto.producto}`} onChange={(e) => handleIvaChange(l.key, e.target.value)} className="w-14 px-2 py-1 border border-gray-300 rounded text-right text-sm focus:ring-1 focus:ring-emerald-500 outline-none disabled:bg-gray-50" /></td>)}
                    <td className="px-2 py-2 text-right font-semibold text-gray-800 whitespace-nowrap">{formatUSD(l.totalUSD)}</td>
                    <td className="px-2 py-2">{!esReadOnly && <button onClick={() => eliminarLinea(l.key)} className="p-1 text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Resumen y acciones */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
          <textarea value={notas} disabled={esReadOnly} onChange={(e) => setNotas(e.target.value)} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none resize-none disabled:bg-gray-50" placeholder="Observaciones..." />
        </div>
        <div className="bg-gradient-to-br from-emerald-700 to-green-800 rounded-xl shadow-lg p-5 text-white">
          <h3 className="text-sm font-medium text-emerald-100 mb-3">Resumen</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm"><span className="text-emerald-100">Subtotal</span><span className="font-medium">{formatUSD(totales.subtotal)} USD</span></div>
            {conIva && totales.desglose.map((d) => (
              <div key={d.tasa} className="flex justify-between text-sm"><span className="text-emerald-100">IVA {formatInputNumber(d.tasa, 2) || '0'}% <span className="text-emerald-200/70">(s/ {formatUSD(d.base)})</span></span><span className="font-medium">{formatUSD(d.iva)} USD</span></div>
            ))}
            {!conIva && <div className="text-xs text-emerald-200/80">Precios sin IVA</div>}
            <div className="border-t border-emerald-600 pt-2 flex justify-between items-baseline"><span className="text-emerald-100">{conIva ? 'Total USD' : 'Total USD (sin IVA)'}</span><span className="text-2xl font-bold">{formatUSD(totales.total)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-emerald-100">Total ARS</span><span className="font-medium">$ {formatUSD(totales.totalARS, 0)}</span></div>
          </div>
        </div>
      </div>

      {/* Botones */}
      <div className="flex flex-wrap gap-2">
        {!esReadOnly && (
          <button onClick={handleGuardar} disabled={saving || tarifaFaltante || costoZero} className="px-5 py-2.5 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors flex items-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
          </button>
        )}
        <button onClick={handleCopiarWhatsApp} disabled={lineasCalc.length === 0} className="px-5 py-2.5 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 transition-colors flex items-center gap-2 disabled:opacity-50"><Copy className="w-4 h-4" /> WhatsApp</button>
        <button onClick={handleDescargarPDF} disabled={lineasCalc.length === 0} className="px-5 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors flex items-center gap-2 disabled:opacity-50"><FileDown className="w-4 h-4" /> PDF</button>
        <button onClick={handleDescargarExcel} disabled={lineasCalc.length === 0} className="px-5 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors flex items-center gap-2 disabled:opacity-50"><FileSpreadsheet className="w-4 h-4" /> Excel</button>
        {editId && (
          <button onClick={() => setShowHistorial(!showHistorial)} className="px-5 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors flex items-center gap-2">
            <History className="w-4 h-4" /> Historial
          </button>
        )}
        {editId && (
          <button onClick={() => setModalEliminar(true)} className="px-5 py-2.5 bg-white border border-red-300 text-red-600 rounded-lg font-medium hover:bg-red-50 transition-colors flex items-center gap-2">
            <Trash2 className="w-4 h-4" /> Eliminar
          </button>
        )}
      </div>

      {/* Historial de la cotización */}
      {editId && showHistorial && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2"><History className="w-5 h-5 text-gray-400" /> Historial de cambios</h3>
          {historial.length === 0 ? (
            <p className="text-sm text-gray-400">Todavía no hay cambios registrados</p>
          ) : (
            <div className="space-y-2">
              {historial.map((h) => (
                <div key={h.id} className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0">
                  <div className="text-xs text-gray-400 whitespace-nowrap w-32">{formatFechaHora(h.created_at)}</div>
                  <div className="flex-1">
                    <span className="text-sm font-medium text-gray-700">{h.usuario_nombre}</span>
                    {h.campo && <span className="text-sm text-gray-500"> cambió <strong>{h.campo}</strong></span>}
                    {h.valor_anterior && <span className="text-sm text-gray-500"> de <span className="text-gray-600">{h.valor_anterior}</span></span>}
                    {h.valor_nuevo && <span className="text-sm text-gray-500"> a <span className="text-gray-800 font-medium">{h.valor_nuevo}</span></span>}
                    {h.entidad && <span className="text-xs text-gray-400 ml-1">({h.entidad})</span>}
                    {h.detalle && <p className="text-xs text-gray-400 mt-0.5">{h.detalle}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal eliminar */}
      {modalEliminar && editId && editData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setModalEliminar(false)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-800">Eliminar cotización</h3>
                <p className="text-sm text-gray-500">N° {editData.numero} · {editData.cliente_nombre || 'Sin cliente'} · {formatUSD(editData.total_usd)} USD</p>
              </div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">Esta acción no se puede deshacer. Se borrarán la cotización y sus líneas. El registro de que se eliminó queda en el historial.</p>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setModalEliminar(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Cancelar</button>
              <button onClick={async () => {
                await data.deleteCotizacion(editId);
                await registrarCambio({ tipo: 'cotizacion', cotizacion_id: null, entidad: `Cotización N° ${editData.numero}`, campo: 'eliminación', valor_anterior: `N° ${editData.numero}`, valor_nuevo: null, detalle: `Cotización eliminada (${editData.cliente_nombre || 'Sin cliente'} · ${formatUSD(editData.total_usd)} USD)` });
                setModalEliminar(false);
                if (onDeleted) onDeleted();
              }} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {saveMsg && (
        <div className={`fixed bottom-4 right-4 px-5 py-3 rounded-lg shadow-lg flex items-center gap-2 z-50 ${saveMsg.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {saveMsg.type === 'success' ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />}
          {saveMsg.text}
        </div>
      )}
    </div>
  );
}
