import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { elegirConvenio, nombreConvenio } from '@/lib/convenios';
import { useData } from '@/hooks/useData';
import { useAuth } from '@/context/AuthContext';
import { formClienteVacio, validarCliente } from '@/lib/clientes';
import { calcularLinea, calcularTotalesIva, recargoPorcentaje, resolverMargen, toneladasCanje, ivaDeLinea } from '@/lib/calculations';
import { formatUSD, formatDate, formatInputNumber, parseNumberInput } from '@/lib/format';
import { generarPDF, generarExcel, generarWhatsApp } from '@/lib/export';
import { registrarCambio, registrarCambios, fmtMargen, type CambioHistorial } from '@/lib/historial';
import type { ConvenioFlete, TipoCambioBNA, ProductoConCosto, Cliente, CotizacionLinea, Cotizacion, Configuracion, TarifaFlete, HistorialCambio, PedidoPrecio } from '@/types';
import PanelPedidoMesa from '@/components/PanelPedidoMesa';
import { useToast } from '@/components/Toast';
import { costosAplicables, lineasParaPedido, urlPedido, textoWhatsAppPedido, diasValidos } from '@/lib/pedidosPrecio';
import { Search, Plus, Trash2, Save, Copy, FileDown, FileSpreadsheet, Package, Loader2, Check, X, Pencil, RotateCcw, AlertTriangle, Lock, History, Link2, ClipboardList } from 'lucide-react';
import { hoyAR, formatearFechaHora } from '@/lib/fechas';
import { traducirError } from '@/lib/errores';
import { useCargaSegura } from '@/hooks/useCargaSegura';
import ErrorCarga from '@/components/ErrorCarga';
import { ultimaCotizacion, type LineaDeCliente } from '@/lib/historialCliente';

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
  /** Plazo de pago de esta línea en días (0 = contado). */
  plazo: number;
  plazoStr: string;
}

const CULTIVOS = ['Soja', 'Trigo', 'Maíz', 'Girasol', 'Cebada'];

interface LineaComparacion {
  cod: string;
  producto: string;
  precioAnt: number;
  precioNuevo: number;
  diff: number;
  pct: number;
}

