import { useEffect, useRef, useState } from 'react';
import { Upload, ListChecks, AlertCircle, Loader2, FileSpreadsheet, History, Pencil, Check, X } from 'lucide-react';
import { useData } from '@/hooks/useData';
import { parsearListaCostos } from '@/lib/excel';
import { formatDate } from '@/lib/format';
import { registrarCambio } from '@/lib/historial';
import { hoyAR } from '@/lib/fechas';
import { traducirError } from '@/lib/errores';
import { aplicarPrefijoCod, esNombreRepetido, vigentePorFuente } from '@/lib/fuentesLista';
import type { FuenteLista, ListaCostos, ProductoConCosto } from '@/types';

type Fila = { cod: string; proveedor: string; familia: string; producto: string; unid: string; costo: number };
export type CambioCosto = { cod: string; producto: string; costoAnt: number; costoNuevo: number; diff: number; pct: number };

export interface ResultadoCarga {
  mensaje: { type: 'success' | 'error' | 'warning'; text: string } | null;
  cambios?: CambioCosto[] | null;
  afectadas?: { numero: number; nombre: string }[];
}

interface Props {
  fuente: FuenteLista;
  listas: ListaCostos[]; // solo las de esta fuente, de más nueva a más vieja
  esAdmin: boolean;
  variasFuentes: boolean;
  version: number; // cambia cada vez que se recargan las listas
  onCambio: () => void;
  onResultado: (r: ResultadoCarga) => void;
}

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none';

