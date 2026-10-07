import { useState, useEffect, useCallback, useRef } from 'react';
import { useData } from '@/hooks/useData';
import { supabase } from '@/lib/supabase';
import { parsearListaCostos, parsearTarifaFlete } from '@/lib/excel';
import { formatDate, formatUSD } from '@/lib/format';
import { registrarCambio } from '@/lib/historial';
import type { ListaCostos, ProductoConCosto, Cotizacion } from '@/types';
import { Upload, ListChecks, Truck, AlertCircle, Check, Loader2, FileSpreadsheet, History, TrendingUp, X } from 'lucide-react';
import { hoyAR } from '@/lib/fechas';

export default function Listas() {
  const data = useData();
  const [listas, setListas] = useState<ListaCostos[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [mensaje, setMensaje] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const [cambiosCosto, setCambiosCosto] = useState<{ cod: string; producto: string; costoAnt: number; costoNuevo: number; diff: number; pct: number }[] | null>(null);
  const [cotizAfectadas, setCotizAfectadas] = useState<{ numero: number; cliente: string }[]>([]);
  const [tarifaStatus, setTarifaStatus] = useState<number | null>(null);
  const [modalConfirmar, setModalConfirmar] = useState<{ fecha: string; file: File; filas: { cod: string; proveedor: string; familia: string; producto: string; unid: string; costo: number }[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fleteInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const ls = await data.fetchListas();
    setListas(ls);
    const tars = await data.fetchTarifasFlete();
    setTarifaStatus(tars.length);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleUploadCostos(file: File) {
    setUploading(true);
    setMensaje(null);
    try {
      const buffer = await file.arrayBuffer();
      const { filas, fecha } = parsearListaCostos(buffer, file.name);
      const fechaFinal = fecha || hoyAR();

      // Validate
      if (filas.length === 0) {
        setMensaje({ type: 'error', text: 'No se encontraron filas válidas en el archivo' });
        setUploading(false);
        return;
      }
      const invalidas = filas.filter((f) => !f.cod || isNaN(f.costo) || f.costo <= 0);
      if (invalidas.length > 0) {
        setMensaje({ type: 'error', text: `${invalidas.length} filas tienen código o costo inválido. Revisá el archivo.` });
        setUploading(false);
        return;
      }

      // Check if a lista with this fecha already exists
      const existente = await data.fetchListaByFecha(fechaFinal);
      if (existente) {
        setUploading(false);
        setModalConfirmar({ fecha: fechaFinal, file, filas });
        return;
      }

      await procesarCarga(fechaFinal, file.name, filas, false);
    } catch (err) {
      setMensaje({ type: 'error', text: `Error al procesar el archivo: ${err instanceof Error ? err.message : 'desconocido'}` });
    }
    setUploading(false);
  }

  async function procesarCarga(fecha: string, nombreArchivo: string, filas: { cod: string; proveedor: string; familia: string; producto: string; unid: string; costo: number }[], reemplazar: boolean) {
    setUploading(true);
    setMensaje(null);

    // Fetch previous lista costs for comparison
    const listaAnterior = listas[0];
    let productosAnt: ProductoConCosto[] = [];
    if (listaAnterior) {
      productosAnt = await data.fetchProductosConCosto(listaAnterior.id);
    }

    // Call the RPC to load everything atomically
    const resultado = await data.cargarLista(fecha, nombreArchivo, filas, reemplazar);

    if (!resultado) {
      setMensaje({ type: 'error', text: 'Error al cargar la lista. Intentá nuevamente.' });
      setUploading(false);
      return;
    }

    // Compare costs with previous lista
    const cambios: { cod: string; producto: string; costoAnt: number; costoNuevo: number; diff: number; pct: number }[] = [];
    if (listaAnterior) {
      const costoAntMap = new Map(productosAnt.map((p) => [p.cod, p]));
      for (const fila of filas) {
        const prodAnt = costoAntMap.get(fila.cod);
        if (prodAnt && prodAnt.costo !== fila.costo) {
          const pct = prodAnt.costo > 0 ? ((fila.costo - prodAnt.costo) / prodAnt.costo) * 100 : 0;
          cambios.push({
            cod: fila.cod,
            producto: fila.producto,
            costoAnt: prodAnt.costo,
            costoNuevo: fila.costo,
            diff: fila.costo - prodAnt.costo,
            pct,
          });
        }
      }
    }

    // Find affected open cotizaciones
    let afectadas: { numero: number; cliente: string }[] = [];
    if (cambios.length > 0) {
      const codsCambiados = new Set(cambios.map((c) => c.cod));
      const cotizs = await data.fetchCotizaciones();
      const abiertas = cotizs.filter((c) =>
        c.estado === 'Borrador' || c.estado === 'Enviada' || c.estado === 'En negociación'
      );
      for (const cot of abiertas) {
        const lineas = await data.fetchLineas(cot.id);
        const tieneCambio = lineas.some((l) => codsCambiados.has(l.cod));
        if (tieneCambio) {
          afectadas.push({ numero: cot.numero, cliente: cot.cliente_nombre || 'Sin cliente' });
        }
      }
    }

    if (cambios.length > 0) {
      setCambiosCosto(cambios);
      setCotizAfectadas(afectadas);
      setMensaje({
        type: 'warning',
        text: `Lista cargada: ${filas.length} productos (${resultado.productos_nuevos} nuevos, ${resultado.productos_actualizados} actualizados). ${cambios.length} productos cambiaron de costo.`,
      });
    } else {
      setMensaje({
        type: 'success',
        text: `Lista cargada: ${filas.length} productos (${resultado.productos_nuevos} nuevos, ${resultado.productos_actualizados} actualizados).`,
      });
    }

    await registrarCambio({
      tipo: 'lista',
      campo: 'lista de costos',
      valor_nuevo: `${filas.length} productos`,
      detalle: `Fecha: ${fecha}${reemplazar ? ' (reemplazo)' : ''}`,
    });

    load();
  }

  async function handleUploadFlete(file: File) {
    setUploading(true);
    setMensaje(null);
    try {
      const buffer = await file.arrayBuffer();
      const filas = parsearTarifaFlete(buffer);

      if (filas.length === 0) {
        setMensaje({ type: 'error', text: 'No se pudieron extraer tarifas del archivo' });
        setUploading(false);
        return;
      }

      // Delete existing and insert in batches of 1000
      await supabase.from('tarifa_flete').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      for (let i = 0; i < filas.length; i += 1000) {
        const batch = filas.slice(i, i + 1000).map((f) => ({ km: f.km, tarifa: f.tarifa }));
        await supabase.from('tarifa_flete').insert(batch);
      }

      const maxKm = filas[filas.length - 1]?.km || filas.length;
      setMensaje({ type: 'success', text: `Tarifa cargada: ${filas.length} km` });

      await registrarCambio({
        tipo: 'lista',
        campo: 'tarifa de flete',
        valor_nuevo: `${filas.length} km`,
        detalle: `Máximo: ${maxKm} km`,
      });

      load();
    } catch (err) {
      setMensaje({ type: 'error', text: `Error: ${err instanceof Error ? err.message : 'desconocido'}` });
    }
    setUploading(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-800">Listas de costos y flete</h1>

      {/* Upload zones */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Lista de costos */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
              <ListChecks className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-800">Lista de costos</h3>
              <p className="text-xs text-gray-500">Subir archivo .xlsx semanal</p>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadCostos(f); e.target.value = ''; }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full border-2 border-dashed border-gray-300 rounded-lg py-6 hover:border-emerald-400 hover:bg-emerald-50 transition-colors flex flex-col items-center gap-2 disabled:opacity-50"
          >
            {uploading ? (
              <>
                <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
                <span className="text-sm text-gray-500">Cargando...</span>
              </>
            ) : (
              <Upload className="w-6 h-6 text-gray-400" />
            )}
            {!uploading && <span className="text-sm text-gray-500">Seleccionar archivo .xlsx</span>}
          </button>
          <p className="text-xs text-gray-400 mt-2">
            El nombre del archivo debe incluir la fecha (ej. lista_de_costos_2-10-26.xlsx)
          </p>
        </div>

        {/* Tarifa de flete */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Truck className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-800">Tarifa de flete</h3>
              <p className="text-xs text-gray-500">
                {tarifaStatus !== null ? `Tarifa cargada: ${tarifaStatus} km` : 'No cargada'}
              </p>
            </div>
          </div>
          <input
            ref={fleteInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadFlete(f); e.target.value = ''; }}
          />
          <button
            onClick={() => fleteInputRef.current?.click()}
            disabled={uploading}
            className="w-full border-2 border-dashed border-gray-300 rounded-lg py-6 hover:border-blue-400 hover:bg-blue-50 transition-colors flex flex-col items-center gap-2 disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
            ) : (
              <Upload className="w-6 h-6 text-gray-400" />
            )}
            <span className="text-sm text-gray-500">Seleccionar archivo .xls/.xlsx</span>
          </button>
          <p className="text-xs text-gray-400 mt-2">
            Tarifa en pesos por 100 kg, de 1 a 1200 km
          </p>
        </div>
      </div>

      {/* Mensaje */}
      {mensaje && (
        <div className={`rounded-xl p-4 flex items-start gap-3 ${
          mensaje.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' :
          mensaje.type === 'warning' ? 'bg-amber-50 border border-amber-200 text-amber-700' :
          'bg-red-50 border border-red-200 text-red-700'
        }`}>
          {mensaje.type === 'success' ? <Check className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
          <span className="text-sm">{mensaje.text}</span>
        </div>
      )}

      {/* Cambios de costo */}
      {cambiosCosto && cambiosCosto.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-amber-200 p-5">
          <h3 className="font-semibold text-amber-800 mb-3 flex items-center gap-2">
            <TrendingUp className="w-5 h-5" /> Productos que cambiaron de costo
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-2 font-medium text-gray-600">Código</th>
                  <th className="text-left py-2 px-2 font-medium text-gray-600">Producto</th>
                  <th className="text-right py-2 px-2 font-medium text-gray-600">Costo anterior</th>
                  <th className="text-right py-2 px-2 font-medium text-gray-600">Costo nuevo</th>
                  <th className="text-right py-2 px-2 font-medium text-gray-600">Diferencia</th>
                  <th className="text-right py-2 px-2 font-medium text-gray-600">%</th>
                </tr>
              </thead>
              <tbody>
                {cambiosCosto.slice(0, 100).map((c) => (
                  <tr key={c.cod} className="border-b border-gray-100">
                    <td className="py-2 px-2 text-gray-600">{c.cod}</td>
                    <td className="py-2 px-2 text-gray-700">{c.producto}</td>
                    <td className="py-2 px-2 text-right text-gray-500">{formatUSD(c.costoAnt)}</td>
                    <td className="py-2 px-2 text-right text-gray-700 font-medium">{formatUSD(c.costoNuevo)}</td>
                    <td className={`py-2 px-2 text-right font-medium ${c.diff > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {c.diff > 0 ? '+' : ''}{formatUSD(c.diff)}
                    </td>
                    <td className={`py-2 px-2 text-right font-medium ${c.pct > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {c.pct > 0 ? '+' : ''}{c.pct.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {cotizAfectadas.length > 0 && (
            <div className="mt-4 border-t border-amber-100 pt-4">
              <h4 className="text-sm font-semibold text-amber-800 mb-2">Cotizaciones abiertas afectadas ({cotizAfectadas.length})</h4>
              <div className="flex flex-wrap gap-2">
                {cotizAfectadas.map((c) => (
                  <span key={c.numero} className="text-xs px-3 py-1 rounded-full bg-amber-100 text-amber-700 font-medium">
                    N° {c.numero} · {c.cliente}
                  </span>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => { setCambiosCosto(null); setCotizAfectadas([]); }}
            className="text-sm text-gray-500 hover:text-gray-700 mt-3"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Historial de listas */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <History className="w-5 h-5 text-gray-400" /> Historial de listas
        </h3>
        {listas.length === 0 ? (
          <p className="text-sm text-gray-400">No hay listas cargadas</p>
        ) : (
          <div className="space-y-2">
            {listas.map((l) => (
              <div key={l.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="w-4 h-4 text-gray-400" />
                  <div>
                    <span className="text-sm font-medium text-gray-700">{formatDate(l.fecha)}</span>
                    {l.nombre_archivo && <span className="text-xs text-gray-400 ml-2">{l.nombre_archivo}</span>}
                  </div>
                </div>
                {l.id === listas[0]?.id && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">Vigente</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal confirmar reemplazo */}
      {modalConfirmar && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setModalConfirmar(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-800">Ya existe una lista con esta fecha</h3>
                <p className="text-sm text-gray-500">Fecha: {formatDate(modalConfirmar.fecha)}</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              ¿Querés reemplazar la lista existente? Se borrarán los costos anteriores y se cargarán los nuevos.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setModalConfirmar(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Cancelar</button>
              <button
                onClick={async () => {
                  const m = modalConfirmar;
                  setModalConfirmar(null);
                  await procesarCarga(m.fecha, m.file.name, m.filas, true);
                }}
                className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm hover:bg-amber-700"
              >
                Reemplazar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