export default function NuevaCotizacion({ editId, duplicateFromId, onDeleted, onAbrirGuardada }: { editId?: string; duplicateFromId?: string; onDeleted?: () => void; onAbrirGuardada?: (id: string) => void }) {
  const data = useData();
  const { usuario } = useAuth();
  const toast = useToast();

  const [config, setConfig] = useState<Configuracion | null>(null);
  const [productos, setProductos] = useState<ProductoConCosto[]>([]);
  // Convenio de flete: cada uno tiene su planilla; la cotización guarda con cuál se calculó
  const [convenios, setConvenios] = useState<ConvenioFlete[]>([]);
  const [convenioId, setConvenioId] = useState<string | null>(null);
  const convenio = useMemo(() => elegirConvenio(convenios, convenioId), [convenios, convenioId]);
  const tarifas = useMemo<TarifaFlete[]>(() => convenio?.tarifas ?? [], [convenio]);
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
  // TC sugerido: dólar divisa BNA vendedor. Si el vendedor lo cambia a mano, no se pisa.
  const [tcBna, setTcBna] = useState<TipoCambioBNA | null>(null);
  const tcTocadoRef = useRef(false);
  const [km, setKm] = useState('');
  const [vigencia, setVigencia] = useState('');
  const [conIva, setConIva] = useState(false);
  // Condiciones de pago: plazo (0 = contado) con tasa mensual, y canje por granos
  const [plazo, setPlazo] = useState('0');
  const [tasaMensual, setTasaMensual] = useState('');
  /** Lo que se le cotizó antes a este cliente, para mostrar "la última vez" en cada producto. */
  const [historialCliente, setHistorialCliente] = useState<LineaDeCliente[]>([]);
  const [conCanje, setConCanje] = useState(false);
  const [canjeCultivo, setCanjeCultivo] = useState('Soja');
  const [canjeOtro, setCanjeOtro] = useState('');
  const [canjePrecio, setCanjePrecio] = useState('');
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
  // Pedido de precios a la mesa de insumos
  const [pedido, setPedido] = useState<PedidoPrecio | null>(null);
  const [pedidoPorMarcar, setPedidoPorMarcar] = useState<string | null>(null);
  const [showPedirMesa, setShowPedirMesa] = useState(false);
  const [pedidoForm, setPedidoForm] = useState({ dias: '3', auto: false, nota: '' });
  const [pedidoLink, setPedidoLink] = useState<{ url: string; texto: string } | null>(null);
  const [creandoPedido, setCreandoPedido] = useState(false);
  const [idGuardadoNuevo, setIdGuardadoNuevo] = useState<string | null>(null);
  const autoAplicadoRef = useRef<string | null>(null);
  const [insumoForm, setInsumoForm] = useState({ nombre: '', unid: 'un', costoUSD: '', familia: '' });

  const esReadOnly = editData?.estado === 'Ganada' || editData?.estado === 'Perdida';

  function cargarCanje(cotiz: Cotizacion) {
    const hay = (cotiz.canje_precio_usd || 0) > 0 || !!cotiz.canje_cultivo;
    setConCanje(hay);
    const cult = cotiz.canje_cultivo || 'Soja';
    if (CULTIVOS.includes(cult)) { setCanjeCultivo(cult); setCanjeOtro(''); }
    else { setCanjeCultivo('Otro'); setCanjeOtro(cult); }
    setCanjePrecio(formatInputNumber(cotiz.canje_precio_usd || 0, 2));
  }

  const cargar = useCallback(async () => {
    const [cfg, lista, convs, cls] = await Promise.all([
      data.fetchConfig(),
      data.fetchListaVigente(),
      data.fetchConvenios(),
      data.fetchClientes(),
    ]);
    setConvenios(convs);
    // Nueva: el predeterminado. Editar / Recotizar: el de la cotización (si se borró, el predeterminado)
    let convSel = elegirConvenio(convs, null)?.id ?? null;
    const conConvenio = editId || duplicateFromId ? await data.fetchCotizacion((editId || duplicateFromId)!) : null;
    if (conConvenio?.convenio_flete_id) convSel = elegirConvenio(convs, conConvenio.convenio_flete_id)?.id ?? convSel;
    setConvenioId(convSel);
    const tars = elegirConvenio(convs, convSel)?.tarifas ?? [];
    setConfig(cfg);
    setTc(String(cfg.tipo_cambio_default));
    tcTocadoRef.current = false;
    // Cotización nueva o Recotizar: se usa el TC del BNA de hoy (sin frenar la carga de la pantalla)
    void data.fetchTipoCambioBNA().then((bna) => {
      setTcBna(bna);
      if (bna && !editId && !tcTocadoRef.current) setTc(String(bna.venta));
    });
    setVigencia(String(cfg.vigencia_default));
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
        setPlazo(String(cotiz.plazo_dias || 0));
        setTasaMensual(formatInputNumber(cotiz.tasa_mensual || 0, 2));
        cargarCanje(cotiz);
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
            plazo: l.plazo_dias ?? cotiz.plazo_dias ?? 0,
            plazoStr: String(l.plazo_dias ?? cotiz.plazo_dias ?? 0),
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
        setPlazo(String(cotiz.plazo_dias || 0));
        setTasaMensual(formatInputNumber(cotiz.tasa_mensual || 0, 2));
        cargarCanje(cotiz);
        setNotas(cotiz.notas || '');
        // Recotizar: se mantiene el TC viejo solo hasta que llegue el del BNA de hoy
        if (!tcTocadoRef.current) setTc((actual) => (actual && actual !== String(cfg.tipo_cambio_default) ? actual : String(cotiz.tc)));
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
            plazo: l.plazo_dias ?? cotiz.plazo_dias ?? 0,
            plazoStr: String(l.plazo_dias ?? cotiz.plazo_dias ?? 0),
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
  const kmMaxTarifa = tarifas.length ? tarifas[tarifas.length - 1].km : 0;
  useEffect(() => { setKmWarning(kmMaxTarifa > 0 && kmNum > kmMaxTarifa); }, [kmNum, kmMaxTarifa]);

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
  /** Plazo por defecto (botones rápidos): se aplica a las líneas nuevas y a todas al tocarlo. */
  const plazoNum = Math.max(0, parseInt(plazo) || 0);

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

  useEffect(() => {
    let vivo = true;
    if (!clienteId) { setHistorialCliente([]); return; }
    data.fetchLineasDeCliente(clienteId)
      .then((ls) => { if (vivo) setHistorialCliente(ls); })
      .catch((e) => console.error('No se pudo cargar el historial del cliente:', e));
    return () => { vivo = false; };
  }, [clienteId]);

  const tasaNum = parseNumberInput(tasaMensual);
  /** Líneas con su financiación: cada una con su propio plazo (0 = contado). */
  const lineasFin = useMemo(() => lineasCalc.map((l) => {
    const recargoPct = recargoPorcentaje(l.plazo, tasaNum);
    return { ...l, recargoPct, totalFinanciado: l.totalUSD * (1 + recargoPct / 100) };
  }), [lineasCalc, tasaNum]);

  const canjePrecioNum = parseNumberInput(canjePrecio);
  const canjeNombre = canjeCultivo === 'Otro' ? canjeOtro.trim() : canjeCultivo;

  const totales = useMemo(() => {
    return calcularTotalesIva(lineasFin.map((l) => ({ totalUSD: l.totalUSD, ivaPercent: conIva ? l.iva : 0, recargoPct: l.recargoPct })), tcNum);
  }, [lineasFin, tcNum, conIva]);
  const plazoMax = lineas.reduce((m, l) => Math.max(m, l.plazo), 0);
  const hayFinanciado = plazoMax > 0;
  const canjeTn = conCanje ? toneladasCanje(totales.total, canjePrecioNum) : 0;

  const tarifaFaltante = lineasCalc.some((l) => l.tarifaFaltante);
  // Flete tildado pero sin km: antes el flete quedaba en 0 sin avisar
  const kmFaltante = kmNum <= 0 && lineasCalc.some((l) => l.producto.es_fertilizante && l.conFlete);
  /** Hay productos sin costo (a confirmar con la mesa de insumos): se puede guardar, pero no enviar al cliente. */
  const costoPendiente = lineasCalc.some((l) => l.costoUSD <= 0);

  function agregarProducto(producto: ProductoConCosto) {
    if (esReadOnly) return;
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
      plazo: plazoNum, plazoStr: String(plazoNum),
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
    if (costo < 0) { setSaveMsg({ type: 'error', text: 'El costo no puede ser negativo' }); setTimeout(() => setSaveMsg(null), 3000); return; }
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
      costoOverrideUSD: null, costoStr: costo > 0 ? formatInputNumber(costo, 2) : '',
      iva: ivaSugerido(false), ivaStr: formatInputNumber(ivaSugerido(false), 2),
      plazo: plazoNum, plazoStr: String(plazoNum),
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
  function aplicarPlazoATodas(d: number) {
    if (esReadOnly) return;
    setPlazo(String(d));
    setLineas((ls) => ls.map((l) => ({ ...l, plazo: d, plazoStr: String(d) })));
  }
  function handlePlazoChange(key: string, value: string) {
    const n = Math.max(0, parseInt(value) || 0);
    actualizarLinea(key, { plazoStr: value, plazo: n });
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
    const v = validarCliente({ ...formClienteVacio(usuario.id), nombre: nuevoClienteNombre });
    if (!v.ok) return;
    const nuevo = await data.createCliente(v.datos);
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
      total_usd: l.totalUSD, con_flete: l.conFlete, iva: l.iva, plazo_dias: l.plazo,
    }));
  }

  function buildCotizData(): Partial<Cotizacion> {
    return {
      cliente_id: clienteId, cliente_nombre: clienteBusqueda, fecha, tc: tcNum,
      km: kmNum, convenio_flete_id: convenio?.id ?? null, con_iva: conIva, iva: conIva ? totales.ivaEfectivo : 0, vigencia_dias: parseInt(vigencia) || 15,
      estado: editData?.estado || 'Borrador', vendedor: null,
      lista_id: listaIdRef.current, subtotal_usd: totales.subtotal, recargo_usd: totales.recargo, iva_usd: totales.iva,
      plazo_dias: plazoMax, tasa_mensual: hayFinanciado ? tasaNum : 0,
      canje_cultivo: conCanje ? canjeNombre : null, canje_precio_usd: conCanje ? canjePrecioNum : 0,
      total_usd: totales.total, total_ars: totales.totalARS, notas,
      ...(origenId && !editId ? { cotizacion_origen_id: origenId } : {}),
    };
  }

  async function handleGuardar(opts?: { mantener?: boolean }): Promise<Cotizacion | null> {
    setSaving(true);
    setSaveMsg(null);

    if (!clienteId || !clienteBusqueda) { setSaveMsg({ type: 'error', text: 'Seleccioná un cliente' }); setSaving(false); return null; }
    if (!tcNum || tcNum <= 0) { setSaveMsg({ type: 'error', text: 'El tipo de cambio es obligatorio' }); setSaving(false); return null; }
    if (lineas.length === 0) { setSaveMsg({ type: 'error', text: 'Agregá al menos una línea' }); setSaving(false); return null; }
    if (conCanje && (!canjeNombre || canjePrecioNum <= 0)) { setSaveMsg({ type: 'error', text: 'Para el canje cargá el cultivo y el precio del grano (USD/tn), o destildá el canje.' }); setSaving(false); return null; }
    if (kmFaltante) { setSaveMsg({ type: 'error', text: 'Hay fertilizantes con flete tildado pero no cargaste los km de destino. Cargá los km o destildá el flete.' }); setSaving(false); return null; }
    if (tarifaFaltante) { setSaveMsg({ type: 'error', text: 'Falta tarifa de flete. No se puede guardar.' }); setSaving(false); return null; }

    // If editing, compare with previous lines for historial
    const cambiosHist: CambioHistorial[] = [];
    if (editId && editData) {
      const prevLineas = await data.fetchLineas(editId).catch((e) => {
        setSaveMsg({ type: 'error', text: `No se pudo leer la cotización actual. ${traducirError(e)}` });
        return null;
      });
      if (!prevLineas) { setSaving(false); return null; }
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
          const plazoPrev = prev.plazo_dias ?? editData.plazo_dias ?? 0;
          if (plazoPrev !== l.plazo) cambiosHist.push({ tipo: 'linea', cotizacion_id: editId, entidad: `Producto ${l.producto.cod}`, campo: 'plazo de pago', valor_anterior: plazoPrev ? `${plazoPrev} días` : 'Contado', valor_nuevo: l.plazo ? `${l.plazo} días` : 'Contado' });
          const ivaPrev = ivaDeLinea(prev, editData, config!);
          if (conIva && editData.con_iva && ivaPrev !== l.iva) cambiosHist.push({ tipo: 'linea', cotizacion_id: editId, entidad: `Producto ${l.producto.cod}`, campo: 'IVA', valor_anterior: `${ivaPrev}%`, valor_nuevo: `${l.iva}%` });
          if (Math.abs(prev.precio_usd - l.precioUSD) > 0.01) cambiosHist.push({ tipo: 'linea', cotizacion_id: editId, entidad: `Producto ${l.producto.cod}`, campo: 'precio', valor_anterior: `USD ${formatUSD(prev.precio_usd)}`, valor_nuevo: `USD ${formatUSD(l.precioUSD)}` });
        }
      }

      // Header changes
      if (!!editData.con_iva !== conIva) cambiosHist.push({ tipo: 'cotizacion', cotizacion_id: editId, campo: 'IVA', valor_anterior: editData.con_iva ? 'Con IVA' : 'Sin IVA', valor_nuevo: conIva ? 'Con IVA' : 'Sin IVA' });
      if (hayFinanciado && (editData.tasa_mensual || 0) !== tasaNum) cambiosHist.push({ tipo: 'cotizacion', cotizacion_id: editId, campo: 'tasa mensual', valor_anterior: `${editData.tasa_mensual || 0}%`, valor_nuevo: `${tasaNum}%` });
      if ((editData.canje_precio_usd || 0) !== (conCanje ? canjePrecioNum : 0)) cambiosHist.push({ tipo: 'cotizacion', cotizacion_id: editId, campo: 'canje', valor_anterior: editData.canje_precio_usd ? `${editData.canje_cultivo} a USD ${formatUSD(editData.canje_precio_usd)}/tn` : 'Sin canje', valor_nuevo: conCanje ? `${canjeNombre} a USD ${formatUSD(canjePrecioNum)}/tn` : 'Sin canje' });
      if ((editData.convenio_flete_id ?? null) !== (convenio?.id ?? null) && editData.convenio_flete_id !== undefined) {
        const ant = convenios.find((c) => c.id === editData.convenio_flete_id);
        cambiosHist.push({ tipo: 'cotizacion', cotizacion_id: editId, campo: 'convenio de flete', valor_anterior: ant ? String(ant.numero) : 'predeterminado', valor_nuevo: convenio ? String(convenio.numero) : null });
      }
      if (editData.tc !== tcNum) cambiosHist.push({ tipo: 'cotizacion', cotizacion_id: editId, campo: 'tipo de cambio', valor_anterior: String(editData.tc), valor_nuevo: String(tcNum) });
      if (editData.km !== kmNum) cambiosHist.push({ tipo: 'cotizacion', cotizacion_id: editId, campo: 'km', valor_anterior: String(editData.km), valor_nuevo: String(kmNum) });
      if (editData.cliente_nombre !== clienteBusqueda) cambiosHist.push({ tipo: 'cotizacion', cotizacion_id: editId, campo: 'cliente', valor_anterior: editData.cliente_nombre || '', valor_nuevo: clienteBusqueda });
      if (editData.vigencia_dias !== (parseInt(vigencia) || 15)) cambiosHist.push({ tipo: 'cotizacion', cotizacion_id: editId, campo: 'vigencia', valor_anterior: `${editData.vigencia_dias} días`, valor_nuevo: `${parseInt(vigencia) || 15} días` });
    }

    try {
      const saved = await data.saveCotizacion(buildCotizData(), buildLineasData(), editId);
      setSaveMsg({ type: 'success', text: `Cotización N° ${saved.numero} guardada` });
      setEditData(saved);
      if (pedidoPorMarcar) {
        try { await data.marcarPedidoAplicado(pedidoPorMarcar); setPedidoPorMarcar(null); setPedido(await data.fetchPedidoDeCotizacion(saved.id)); }
        catch (e) { console.error('No se pudo marcar el pedido como aplicado:', e); }
      }

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

      if (!editId && !opts?.mantener) {
        setTimeout(() => {
          setLineas([]); setClienteId(''); setClienteBusqueda(''); setClienteSeleccionado(null);
          setNotas(''); setSaveMsg(null); setOrigenId(null); setOrigenNumero(null);
          setComparacion(null); setProductosFaltantes([]);
          setPlazo('0'); setTasaMensual(''); setConCanje(false); setCanjePrecio('');
        }, 2000);
      }
      return saved;
    } catch (e) {
      // La cotización NO se guardó (la operación es atómica): lo que está en pantalla sigue intacto.
      setSaveMsg({ type: 'error', text: `No se pudo guardar la cotización. ${traducirError(e)}` });
      return null;
    } finally {
      setSaving(false);
    }
  }


  // ============ Pedido de precios a la mesa de insumos ============
  const recargarPedido = useCallback(async (id?: string) => {
    const cid = id ?? editId;
    if (!cid) { setPedido(null); return; }
    try { setPedido(await data.fetchPedidoDeCotizacion(cid)); }
    catch (e) { console.error('No se pudo leer el pedido a la mesa de insumos:', e); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);
  useEffect(() => { void recargarPedido(); }, [recargarPedido]);

  /** Vuelca en las líneas los costos que cargó la mesa. No guarda: el usuario revisa y guarda. */
  function aplicarCostosMesa(auto = false) {
    if (!pedido?.lineas || esReadOnly) return;
    const { aplicar, sinCosto } = costosAplicables(pedido.lineas, lineas.map((l) => ({ key: l.key, cod: l.producto.cod })));
    if (aplicar.length === 0) { toast.aviso('Ningún producto de la cotización coincide con los costos de la mesa.'); return; }
    const porKey = new Map(aplicar.map((a) => [a.key, a]));
    setLineas((ls) => ls.map((l) => {
      const a = porKey.get(l.key);
      if (!a) return l;
      return { ...l, costoOverrideUSD: a.costo, costoStr: formatInputNumber(a.costo, 2), producto: a.proveedor ? { ...l.producto, proveedor: a.proveedor } : l.producto };
    }));
    setPedidoPorMarcar(pedido.id);
    toast.exito(`${auto ? 'La mesa cargó los costos y se aplicaron solos' : 'Costos aplicados'} (${aplicar.length} producto${aplicar.length === 1 ? '' : 's'}). Revisá margen y flete y guardá.`);
    if (sinCosto.length > 0) toast.aviso(`${sinCosto.length} producto${sinCosto.length === 1 ? '' : 's'} de la cotización no tienen costo de la mesa.`);
  }

  // Modo automático: al abrir la cotización con costos nuevos de la mesa, se aplican solos (una sola vez por respuesta)
  useEffect(() => {
    if (!pedido || pedido.estado !== 'Respondido' || !pedido.auto_aplicar || pedido.aplicado_at || esReadOnly || lineas.length === 0) return;
    const marca = `${pedido.id}|${pedido.respondido_at}`;
    if (autoAplicadoRef.current === marca) return;
    autoAplicadoRef.current = marca;
    aplicarCostosMesa(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido, lineas.length, esReadOnly]);

  async function crearPedidoMesa() {
    const dias = parseInt(pedidoForm.dias);
    if (!diasValidos(dias)) { toast.aviso('Poné entre 1 y 60 días de vigencia del link.'); return; }
    setCreandoPedido(true);
    try {
      // Primero se guarda la cotización para que el pedido quede atado a ella y a sus productos actuales
      const saved = await handleGuardar({ mantener: true });
      if (!saved) return;
      if (!editId) setIdGuardadoNuevo(saved.id);
      const lins = lineasParaPedido(lineasCalc.map((l) => ({ cod: l.producto.cod, producto: l.producto.producto || l.producto.cod, unid: l.producto.unid || '', es_fertilizante: l.producto.es_fertilizante, cantidad: l.cantidad })));
      const token = await data.crearPedidoPrecio({ cotizacion_id: saved.id, dias, auto_aplicar: pedidoForm.auto, nota: pedidoForm.nota.trim(), lineas: lins });
      const url = urlPedido(window.location.origin, token);
      setPedidoLink({ url, texto: textoWhatsAppPedido({ url, numero: saved.numero, cliente: clienteBusqueda, venceEl: new Date(Date.now() + dias * 86400000).toISOString(), nota: pedidoForm.nota }) });
      await registrarCambio({ tipo: 'cotizacion', cotizacion_id: saved.id, detalle: `Pidió precios a la mesa de insumos (link por ${dias} día${dias === 1 ? '' : 's'})` });
      await recargarPedido(saved.id);
    } catch (e) {
      toast.error(e);
    } finally {
      setCreandoPedido(false);
    }
  }

  function cerrarModalPedido() {
    setShowPedirMesa(false);
    setPedidoLink(null);
    // Una cotización nueva ya quedó guardada: se abre en modo edición para no duplicarla al volver a guardar
    if (idGuardadoNuevo && onAbrirGuardada) onAbrirGuardada(idGuardadoNuevo);
    setIdGuardadoNuevo(null);
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
      total_usd: l.totalUSD, con_flete: l.conFlete, iva: l.iva, plazo_dias: l.plazo, orden: i,
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
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Tipo de cambio ($/USD)</label><input type="text" inputMode="decimal" value={tc} disabled={esReadOnly} onChange={(e) => { tcTocadoRef.current = true; setTc(e.target.value); }} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none disabled:bg-gray-50" />
            {tcBna && (
              <p title="Dólar divisa BNA, vendedor" className={`text-xs mt-1 ${tcBna.desactualizado ? 'text-amber-700' : 'text-gray-500'}`}>
                BNA divisa {formatDate(tcBna.fecha).slice(0, 5)}: <span className="whitespace-nowrap">$ {formatUSD(tcBna.venta, 2)}</span>{tcBna.desactualizado && ' (no se pudo actualizar)'}
                {!esReadOnly && Math.abs(tcNum - tcBna.venta) > 0.004 && (
                  <button type="button" onClick={() => { tcTocadoRef.current = false; setTc(String(tcBna.venta)); }} className="ml-1.5 font-medium text-emerald-700 hover:text-emerald-800 underline">Usar</button>
                )}
              </p>
            )}
          </div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">KM destino</label><input type="number" value={km} disabled={esReadOnly} onChange={(e) => setKm(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none disabled:bg-gray-50" />{kmWarning && <p className="text-xs text-red-500 mt-1">Fuera de la planilla del convenio (máx. {kmMaxTarifa} km)</p>}</div>
          <div><label htmlFor="cotiz-convenio" className="block text-sm font-medium text-gray-700 mb-1">Convenio de flete</label>
            <select id="cotiz-convenio" value={convenio?.id ?? ''} disabled={esReadOnly || convenios.length === 0} onChange={(e) => setConvenioId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none disabled:bg-gray-50 bg-white">
              {convenios.length === 0 && <option value="">Sin convenios cargados</option>}
              {convenios.map((c) => <option key={c.id} value={c.id}>{nombreConvenio(c)}{c.predeterminado ? ' (predet.)' : ''}</option>)}
            </select>
          </div>

          
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Vigencia (días)</label><input type="number" value={vigencia} disabled={esReadOnly} onChange={(e) => setVigencia(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none disabled:bg-gray-50" /></div>
          <div className="flex items-end">
            <label className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm w-full ${conIva ? 'border-emerald-400 bg-emerald-50 text-emerald-800' : 'border-gray-300 text-gray-700'} ${esReadOnly ? 'opacity-60' : 'cursor-pointer'}`}>
              <input type="checkbox" checked={conIva} disabled={esReadOnly} onChange={(e) => setConIva(e.target.checked)} className="w-4 h-4 accent-emerald-600" />
              Incluir IVA
            </label>
          </div>
        </div>
      </div>

      {/* Condiciones de pago: financiación y canje */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Condiciones de pago</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Plazo de pago <span className="font-normal text-gray-400">(se aplica a todas las filas; después podés cambiarlo fila por fila)</span></label>
            <div className="flex flex-wrap items-center gap-2">
              {[0, 30, 60, 90].map((d) => {
                const activo = lineas.length > 0 ? lineas.every((l) => l.plazo === d) : plazoNum === d;
                return (
                  <button key={d} type="button" disabled={esReadOnly} onClick={() => aplicarPlazoATodas(d)}
                    className={`px-3 py-1.5 rounded-lg text-sm border disabled:opacity-60 ${activo ? 'bg-emerald-600 text-white border-emerald-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                    {d === 0 ? 'Contado' : `${d} días`}
                  </button>
                );
              })}
            </div>
            {(hayFinanciado || plazoNum > 0) && (
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <label htmlFor="tasa-mensual" className="text-sm text-gray-600">Tasa mensual</label>
                <input id="tasa-mensual" type="text" inputMode="decimal" value={tasaMensual} disabled={esReadOnly} onChange={(e) => setTasaMensual(e.target.value)} placeholder="0"
                  className="w-20 px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-right outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-50" />
                <span className="text-xs text-gray-400">%</span>
                <span className="text-xs text-gray-500">{tasaNum > 0 ? 'el recargo se calcula por fila según sus días' : 'cargá la tasa para calcular el recargo'}</span>
              </div>
            )}
          </div>
          <div>
            <label className={`flex items-center gap-2 text-sm font-medium text-gray-700 mb-1 ${esReadOnly ? 'opacity-60' : 'cursor-pointer'}`}>
              <input type="checkbox" checked={conCanje} disabled={esReadOnly} onChange={(e) => setConCanje(e.target.checked)} className="w-4 h-4 accent-emerald-600" />
              Pago en granos (canje)
            </label>
            {conCanje && (
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <select value={canjeCultivo} disabled={esReadOnly} onChange={(e) => setCanjeCultivo(e.target.value)} aria-label="Cultivo"
                  className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-50">
                  {CULTIVOS.map((c) => <option key={c} value={c}>{c}</option>)}
                  <option value="Otro">Otro</option>
                </select>
                {canjeCultivo === 'Otro' && (
                  <input type="text" value={canjeOtro} disabled={esReadOnly} onChange={(e) => setCanjeOtro(e.target.value)} placeholder="Cultivo" aria-label="Otro cultivo"
                    className="w-28 px-2 py-1.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-50" />
                )}
                <span className="text-sm text-gray-600">a USD</span>
                <input type="text" inputMode="decimal" value={canjePrecio} disabled={esReadOnly} onChange={(e) => setCanjePrecio(e.target.value)} placeholder="0,00" aria-label="Precio del grano en USD por tonelada"
                  className="w-24 px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-right outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-50" />
                <span className="text-xs text-gray-400">/tn</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {kmFaltante && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <span className="text-sm text-amber-800">Hay fertilizantes con flete tildado y falta cargar los <strong>km de destino</strong>: por eso el flete no se está sumando.</span>
        </div>
      )}

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
                <th className="text-right px-2 py-2 font-medium text-gray-600 whitespace-nowrap">Costo {lineas.some(l => l.producto.es_fertilizante) ? 'USD/tn' : 'USD'}</th>
                <th className="text-right px-2 py-2 font-medium text-gray-600 whitespace-nowrap">Margen %</th>
                <th className="text-right px-2 py-2 font-medium text-gray-600 whitespace-nowrap">Precio USD</th>
                <th className="text-center px-2 py-2 font-medium text-gray-600 whitespace-nowrap">Flete</th>
                <th className="text-right px-2 py-2 font-medium text-gray-600 whitespace-nowrap">Plazo (días)</th>
                {conIva && <th className="text-right px-2 py-2 font-medium text-gray-600 whitespace-nowrap">IVA %</th>}
                <th className="text-right px-2 py-2 font-medium text-gray-600 whitespace-nowrap">Total USD</th>
                <th className="px-2 py-2"></th>
              </tr></thead>
              <tbody>
                {lineasFin.map((l) => (
                  <tr key={l.key} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2"><div className="flex items-center gap-2"><p className="font-medium text-gray-800">{l.producto.producto}</p>{!l.producto.id && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">Manual</span>}</div><p className="text-xs text-gray-400">{l.producto.cod} · {l.producto.familia}</p>{(() => {
                      const u = ultimaCotizacion(historialCliente, l.producto.cod, editId);
                      if (!u) return null;
                      const dif = u.precio > 0 ? ((l.precioUSD - u.precio) / u.precio) * 100 : 0;
                      return (
                        <p className="text-xs text-gray-500 mt-0.5">
                          Última vez: USD {formatUSD(u.precio)} (N° {u.numero}, {formatDate(u.fecha)}, {u.estado.toLowerCase()})
                          {Math.abs(dif) >= 0.5 && <span className={dif > 0 ? 'text-red-700 font-medium' : 'text-emerald-700 font-medium'}> {dif > 0 ? 'Ahora +' : 'Ahora '}{formatUSD(dif, 1)}%</span>}
                        </p>
                      );
                    })()}{l.producto.es_fertilizante && <span className="text-xs text-amber-600">Por tonelada</span>}{l.costoUSD <= 0 && <span className="block text-xs font-semibold text-red-600">Costo pendiente</span>}</td>
                    <td className="px-2 py-2 text-right"><input type="text" value={l.cantidadStr} disabled={esReadOnly} onChange={(e) => handleCantidadChange(l.key, e.target.value)} className="w-20 px-2 py-1 border border-gray-300 rounded text-right text-sm focus:ring-1 focus:ring-emerald-500 outline-none disabled:bg-gray-50" /><span className="text-xs text-gray-400 ml-1">{l.producto.es_fertilizante ? 'tn' : l.producto.unid}</span></td>
                    <td className="px-2 py-2 text-right"><div className="flex items-center gap-1 justify-end"><input type="text" value={l.costoStr} disabled={esReadOnly} onChange={(e) => handleCostoChange(l.key, e.target.value)} className={`w-20 px-2 py-1 border rounded text-right text-sm focus:ring-1 focus:ring-emerald-500 outline-none disabled:bg-gray-50 ${l.costoEditado ? 'border-amber-400 bg-amber-50' : 'border-gray-300 text-gray-500'}`} />{l.costoEditado && !esReadOnly && (<><Pencil className="w-3 h-3 text-amber-500 flex-shrink-0" /><button onClick={() => restablecerCosto(l.key)} className="p-0.5 text-gray-400 hover:text-gray-600" title="Restablecer"><RotateCcw className="w-3 h-3" /></button></>)}</div>{l.costoEditado && <p className="text-xs text-gray-400 mt-0.5">lista: {formatUSD(l.costoListaDisplay)}</p>}</td>
                    <td className="px-2 py-2 text-right"><input type="text" value={l.margenStr} disabled={esReadOnly} onChange={(e) => handleMargenChange(l.key, e.target.value)} className={`w-16 px-2 py-1 border rounded text-right text-sm focus:ring-1 focus:ring-emerald-500 outline-none disabled:bg-gray-50 ${l.margen !== l.margenOriginal ? 'border-amber-400 bg-amber-50' : 'border-gray-300'}`} /></td>
                    <td className="px-2 py-2 text-right font-medium text-gray-700 whitespace-nowrap">{formatUSD(l.precioUSD)}{l.conFlete && l.fleteUSD > 0 && <span className="block text-xs font-normal text-gray-400">+ flete {formatUSD(l.fleteUSD)}</span>}</td>
                    <td className="px-2 py-2 text-center">{l.producto.es_fertilizante ? (<div className="flex flex-col items-center"><input type="checkbox" checked={l.conFlete} disabled={esReadOnly} onChange={(e) => actualizarLinea(l.key, { conFlete: e.target.checked })} className="w-4 h-4 accent-emerald-600" />{l.conFlete && l.fleteUSD > 0 && <span className="text-xs text-gray-400 whitespace-nowrap">{formatUSD(l.fleteUSD)}</span>}{l.conFlete && kmNum <= 0 && <span className="text-xs text-amber-600 whitespace-nowrap">Falta km</span>}{l.tarifaFaltante && <span className="text-xs text-red-500">Sin tarifa</span>}</div>) : <span className="text-gray-300">—</span>}</td>
                    <td className="px-2 py-2 text-right"><input type="text" inputMode="numeric" value={l.plazoStr} disabled={esReadOnly} aria-label={`Plazo en días de ${l.producto.producto}`} onChange={(e) => handlePlazoChange(l.key, e.target.value)} className={`w-14 px-2 py-1 border rounded text-right text-sm focus:ring-1 focus:ring-emerald-500 outline-none disabled:bg-gray-50 ${l.plazo > 0 ? 'border-emerald-400 bg-emerald-50' : 'border-gray-300'}`} />{l.plazo === 0 && <span className="block text-xs text-gray-400">contado</span>}</td>
                    {conIva && (<td className="px-2 py-2 text-right"><input type="text" inputMode="decimal" value={l.ivaStr} disabled={esReadOnly} aria-label={`IVA % de ${l.producto.producto}`} onChange={(e) => handleIvaChange(l.key, e.target.value)} className="w-14 px-2 py-1 border border-gray-300 rounded text-right text-sm focus:ring-1 focus:ring-emerald-500 outline-none disabled:bg-gray-50" /></td>)}
                    <td className="px-2 py-2 text-right font-semibold text-gray-800 whitespace-nowrap">{formatUSD(l.totalFinanciado)}{l.recargoPct > 0 && <span className="block text-xs font-normal text-gray-400">contado {formatUSD(l.totalUSD)} · +{formatInputNumber(l.recargoPct, 2)}%</span>}</td>
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
        <div className="bg-emerald-900 rounded-xl p-5 text-white">
          <p className="text-emerald-200 text-sm">{conIva ? 'Total con IVA' : 'Total sin IVA'}</p>
          <p className="cifra text-6xl mt-1">
            {formatUSD(totales.total)}
            <span className="text-2xl font-semibold text-amber-300 ml-2">USD</span>
          </p>
          <p className="text-emerald-200 text-sm mt-2">$ {formatUSD(totales.totalARS, 0)} al tipo de cambio de la cotización</p>
          {conCanje && canjePrecioNum > 0 && (
            <div className="mt-3 bg-amber-400 text-emerald-950 rounded-lg px-3 py-2 flex items-baseline justify-between gap-3">
              <span className="text-sm">Equivale a {canjeNombre || 'grano'} a USD {formatUSD(canjePrecioNum)}/tn</span>
              <span className="cifra text-2xl">{formatUSD(canjeTn)} tn</span>
            </div>
          )}
          <div className="mt-4 pt-3 border-t border-emerald-700 space-y-1.5 text-sm text-emerald-100">
            <div className="flex justify-between"><span>{totales.recargo > 0 ? 'Subtotal contado' : 'Subtotal'}</span><span>{formatUSD(totales.subtotal)}</span></div>
            {totales.recargo > 0 && <div className="flex justify-between"><span>Financiación, según el plazo de cada fila</span><span>{formatUSD(totales.recargo)}</span></div>}
            {conIva && totales.desglose.map((d) => (
              <div key={d.tasa} className="flex justify-between"><span>IVA {formatInputNumber(d.tasa, 2) || '0'}% sobre {formatUSD(d.base)}</span><span>{formatUSD(d.iva)}</span></div>
            ))}
          </div>
        </div>
      </div>

      {/* Costos pendientes y pedido a la mesa de insumos */}
      {costoPendiente && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800">Hay productos con <strong>costo pendiente</strong>. Podés guardar la cotización, pero no descargar el PDF/Excel ni copiar el texto de WhatsApp hasta completarlos{!esReadOnly && ' (a mano en la columna Costo, o pidiéndolos a la mesa de insumos)'}.</p>
        </div>
      )}
      {pedidoPorMarcar && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 text-sm text-amber-900">Aplicaste los costos de la mesa: <strong>guardá la cotización</strong> para confirmarlos.</div>
      )}
      {pedido && pedido.estado !== 'Cancelado' && (
        <PanelPedidoMesa pedido={pedido} onAplicar={esReadOnly ? undefined : () => aplicarCostosMesa()} onCambio={() => void recargarPedido()} numero={editData?.numero} cliente={clienteBusqueda} />
      )}

      {/* Botones */}
      <div className="flex flex-wrap gap-2">
        {!esReadOnly && (
          <button onClick={() => void handleGuardar()} disabled={saving || tarifaFaltante || kmFaltante} className="px-5 py-2.5 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors flex items-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
          </button>
        )}
        {!esReadOnly && lineas.length > 0 && (
          <button onClick={() => { setPedidoLink(null); setShowPedirMesa(true); }} className="px-5 py-2.5 bg-white border border-amber-400 text-amber-800 rounded-lg font-medium hover:bg-amber-50 transition-colors flex items-center gap-2"><ClipboardList className="w-4 h-4" /> Pedir precios a mesa</button>
        )}
        <button onClick={handleCopiarWhatsApp} disabled={lineasCalc.length === 0 || costoPendiente} title={costoPendiente ? 'Hay productos sin costo: completalos antes de enviar' : undefined} className="px-5 py-2.5 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 transition-colors flex items-center gap-2 disabled:opacity-50"><Copy className="w-4 h-4" /> WhatsApp</button>
        <button onClick={handleDescargarPDF} disabled={lineasCalc.length === 0 || costoPendiente} title={costoPendiente ? 'Hay productos sin costo: completalos antes de enviar' : undefined} className="px-5 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors flex items-center gap-2 disabled:opacity-50"><FileDown className="w-4 h-4" /> PDF</button>
        <button onClick={handleDescargarExcel} disabled={lineasCalc.length === 0 || costoPendiente} title={costoPendiente ? 'Hay productos sin costo: completalos antes de enviar' : undefined} className="px-5 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors flex items-center gap-2 disabled:opacity-50"><FileSpreadsheet className="w-4 h-4" /> Excel</button>
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


      {showPedirMesa && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={(e) => { if (e.target === e.currentTarget && !creandoPedido) cerrarModalPedido(); }}>
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="titulo text-xl text-emerald-900 flex items-center gap-2"><ClipboardList className="w-5 h-5" /> Pedir precios a mesa de insumos</h3>
              <button onClick={cerrarModalPedido} disabled={creandoPedido} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            {!pedidoLink ? (
              <>
                <p className="text-sm text-gray-600">Se guarda la cotización y se genera un link <strong>sin usuario ni contraseña</strong>. La mesa ve solo el cliente, el número y los productos con sus cantidades (nunca márgenes ni otros clientes).</p>
                {pedido && pedido.estado === 'Abierto' && <p className="text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-2">Ya hay un pedido abierto. Si generás uno nuevo, el anterior deja de funcionar.</p>}
                <div>
                  <span className="text-sm font-medium text-gray-700">¿Cuántos días vale el link?</span>
                  <div className="flex flex-wrap gap-2 mt-1.5 items-center">
                    {['1', '2', '3', '7'].map((d) => (
                      <button key={d} onClick={() => setPedidoForm({ ...pedidoForm, dias: d })} className={`px-3.5 py-2 rounded-lg text-sm font-medium border ${pedidoForm.dias === d ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-700 border-gray-300'}`}>{d} {d === '1' ? 'día' : 'días'}</button>
                    ))}
                    <span className="flex items-center gap-1 text-sm text-gray-500">otro: <input type="number" min={1} max={60} value={pedidoForm.dias} onChange={(e) => setPedidoForm({ ...pedidoForm, dias: e.target.value })} className="w-16 px-2 py-2 border border-gray-300 rounded-lg text-sm text-right" /></span>
                  </div>
                </div>
                <label className="flex items-start gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={pedidoForm.auto} onChange={(e) => setPedidoForm({ ...pedidoForm, auto: e.target.checked })} className="mt-0.5 w-4 h-4 accent-emerald-600" />
                  <span>Aplicar los costos solos cuando la mesa los cargue (al abrir la cotización). Si no, los aplicás vos con un botón.</span>
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-gray-700">Nota para la mesa (opcional)</span>
                  <textarea value={pedidoForm.nota} maxLength={500} rows={2} onChange={(e) => setPedidoForm({ ...pedidoForm, nota: e.target.value })} placeholder="Ej: necesito precio puesto en Tandil" className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
                </label>
                <div className="flex gap-2 justify-end">
                  <button onClick={cerrarModalPedido} disabled={creandoPedido} className="px-4 py-2.5 text-gray-600 rounded-lg text-sm">Cancelar</button>
                  <button onClick={() => void crearPedidoMesa()} disabled={creandoPedido} className="px-5 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50">{creandoPedido && <Loader2 className="w-4 h-4 animate-spin" />} Guardar y generar link</button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">Listo. Mandale este link a la mesa de insumos. Cuando carguen los costos te avisamos en el menú y en Inicio.</p>
                <input readOnly value={pedidoLink.url} onFocus={(e) => e.currentTarget.select()} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs text-gray-600" />
                <div className="flex flex-wrap gap-2">
                  <button onClick={async () => { try { await navigator.clipboard.writeText(pedidoLink.url); toast.exito('Link copiado'); } catch { toast.aviso('No se pudo copiar'); } }} className="px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 flex items-center gap-2"><Link2 className="w-4 h-4" /> Copiar link</button>
                  <button onClick={async () => { try { await navigator.clipboard.writeText(pedidoLink.texto); toast.exito('Texto para WhatsApp copiado'); } catch { toast.aviso('No se pudo copiar'); } }} className="px-4 py-2.5 bg-green-500 text-white rounded-lg text-sm font-medium flex items-center gap-2"><Copy className="w-4 h-4" /> Texto WhatsApp</button>
                  <button onClick={cerrarModalPedido} className="ml-auto px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium">Listo</button>
                </div>
              </>
            )}
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
