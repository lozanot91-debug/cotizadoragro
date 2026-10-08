import { useState, useEffect, useCallback, useRef } from 'react';
import ConveniosFlete from '@/components/ConveniosFlete';
import PlantasFlete from '@/components/PlantasFlete';
import { useData } from '@/hooks/useData';
import { useAuth } from '@/context/AuthContext';
import { parsearListaCostos } from '@/lib/excel';
import { formatDate, formatUSD } from '@/lib/format';
import { registrarCambio } from '@/lib/historial';
import type { ListaCostos, ProductoConCosto, Cotizacion } from '@/types';
import { Upload, ListChecks, AlertCircle, Check, Loader2, FileSpreadsheet, History, TrendingUp, X } from 'lucide-react';
import { hoyAR } from '@/lib/fechas';
import { traducirError } from '@/lib/errores';
import { useCargaSegura } from '@/hooks/useCargaSegura';
import ErrorCarga from '@/components/ErrorCarga';

export default function Listas() {
  const { usuario } = useAuth();
  // Los vendedores ven las listas y los costos, pero solo el admin puede cargarlas
  const esAdmin = usuario.rol === 'admin';
  const data = useData();
  const [listas, setListas] = useState<ListaCostos[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [mensaje, setMensaje] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const [cambiosCosto, setCambiosCosto] = useState<{ cod: string; producto: string; costoAnt: number; costoNuevo: number; diff: number; pct: number }[] | null>(null);
  const [cotizAfectadas, setCotizAfectadas] = useState<{ numero: number; cliente: string }[]>([]);
  const [modalConfirmar, setModalConfirmar] = useState<{ fecha: string; file: File; filas: { cod: string; proveedor: string; familia: string; producto: string; unid: string; costo: number }[]; afectadas: { total: number; abiertas: number } } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    const ls = await data.fetchListas();
    setListas(ls);
  }, []);

  const { load, reintentar, errorCarga } = useCargaSegura(cargar, setLoading);

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
        const afectadas = await data.cotizacionesAfectadas(fechaFinal);
        setUploading(false);
        setModalConfirmar({ fecha: fechaFinal, file, filas, afectadas });
        return;
      }

      await procesarCarga(fechaFinal, file.name, filas, false);
    } catch (err) {
      setMensaje({ type: 'error', text: `Error al procesar el archivo: ${traducirError(err)}` });
    }
    setUploading(false);
  }

  async function procesarCarga(fecha: string, nombreArchivo: string, filas: { cod: string; proveedor: string; familia: string; producto: string; unid: string; costo: number }[], reemplazar: boolean) {
    setUploading(true);
    setMensaje(null);
    try {
      // Lista inmediatamente anterior a la fecha que se carga (no "la primera de la lista")
      const listaAnterior = await data.fetchListaAnteriorA(fecha);
      const productosAnt: ProductoConCosto[] = listaAnterior ? await data.fetchProductosConCosto(listaAnterior.id) : [];

      // Carga atómica en la base: o se carga todo o no se carga nada
      const resultado = await data.cargarLista(fecha, nombreArchivo, filas, reemplazar);

      // Comparar costos con la lista anterior
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

      await registrarCambio({
        tipo: 'lista',
        campo: 'lista de costos',
        valor_nuevo: `${filas.length} productos`,
        detalle: `Fecha: ${fecha}${reemplazar ? ' (reemplazo)' : ''}`,
      });

      const resumen = `Lista cargada: ${filas.length} productos (${resultado.productos_nuevos} nuevos, ${resultado.productos_actualizados} actualizados).`;
      // La vigente es siempre la de fecha más reciente: cargar una más vieja no la cambia
      const vigente = listas[0];
      const esAnteriorAVigente = !!vigente && fecha < vigente.fecha;
      const avisoVigente = esAnteriorAVigente
        ? ` Esta lista es anterior a la vigente (${formatDate(vigente.fecha)}): la vigente sigue siendo la más reciente.`
        : '';

      // Cotizaciones abiertas que usan algún producto cuyo costo cambió (una sola consulta)
      let afectadas: { numero: number; cliente: string }[] = [];
      let avisoAfectadas = '';
      if (cambios.length > 0) {
        try {
          const codsCambiados = new Set(cambios.map((c) => c.cod));
          const lineasAbiertas = await data.fetchLineasCotizacionesAbiertas();
          const porNumero = new Map<number, string>();
          for (const l of lineasAbiertas) {
            if (codsCambiados.has(l.cod)) porNumero.set(l.numero, l.cliente);
          }
          afectadas = [...porNumero].sort((x, y) => x[0] - y[0]).map(([numero, cliente]) => ({ numero, cliente }));
        } catch {
          avisoAfectadas = ' No se pudo calcular qué cotizaciones abiertas se ven afectadas.';
        }
        setCambiosCosto(cambios);
        setCotizAfectadas(afectadas);
        setMensaje({ type: 'warning', text: `${resumen} ${cambios.length} productos cambiaron de costo.${avisoAfectadas}${avisoVigente}` });
      } else {
        setMensaje({
          type: esAnteriorAVigente ? 'warning' : 'success',
          text: `${listaAnterior ? resumen : `${resumen} Es la primera lista: no hay costos anteriores para comparar.`}${avisoVigente}`,
        });
      }

      load();
    } catch (err) {
      setMensaje({ type: 'error', text: `No se cargó la lista (no se guardó nada). ${traducirError(err)}` });
    } finally {
      setUploading(false);
    }
  }


  if (errorCarga && !loading) return <ErrorCarga error={errorCarga} onReintentar={reintentar} />;

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

      {/* Carga de archivos (solo admin) */}
      {esAdmin && (
      <div className="grid grid-cols-1 gap-4">
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

      </div>
      )}

      <ConveniosFlete esAdmin={esAdmin} />
      <PlantasFlete esAdmin={esAdmin} />

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
              ¿Querés reemplazar la lista existente? Se reemplazarán todos sus costos por los del archivo nuevo.
            </p>
            {modalConfirmar.afectadas.total > 0 && (
              <div className="text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 mb-4">
                Hay {modalConfirmar.afectadas.total} cotización(es) hechas con esta lista
                {modalConfirmar.afectadas.abiertas > 0 ? ` (${modalConfirmar.afectadas.abiertas} todavía abierta/s)` : ''}.
                Sus precios ya guardados <strong>no cambian</strong>; solo se actualizan los costos de la lista para cotizaciones nuevas.
              </div>
            )}
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
