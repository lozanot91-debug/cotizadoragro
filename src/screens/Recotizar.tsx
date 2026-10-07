import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Loader2, AlertTriangle, ArrowUp, ArrowDown, CheckCircle2 } from 'lucide-react';
import { useData } from '@/hooks/useData';
import { useToast } from '@/components/Toast';
import { useCargaSegura } from '@/hooks/useCargaSegura';
import ErrorCarga from '@/components/ErrorCarga';
import { registrarCambio } from '@/lib/historial';
import { recotizar, cabeceraRecotizada, type ResultadoRecotizar } from '@/lib/recotizar';
import { formatUSD, formatDate } from '@/lib/format';
import { hoyAR } from '@/lib/fechas';
import type { Configuracion, Cotizacion, CotizacionLinea, ListaCostos, ProductoConCosto, TarifaFlete, EstadoCotizacion } from '@/types';

const estadoColors: Record<string, string> = {
  'Borrador': 'bg-gray-100 text-gray-600',
  'Enviada': 'bg-blue-100 text-blue-700',
  'En negociación': 'bg-amber-100 text-amber-700',
};

interface Fila {
  cotiz: Cotizacion;
  fechaLista: string | null;
  r: ResultadoRecotizar;
}

export default function Recotizar({ onEdit }: { onEdit: (id: string) => void }) {
  const data = useData();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<Configuracion | null>(null);
  const [vigente, setVigente] = useState<ListaCostos | null>(null);
  const [listas, setListas] = useState<ListaCostos[]>([]);
  const [productos, setProductos] = useState<ProductoConCosto[]>([]);
  const [tarifas, setTarifas] = useState<TarifaFlete[]>([]);
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [lineas, setLineas] = useState<CotizacionLinea[]>([]);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [trabajando, setTrabajando] = useState<string | 'lote' | null>(null);
  const [confirmarLote, setConfirmarLote] = useState(false);

  const cargar = useCallback(async () => {
    const [cfg, lv, ls, tars] = await Promise.all([
      data.fetchConfig(), data.fetchListaVigente(), data.fetchListas(), data.fetchTarifasFlete(),
    ]);
    setConfig(cfg); setVigente(lv); setListas(ls); setTarifas(tars);
    if (!lv) { setProductos([]); setCotizaciones([]); setLineas([]); return; }
    const [prods, cots, lins] = await Promise.all([
      data.fetchProductosConCosto(lv.id), data.fetchCotizaciones(), data.fetchLineasDeCotizacionesAbiertas(),
    ]);
    setProductos(prods);
    setCotizaciones(cots.filter((c) => ['Borrador', 'Enviada', 'En negociación'].includes(c.estado) && c.lista_id !== lv.id));
    setLineas(lins);
    setSeleccion(new Set());
  }, []);
  const { load, reintentar, errorCarga } = useCargaSegura(cargar, setLoading);
  useEffect(() => { void load(); }, [load]);

  const filas = useMemo<Fila[]>(() => {
    if (!config) return [];
    const porCotiz = new Map<string, CotizacionLinea[]>();
    lineas.forEach((l) => porCotiz.set(l.cotizacion_id, [...(porCotiz.get(l.cotizacion_id) || []), l]));
    const fechaDe = new Map(listas.map((l) => [l.id, l.fecha]));
    return cotizaciones
      .map((cotiz) => {
        const ls = (porCotiz.get(cotiz.id) || []).sort((a, b) => a.orden - b.orden);
        return {
          cotiz,
          fechaLista: cotiz.lista_id ? fechaDe.get(cotiz.lista_id) || null : null,
          r: recotizar({ cotiz, lineas: ls, productos, tarifas, config }),
        };
      })
      .sort((a, b) => b.cotiz.numero - a.cotiz.numero);
  }, [cotizaciones, lineas, productos, tarifas, config, listas]);

  const recotizables = filas.filter((f) => !f.r.bloqueada && f.r.lineas.length > 0);

  async function crear(f: Fila): Promise<Cotizacion> {
    if (!vigente || !config) throw new Error('No hay lista vigente');
    const cabecera = cabeceraRecotizada(f.cotiz, f.r, { fecha: hoyAR(), vigenciaDias: config.vigencia_default, listaId: vigente.id });
    const nueva = await data.saveCotizacion(cabecera, f.r.lineas);
    await registrarCambio({
      tipo: 'cotizacion', cotizacion_id: nueva.id, campo: 'creación', valor_nuevo: `N° ${nueva.numero}`,
      detalle: `Recotizada de N° ${f.cotiz.numero} con la lista del ${formatDate(vigente.fecha)}`,
    });
    await registrarCambio({ tipo: 'cotizacion', cotizacion_id: f.cotiz.id, detalle: `Recotizada como N° ${nueva.numero}` });
    return nueva;
  }

  async function recotizarUna(f: Fila) {
    if (trabajando) return;
    setTrabajando(f.cotiz.id);
    try {
      const nueva = await crear(f);
      toast.exito(`Cotización N° ${nueva.numero} creada como Borrador`);
      onEdit(nueva.id);
    } catch (e) {
      toast.error(e);
      setTrabajando(null);
    }
  }

  async function recotizarLote() {
    setConfirmarLote(false);
    const elegidas = recotizables.filter((f) => seleccion.has(f.cotiz.id));
    if (elegidas.length === 0 || trabajando) return;
    setTrabajando('lote');
    let creadas = 0;
    const fallidas: number[] = [];
    for (const f of elegidas) {
      try { await crear(f); creadas++; } catch (e) { console.error('Error al recotizar', f.cotiz.numero, e); fallidas.push(f.cotiz.numero); }
    }
    setTrabajando(null);
    if (creadas > 0) toast.exito(`${creadas} cotizaciones creadas como Borrador`);
    if (fallidas.length > 0) toast.aviso(`No se pudieron recotizar: N° ${fallidas.join(', ')}`);
    setLoading(true);
    void load();
  }

  function alternar(id: string) {
    setSeleccion((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  const todasMarcadas = recotizables.length > 0 && recotizables.every((f) => seleccion.has(f.cotiz.id));

  if (errorCarga && !loading) return <ErrorCarga error={errorCarga} onReintentar={reintentar} />;
  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-emerald-600 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Recotizar con la lista nueva</h1>
        <p className="text-sm text-gray-500 mt-1">
          Cotizaciones abiertas (Borrador, Enviada, En negociación) que quedaron con una lista de costos anterior.
          Se mantienen cantidades, márgenes, flete, tipo de cambio, IVA y condiciones de pago; solo cambian los costos.
          La cotización original queda como está y la nueva se crea en Borrador.
        </p>
      </div>

      {!vigente ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800">Todavía no hay una lista de costos cargada.</div>
      ) : filas.length === 0 ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 flex items-center gap-3 text-emerald-800">
          <CheckCircle2 className="w-5 h-5" />
          <span className="text-sm">Todas las cotizaciones abiertas ya usan la lista vigente (del {formatDate(vigente.fecha)}).</span>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-600">
              Lista vigente: <strong>{formatDate(vigente.fecha)}</strong> · {filas.length} cotizaciones para revisar
            </p>
            <button onClick={() => setConfirmarLote(true)} disabled={seleccion.size === 0 || !!trabajando}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2">
              {trabajando === 'lote' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Recotizar seleccionadas ({seleccion.size})
            </button>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-600">
                  <th className="px-3 py-2 w-8">
                    <input type="checkbox" aria-label="Marcar todas" checked={todasMarcadas}
                      onChange={() => setSeleccion(todasMarcadas ? new Set() : new Set(recotizables.map((f) => f.cotiz.id)))} className="w-4 h-4 accent-emerald-600" />
                  </th>
                  <th className="text-left px-3 py-2 font-medium">N°</th>
                  <th className="text-left px-3 py-2 font-medium">Cliente</th>
                  <th className="text-left px-3 py-2 font-medium">Estado</th>
                  <th className="text-left px-3 py-2 font-medium whitespace-nowrap">Lista usada</th>
                  <th className="text-right px-3 py-2 font-medium whitespace-nowrap">Antes (USD)</th>
                  <th className="text-right px-3 py-2 font-medium whitespace-nowrap">Ahora (USD)</th>
                  <th className="text-right px-3 py-2 font-medium">Var.</th>
                  <th className="text-left px-3 py-2 font-medium">Revisar</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => {
                  const { cotiz, r } = f;
                  const bloqueada = r.bloqueada || r.lineas.length === 0;
                  const sube = r.variacionPct > 0.05;
                  const baja = r.variacionPct < -0.05;
                  return (
                    <tr key={cotiz.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <input type="checkbox" aria-label={`Marcar cotización ${cotiz.numero}`} disabled={!!bloqueada} checked={seleccion.has(cotiz.id)}
                          onChange={() => alternar(cotiz.id)} className="w-4 h-4 accent-emerald-600 disabled:opacity-40" />
                      </td>
                      <td className="px-3 py-2 font-medium text-gray-800">{cotiz.numero}</td>
                      <td className="px-3 py-2 text-gray-700">{cotiz.cliente_nombre || 'Sin cliente'}</td>
                      <td className="px-3 py-2"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${estadoColors[cotiz.estado as EstadoCotizacion] || 'bg-gray-100 text-gray-600'}`}>{cotiz.estado}</span></td>
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{f.fechaLista ? formatDate(f.fechaLista) : 'sin dato'}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{formatUSD(r.subtotalAnterior)}</td>
                      <td className="px-3 py-2 text-right font-medium text-gray-800">{bloqueada ? '—' : formatUSD(r.subtotalNuevo)}</td>
                      <td className={`px-3 py-2 text-right font-medium whitespace-nowrap ${sube ? 'text-red-600' : baja ? 'text-emerald-600' : 'text-gray-400'}`}>
                        {bloqueada ? '—' : (<span className="inline-flex items-center gap-0.5">{sube && <ArrowUp className="w-3 h-3" />}{baja && <ArrowDown className="w-3 h-3" />}{formatUSD(Math.abs(r.variacionPct), 1)}%</span>)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {r.bloqueada && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">{r.bloqueada}</span>}
                          {!r.bloqueada && r.lineas.length === 0 && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Sin líneas</span>}
                          {r.avisos.costoEditado > 0 && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full" title="Se mantiene el costo que editaste a mano">{r.avisos.costoEditado} con costo editado</span>}
                          {r.avisos.fueraDeLista.length > 0 && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full" title={r.avisos.fueraDeLista.join(', ')}>{r.avisos.fueraDeLista.length} fuera de lista (mantiene precio anterior)</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => recotizarUna(f)} disabled={!!bloqueada || !!trabajando}
                          className="px-3 py-1.5 border border-emerald-600 text-emerald-700 rounded-lg text-xs font-medium hover:bg-emerald-50 disabled:opacity-40 flex items-center gap-1 ml-auto whitespace-nowrap">
                          {trabajando === cotiz.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Recotizar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Los montos son a precio contado y sin IVA. Las cotizaciones "fuera de lista" conservan el precio anterior de ese producto: revisalas antes de enviar.
          </p>
        </>
      )}

      {confirmarLote && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setConfirmarLote(false)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-gray-800 mb-2">Recotizar {seleccion.size} cotizaciones</h3>
            <p className="text-sm text-gray-600 mb-4">
              Se van a crear {seleccion.size} cotizaciones nuevas en <strong>Borrador</strong> con la lista del {vigente ? formatDate(vigente.fecha) : ''}.
              Las originales quedan como están.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmarLote(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Cancelar</button>
              <button onClick={recotizarLote} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700">Crear</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
