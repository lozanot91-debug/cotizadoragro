import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Search, Loader2, FileText, MessageSquare, Package, Wand2, Plus } from 'lucide-react';
import { useData } from '@/hooks/useData';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/Toast';
import { useCargaSegura } from '@/hooks/useCargaSegura';
import ErrorCarga from '@/components/ErrorCarga';
import { PanelFicha } from '@/components/FichaProducto';
import { refrescarIndiceFichas } from '@/hooks/useIndiceFichas';
import { registrarCambio } from '@/lib/historial';
import { presentacion, sugerirGrupos, type ProductoLista } from '@/lib/catalogo';
import type { FichaProducto } from '@/types';

type Filtro = 'todas' | 'sin-marbete' | 'con-marbete';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Catálogo de productos: fichas con marbete, presentaciones y comentarios del equipo. */
export default function Catalogo() {
  const data = useData();
  const toast = useToast();
  const { usuario } = useAuth();
  const esAdmin = usuario.rol === 'admin';
  const [loading, setLoading] = useState(true);
  const [fichas, setFichas] = useState<FichaProducto[]>([]);
  const [codigos, setCodigos] = useState<{ cod: string; ficha_id: string }[]>([]);
  const [productos, setProductos] = useState<ProductoLista[]>([]);
  const [comentarios, setComentarios] = useState<Record<string, number>>({});
  const [tab, setTab] = useState<'fichas' | 'sin-ficha'>('fichas');
  const [q, setQ] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [familia, setFamilia] = useState('');
  const [abierta, setAbierta] = useState<{ fichaId?: string; cod?: string; nombre?: string } | null>(null);
  const [creando, setCreando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const r = await data.fetchCatalogo();
    setFichas(r.fichas); setCodigos(r.codigos); setProductos(r.productos); setComentarios(r.comentarios);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { load, reintentar, errorCarga } = useCargaSegura(cargar, setLoading);
  useEffect(() => { void load(); }, [load]);

  const porCod = useMemo(() => new Map(productos.map((p) => [p.cod, p])), [productos]);
  const codsDeFicha = useMemo(() => {
    const m = new Map<string, ProductoLista[]>();
    for (const c of codigos) m.set(c.ficha_id, [...(m.get(c.ficha_id) || []), porCod.get(c.cod) ?? { cod: c.cod, producto: c.cod, familia: null }]);
    return m;
  }, [codigos, porCod]);
  const familias = useMemo(() => [...new Set(productos.map((p) => p.familia).filter(Boolean) as string[])].sort(), [productos]);
  const sugerencias = useMemo(() => sugerirGrupos(productos, new Set(codigos.map((c) => c.cod))), [productos, codigos]);

  const fichasVisibles = fichas.filter((f) => {
    if (filtro === 'sin-marbete' && f.marbete_path) return false;
    if (filtro === 'con-marbete' && !f.marbete_path) return false;
    const cs = codsDeFicha.get(f.id) || [];
    if (familia && !cs.some((c) => c.familia === familia)) return false;
    if (!q.trim()) return true;
    const t = norm(q.trim());
    return norm(f.nombre).includes(t) || cs.some((c) => norm(`${c.producto} ${c.cod}`).includes(t));
  });
  const sugerenciasVisibles = sugerencias.filter((g) => (!familia || g.familia === familia) && (!q.trim() || g.codigos.some((c) => norm(`${c.producto} ${c.cod}`).includes(norm(q.trim())))));
  const conMarbete = fichas.filter((f) => f.marbete_path).length;

  async function crearGrupos(grupos: typeof sugerencias, clave: string) {
    if (grupos.length > 1 && !window.confirm(`Se van a crear ${grupos.length} fichas, una por cada grupo sugerido. Después podés cambiar nombres y mover presentaciones. ¿Seguir?`)) return;
    setCreando(clave);
    try {
      const r = await data.crearFichasLote(grupos.map((g) => ({ nombre: g.nombre, cods: g.codigos.map((c) => c.cod) })));
      await registrarCambio({ tipo: 'lista', entidad: 'Catálogo', campo: 'fichas', valor_nuevo: `${r.fichas} fichas`, detalle: `Creadas desde sugerencias · ${r.codigos} códigos` });
      toast.exito(r.fichas === 1 ? 'Ficha creada' : `${r.fichas} fichas creadas (${r.codigos} códigos)`);
      refrescarIndiceFichas();
      await cargar();
    } catch (e) { toast.error(e); } finally { setCreando(null); }
  }

  if (errorCarga && !loading) return <ErrorCarga error={errorCarga} onReintentar={reintentar} />;
  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-emerald-600 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Catálogo</h1>
        <p className="text-sm text-gray-500 mt-1">
          {fichas.length} fichas · {conMarbete} con marbete{sugerencias.length > 0 && ` · ${sugerencias.reduce((s, g) => s + g.codigos.length, 0)} códigos sin ficha`}
        </p>
      </div>

      <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit">
        <button onClick={() => setTab('fichas')} className={`px-3 py-1.5 rounded-md text-sm font-medium ${tab === 'fichas' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500'}`}>Fichas</button>
        <button onClick={() => setTab('sin-ficha')} className={`px-3 py-1.5 rounded-md text-sm font-medium ${tab === 'sin-ficha' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500'}`}>
          Sin ficha{sugerencias.length > 0 && <span className="ml-1.5 text-xs px-1.5 rounded-full bg-amber-100 text-amber-800">{sugerencias.length}</span>}
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto o código..." className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white" />
        </div>
        <div className="flex gap-2">
          <select aria-label="Familia" value={familia} onChange={(e) => setFamilia(e.target.value)} className="flex-1 min-w-0 sm:flex-none px-2.5 py-2 border border-gray-300 rounded-lg text-sm bg-white">
            <option value="">Todas las familias</option>
            {familias.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          {tab === 'fichas' && (
            <select aria-label="Marbete" value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)} className="flex-1 min-w-0 sm:flex-none px-2.5 py-2 border border-gray-300 rounded-lg text-sm bg-white">
              <option value="todas">Con y sin marbete</option>
              <option value="sin-marbete">Sin marbete</option>
              <option value="con-marbete">Con marbete</option>
            </select>
          )}
        </div>
      </div>

      {tab === 'fichas' ? (
        fichasVisibles.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
            <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-40" />
            {fichas.length === 0 ? (esAdmin ? 'Todavía no hay fichas. Andá a "Sin ficha" para crearlas a partir de la lista.' : 'Todavía no hay fichas cargadas.') : 'No hay fichas con ese filtro.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {fichasVisibles.map((f) => {
              const cs = codsDeFicha.get(f.id) || [];
              return (
                <button key={f.id} onClick={() => setAbierta({ fichaId: f.id })} className="text-left bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
                  <p className="font-semibold text-gray-800">{f.nombre}</p>
                  <p className="text-xs text-gray-400 truncate">{cs[0]?.familia || ''}</p>
                  <p className="mt-1.5 text-xs text-gray-600 flex items-center gap-1"><Package className="w-3.5 h-3.5 text-gray-400" /> {cs.map((c) => presentacion(c)).join(' · ') || 'Sin presentaciones'}</p>
                  <div className="mt-2 flex items-center gap-3 text-xs">
                    <span className={`flex items-center gap-1 ${f.marbete_path ? 'text-emerald-700' : 'text-amber-700'}`}><FileText className="w-3.5 h-3.5" /> {f.marbete_path ? 'Marbete' : 'Sin marbete'}</span>
                    {comentarios[f.id] ? <span className="flex items-center gap-1 text-gray-500"><MessageSquare className="w-3.5 h-3.5" /> {comentarios[f.id]}</span> : null}
                  </div>
                </button>
              );
            })}
          </div>
        )
      ) : (
        <div className="space-y-3">
          {esAdmin ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-emerald-900 max-w-xl">Agrupé los códigos por producto separando el envase del nombre (por ejemplo "A 35 T (X 5 LTRS)" y "A 35 T (X1L)" van juntos). Revisá y creá las fichas de a una, o todas juntas.</p>
              {sugerenciasVisibles.length > 1 && (
                <button onClick={() => void crearGrupos(sugerenciasVisibles, 'todas')} disabled={!!creando} className="px-3 py-2 bg-emerald-700 text-white rounded-lg text-sm font-medium hover:bg-emerald-800 disabled:opacity-50 flex items-center gap-1.5">
                  {creando === 'todas' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />} Crear las {sugerenciasVisibles.length} fichas
                </button>
              )}
            </div>
          ) : <p className="text-sm text-gray-500">Estos productos todavía no tienen ficha. Las crea el administrador.</p>}
          {sugerenciasVisibles.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">Todos los productos tienen ficha.</div>
          ) : (
            <ul className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {sugerenciasVisibles.slice(0, 300).map((g) => {
                const clave = `${g.familia}|${g.nombre}`;
                return (
                  <li key={clave} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-800">{g.nombre} <span className="text-xs font-normal text-gray-400">{g.familia}</span></p>
                      <p className="text-xs text-gray-500 truncate">{g.codigos.map((c) => `${presentacion(c)} (${c.cod})`).join(' · ')}</p>
                    </div>
                    {esAdmin && (
                      <button onClick={() => void crearGrupos([g], clave)} disabled={!!creando} className="flex-shrink-0 px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1">
                        {creando === clave ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Crear ficha
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {abierta && <PanelFicha fichaId={abierta.fichaId} cod={abierta.cod} nombreProducto={abierta.nombre} onCerrar={() => setAbierta(null)} onCambio={() => void cargar()} />}
    </div>
  );
}
