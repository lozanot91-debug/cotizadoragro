import { useState, useEffect, useCallback } from 'react';
import ConveniosFlete from '@/components/ConveniosFlete';
import PlantasFlete from '@/components/PlantasFlete';
import TarjetaFuenteLista, { type CambioCosto, type ResultadoCarga } from '@/components/TarjetaFuenteLista';
import { useData } from '@/hooks/useData';
import { useAuth } from '@/context/AuthContext';
import { formatUSD } from '@/lib/format';
import { traducirError } from '@/lib/errores';
import { esNombreRepetido } from '@/lib/fuentesLista';
import type { FuenteLista, ListaCostos } from '@/types';
import { AlertCircle, Check, Loader2, TrendingUp, Plus } from 'lucide-react';
import { useCargaSegura } from '@/hooks/useCargaSegura';
import ErrorCarga from '@/components/ErrorCarga';

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none';

export default function Listas() {
  const { usuario } = useAuth();
  // Los vendedores ven las listas y los costos, pero solo el admin puede cargarlas
  const esAdmin = usuario.rol === 'admin';
  const data = useData();
  const [fuentes, setFuentes] = useState<FuenteLista[]>([]);
  const [listas, setListas] = useState<ListaCostos[]>([]);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [mensaje, setMensaje] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const [cambiosCosto, setCambiosCosto] = useState<CambioCosto[] | null>(null);
  const [fuenteCambios, setFuenteCambios] = useState('');
  const [cotizAfectadas, setCotizAfectadas] = useState<{ numero: number; nombre: string }[]>([]);

  // Nueva lista de precios (fuente)
  const [creando, setCreando] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevaDesc, setNuevaDesc] = useState('');
  const [nuevoPrefijo, setNuevoPrefijo] = useState('');
  const [errorNueva, setErrorNueva] = useState('');
  const [guardandoNueva, setGuardandoNueva] = useState(false);

  const cargar = useCallback(async () => {
    const [fs, ls] = await Promise.all([data.fetchFuentes(), data.fetchListas()]);
    setFuentes(fs);
    setListas(ls);
    setVersion((v) => v + 1);
  }, []);

  const { load, reintentar, errorCarga } = useCargaSegura(cargar, setLoading);

  useEffect(() => { load(); }, [load]);

  const variasFuentes = fuentes.length > 1;

  function recibirResultado(f: FuenteLista, r: ResultadoCarga) {
    setMensaje(r.mensaje);
    if (r.cambios !== undefined) {
      setCambiosCosto(r.cambios);
      setCotizAfectadas(r.afectadas ?? []);
      setFuenteCambios(f.nombre);
    }
  }

  async function crearNueva() {
    if (!nuevoNombre.trim()) { setErrorNueva('Poné un nombre'); return; }
    setGuardandoNueva(true);
    setErrorNueva('');
    try {
      await data.crearFuente({ nombre: nuevoNombre, descripcion: nuevaDesc, prefijo_cod: nuevoPrefijo });
      setCreando(false);
      setNuevoNombre(''); setNuevaDesc(''); setNuevoPrefijo('');
      await load();
    } catch (err) {
      setErrorNueva(esNombreRepetido(err) ? 'Ya hay una lista con ese nombre' : traducirError(err));
    }
    setGuardandoNueva(false);
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

      {/* Un casillero por tipo de lista de precios */}
      <div className="grid grid-cols-1 gap-4">
        {fuentes.map((f) => (
          <TarjetaFuenteLista
            key={f.id}
            fuente={f}
            listas={listas.filter((l) => l.fuente_id === f.id)}
            esAdmin={esAdmin}
            variasFuentes={variasFuentes}
            version={version}
            onCambio={() => { void load(); }}
            onResultado={(r) => recibirResultado(f, r)}
          />
        ))}
      </div>

      {esAdmin && (
        creando ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-2">
            <h3 className="font-semibold text-gray-800">Nueva lista de precios</h3>
            <input value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} placeholder="Nombre (ej. Híbridos)" aria-label="Nombre" className={inputCls} />
            <input value={nuevaDesc} onChange={(e) => setNuevaDesc(e.target.value)} placeholder="Descripción (opcional)" aria-label="Descripción" className={inputCls} />
            <div>
              <input value={nuevoPrefijo} onChange={(e) => setNuevoPrefijo(e.target.value)} placeholder="Prefijo de códigos (opcional)" aria-label="Prefijo de códigos" className={inputCls} />
              <p className="text-xs text-gray-400 mt-1">Se antepone a cada código del archivo. Dejalo vacío para la lista principal.</p>
            </div>
            {errorNueva && <p className="text-sm text-red-600">{errorNueva}</p>}
            <div className="flex gap-2">
              <button onClick={() => void crearNueva()} disabled={guardandoNueva} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:opacity-50">Crear</button>
              <button onClick={() => { setCreando(false); setErrorNueva(''); }} className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Cancelar</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setCreando(true)} className="flex items-center gap-2 px-4 py-2 border border-emerald-600 text-emerald-700 rounded-lg text-sm hover:bg-emerald-50">
            <Plus className="w-4 h-4" /> Nueva lista de precios
          </button>
        )
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
            <TrendingUp className="w-5 h-5" /> Productos que cambiaron de costo{variasFuentes ? ` (${fuenteCambios})` : ''}
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
                    {c.nombre}
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
    </div>
  );
}