export default function TarjetaFuenteLista({ fuente, listas, esAdmin, variasFuentes, version, onCambio, onResultado }: Props) {
  const data = useData();
  const vigente = vigentePorFuente(listas).get(fuente.id) ?? null;
  const [cantidad, setCantidad] = useState<number | null>(null);
  const [verTodas, setVerTodas] = useState(false);
  const [error, setError] = useState('');

  // Edición de la fuente
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [prefijo, setPrefijo] = useState('');
  const [guardando, setGuardando] = useState(false);

  // Edición de la descripción de una carga (id de la lista que se edita)
  const [editLista, setEditLista] = useState<string | null>(null);
  const [descLista, setDescLista] = useState('');

  // Carga
  const [descCarga, setDescCarga] = useState('');
  const [fechaManual, setFechaManual] = useState('');
  const [uploading, setUploading] = useState(false);
  const [modal, setModal] = useState<{ fecha: string; archivo: string; filas: Fila[]; afectadas: { total: number; abiertas: number } } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let vivo = true;
    setCantidad(null);
    if (vigente) {
      data.contarProductosDeLista(vigente.id).then((n) => { if (vivo) setCantidad(n); }).catch(() => {});
    }
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vigente?.id, version]);

  function abrirEdicion() {
    setNombre(fuente.nombre);
    setDescripcion(fuente.descripcion ?? '');
    setPrefijo(fuente.prefijo_cod ?? '');
    setError('');
    setEditando(true);
  }

  async function guardarFuente() {
    if (!nombre.trim()) { setError('Poné un nombre'); return; }
    setGuardando(true);
    setError('');
    try {
      await data.actualizarFuente(fuente.id, {
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || null,
        prefijo_cod: prefijo.trim() || null,
      });
      setEditando(false);
      onCambio();
    } catch (err) {
      setError(esNombreRepetido(err) ? 'Ya hay una lista con ese nombre' : traducirError(err));
    }
    setGuardando(false);
  }

  async function guardarDescLista(id: string) {
    setError('');
    try {
      await data.actualizarDescripcionLista(id, descLista.trim() || null);
      setEditLista(null);
      onCambio();
    } catch (err) {
      setError(traducirError(err));
    }
  }

  function editorDescLista(l: ListaCostos) {
    return (
      <div className="flex items-center gap-1.5 mt-1">
        <input
          autoFocus
          value={descLista}
          onChange={(e) => setDescLista(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void guardarDescLista(l.id); if (e.key === 'Escape') setEditLista(null); }}
          placeholder="Descripción de esta carga"
          aria-label="Descripción de la carga"
          className={inputCls}
        />
        <button onClick={() => void guardarDescLista(l.id)} aria-label="Guardar descripción" className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded"><Check className="w-4 h-4" /></button>
        <button onClick={() => setEditLista(null)} aria-label="Cancelar" className="p-1.5 text-gray-400 hover:bg-gray-100 rounded"><X className="w-4 h-4" /></button>
      </div>
    );
  }

  function pencilDescLista(l: ListaCostos) {
    return (
      <button
        onClick={() => { setEditLista(l.id); setDescLista(l.descripcion ?? ''); }}
        aria-label="Editar descripción de la carga"
        className="p-1 text-gray-400 hover:text-emerald-600 rounded"
      >
        <Pencil className="w-3.5 h-3.5" />
      </button>
    );
  }

  async function handleUpload(file: File) {
    setUploading(true);
    onResultado({ mensaje: null });
    try {
      const buffer = await file.arrayBuffer();
      const parsed = await parsearListaCostos(buffer, file.name);
      const filas = aplicarPrefijoCod(parsed.filas, fuente.prefijo_cod);
      const fechaFinal = fechaManual || parsed.fecha || hoyAR();

      if (filas.length === 0) {
        onResultado({ mensaje: { type: 'error', text: 'No se encontraron filas válidas en el archivo' } });
        setUploading(false);
        return;
      }
      const invalidas = filas.filter((f) => !f.cod || isNaN(f.costo) || f.costo <= 0);
      if (invalidas.length > 0) {
        onResultado({ mensaje: { type: 'error', text: `${invalidas.length} filas tienen código o costo inválido. Revisá el archivo.` } });
        setUploading(false);
        return;
      }

      const existente = await data.fetchListaByFecha(fechaFinal, fuente.id);
      if (existente) {
        const afectadas = await data.cotizacionesAfectadas(fechaFinal, fuente.id);
        setUploading(false);
        setModal({ fecha: fechaFinal, archivo: file.name, filas, afectadas });
        return;
      }

      await procesarCarga(fechaFinal, file.name, filas, false);
    } catch (err) {
      onResultado({ mensaje: { type: 'error', text: `Error al procesar el archivo: ${traducirError(err)}` } });
    }
    setUploading(false);
  }

  async function procesarCarga(fecha: string, nombreArchivo: string, filas: Fila[], reemplazar: boolean) {
    setUploading(true);
    onResultado({ mensaje: null });
    try {
      // Lista inmediatamente anterior a la fecha que se carga (de esta fuente)
      const listaAnterior = await data.fetchListaAnteriorA(fecha, fuente.id);
      const productosAnt: ProductoConCosto[] = listaAnterior ? await data.fetchProductosConCosto(listaAnterior.id) : [];

      // Carga atómica en la base: o se carga todo o no se carga nada
      const resultado = await data.cargarLista(fecha, nombreArchivo, filas, reemplazar, {
        fuenteId: fuente.id,
        descripcion: descCarga.trim() || null,
      });

      const cambios: CambioCosto[] = [];
      if (listaAnterior) {
        const costoAntMap = new Map(productosAnt.map((p) => [p.cod, p]));
        for (const fila of filas) {
          const prodAnt = costoAntMap.get(fila.cod);
          if (prodAnt && prodAnt.costo !== fila.costo) {
            const pct = prodAnt.costo > 0 ? ((fila.costo - prodAnt.costo) / prodAnt.costo) * 100 : 0;
            cambios.push({ cod: fila.cod, producto: fila.producto, costoAnt: prodAnt.costo, costoNuevo: fila.costo, diff: fila.costo - prodAnt.costo, pct });
          }
        }
      }

      await registrarCambio({
        tipo: 'lista',
        campo: 'lista de costos',
        valor_nuevo: `${filas.length} productos`,
        detalle: `${variasFuentes ? `${fuente.nombre} · ` : ''}Fecha: ${fecha}${reemplazar ? ' (reemplazo)' : ''}`,
      });

      const resumen = `${variasFuentes ? `${fuente.nombre}: ` : ''}Lista cargada: ${filas.length} productos (${resultado.productos_nuevos} nuevos, ${resultado.productos_actualizados} actualizados).`;
      // La vigente es siempre la de fecha más reciente: cargar una más vieja no la cambia
      const esAnteriorAVigente = !!vigente && fecha < vigente.fecha;
      const avisoVigente = esAnteriorAVigente && vigente
        ? ` Esta lista es anterior a la vigente (${formatDate(vigente.fecha)}): la vigente sigue siendo la más reciente.`
        : '';

      if (cambios.length > 0) {
        let afectadas: { numero: number; nombre: string }[] = [];
        let avisoAfectadas = '';
        try {
          const codsCambiados = new Set(cambios.map((c) => c.cod));
          const lineasAbiertas = await data.fetchLineasCotizacionesAbiertas();
          const porNumero = new Map<number, string>();
          for (const l of lineasAbiertas) {
            if (codsCambiados.has(l.cod)) porNumero.set(l.numero, l.nombre);
          }
          afectadas = [...porNumero].sort((x, y) => x[0] - y[0]).map(([numero, nombre]) => ({ numero, nombre }));
        } catch {
          avisoAfectadas = ' No se pudo calcular qué cotizaciones abiertas se ven afectadas.';
        }
        onResultado({
          mensaje: { type: 'warning', text: `${resumen} ${cambios.length} productos cambiaron de costo.${avisoAfectadas}${avisoVigente}` },
          cambios,
          afectadas,
        });
      } else {
        onResultado({
          mensaje: {
            type: esAnteriorAVigente ? 'warning' : 'success',
            text: `${listaAnterior ? resumen : `${resumen} Es la primera lista: no hay costos anteriores para comparar.`}${avisoVigente}`,
          },
        });
      }
      setDescCarga('');
      onCambio();
    } catch (err) {
      onResultado({ mensaje: { type: 'error', text: `No se cargó la lista (no se guardó nada). ${traducirError(err)}` } });
    } finally {
      setUploading(false);
    }
  }

  const visibles = verTodas ? listas : listas.slice(0, 5);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
      {/* Cabecera: título y descripción fijos de la fuente */}
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
          <ListChecks className="w-5 h-5 text-emerald-600" />
        </div>
        {editando ? (
          <div className="flex-1 space-y-2">
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre" aria-label="Nombre de la lista" className={inputCls} />
            <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Descripción" aria-label="Descripción de la lista" className={inputCls} />
            <div>
              <input value={prefijo} onChange={(e) => setPrefijo(e.target.value)} placeholder="Prefijo de códigos" aria-label="Prefijo de códigos" className={inputCls} />
              <p className="text-xs text-gray-400 mt-1">Se antepone a cada código del archivo. Dejalo vacío para la lista principal.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => void guardarFuente()} disabled={guardando} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:opacity-50">Guardar</button>
              <button onClick={() => setEditando(false)} className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Cancelar</button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-800">{fuente.nombre}</h3>
              {fuente.descripcion && <p className="text-xs text-gray-500">{fuente.descripcion}</p>}
            </div>
            {esAdmin && (
              <button onClick={abrirEdicion} aria-label="Editar lista de precios" className="p-1.5 text-gray-400 hover:text-emerald-600 rounded">
                <Pencil className="w-4 h-4" />
              </button>
            )}
          </>
        )}
      </div>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      {/* Lista vigente y la nota de esa carga */}
      {vigente ? (
        <div className="mb-4">
          <p className="text-sm text-gray-700">
            <span className="font-medium">Lista vigente: {formatDate(vigente.fecha)}</span>
            {cantidad !== null && <span className="text-gray-500"> · {cantidad} productos</span>}
          </p>
          {editLista === vigente.id ? editorDescLista(vigente) : (
            <p className="text-xs text-gray-500 italic flex items-center gap-1">
              {vigente.descripcion}
              {esAdmin && pencilDescLista(vigente)}
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-gray-400 mb-4">Todavía no cargaste ninguna lista.</p>
      )}

      {/* Carga (solo admin) */}
      {esAdmin && (
        <div className="mb-4 space-y-2">
          <input value={descCarga} onChange={(e) => setDescCarga(e.target.value)} placeholder="Descripción de esta carga (opcional)" aria-label="Descripción de esta carga (opcional)" className={inputCls} />
          <div>
            <label className="block text-xs text-gray-500 mb-1">Fecha de la lista (si el archivo no la trae)</label>
            <input type="date" value={fechaManual} onChange={(e) => setFechaManual(e.target.value)} className={inputCls} />
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUpload(f); e.target.value = ''; }}
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
          <p className="text-xs text-gray-400">
            El nombre del archivo debe incluir la fecha (ej. lista_de_costos_2-10-26.xlsx)
          </p>
        </div>
      )}

      {/* Historial de esta fuente */}
      {listas.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
            <History className="w-4 h-4 text-gray-400" /> Historial
          </h4>
          <div className="space-y-1">
            {visibles.map((l) => (
              <div key={l.id} className="py-2 border-b border-gray-100 last:border-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileSpreadsheet className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-gray-700">{formatDate(l.fecha)}</span>
                      {l.nombre_archivo && <span className="text-xs text-gray-400 ml-2 break-all">{l.nombre_archivo}</span>}
                    </div>
                  </div>
                  {l.id === vigente?.id && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium flex-shrink-0">Vigente</span>
                  )}
                </div>
                {editLista === l.id ? editorDescLista(l) : (l.descripcion || esAdmin) && (
                  <p className="text-xs text-gray-500 italic flex items-center gap-1 ml-7">
                    {l.descripcion}
                    {esAdmin && pencilDescLista(l)}
                  </p>
                )}
              </div>
            ))}
          </div>
          {listas.length > 5 && (
            <button onClick={() => setVerTodas(!verTodas)} className="text-sm text-emerald-700 hover:text-emerald-800 mt-2">
              {verTodas ? 'Ver menos' : `Ver todas (${listas.length})`}
            </button>
          )}
        </div>
      )}

      {/* Modal confirmar reemplazo */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-800">Ya existe una lista con esta fecha</h3>
                <p className="text-sm text-gray-500">{variasFuentes ? `${fuente.nombre} · ` : ''}Fecha: {formatDate(modal.fecha)}</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              ¿Querés reemplazar la lista existente? Se reemplazarán todos sus costos por los del archivo nuevo.
            </p>
            {modal.afectadas.total > 0 && (
              <div className="text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 mb-4">
                Hay {modal.afectadas.total} cotización(es) hechas con esta lista
                {modal.afectadas.abiertas > 0 ? ` (${modal.afectadas.abiertas} todavía abierta/s)` : ''}.
                Sus precios ya guardados <strong>no cambian</strong>; solo se actualizan los costos de la lista para cotizaciones nuevas.
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Cancelar</button>
              <button
                onClick={async () => {
                  const m = modal;
                  setModal(null);
                  await procesarCarga(m.fecha, m.archivo, m.filas, true);
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
