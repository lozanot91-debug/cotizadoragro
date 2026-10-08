import { useCallback, useEffect, useRef, useState } from 'react';
import { Info, X, Loader2, FileText, Download, Upload, Trash2, Pencil, Package, MessageSquare, Plus, Check } from 'lucide-react';
import { useData } from '@/hooks/useData';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/Toast';
import { refrescarIndiceFichas, useIndiceFichas } from '@/hooks/useIndiceFichas';
import { registrarCambio } from '@/lib/historial';
import { formatearFechaHora } from '@/lib/fechas';
import { ETIQUETAS_COMENTARIO, pesoLegible, presentacion, rutaMarbete, separarEnvase, validarComentario, validarMarbete, type ProductoLista } from '@/lib/catalogo';
import type { ComentarioFicha, FichaProducto as Ficha } from '@/types';

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white';
const COLOR_ETIQUETA: Record<string, string> = {
  Manejo: 'bg-sky-100 text-sky-800',
  Posicionamiento: 'bg-amber-100 text-amber-800',
  'Técnico': 'bg-violet-100 text-violet-800',
};

/** Ícono "i" que abre la ficha del producto sin salir de la pantalla. */
export function BotonFicha({ cod, producto, className = '' }: { cod: string; producto?: string | null; className?: string }) {
  const indice = useIndiceFichas();
  const [abierto, setAbierto] = useState(false);
  const info = indice[cod];
  return (
    <>
      <button type="button" onClick={(e) => { e.stopPropagation(); setAbierto(true); }}
        title={info ? (info.conMarbete ? 'Ver ficha y marbete' : 'Ver ficha (sin marbete)') : 'Ficha del producto'}
        aria-label={`Ficha de ${producto || cod}`}
        className={`inline-flex items-center justify-center w-6 h-6 rounded-full flex-shrink-0 align-middle ${info?.conMarbete ? 'text-emerald-700 hover:bg-emerald-50' : info ? 'text-gray-500 hover:bg-gray-100' : 'text-gray-300 hover:bg-gray-100 hover:text-gray-500'} ${className}`}>
        <Info className="w-4 h-4" />
      </button>
      {abierto && <PanelFicha cod={cod} fichaId={info?.fichaId} nombreProducto={producto ?? undefined} onCerrar={() => setAbierto(false)} />}
    </>
  );
}

/** Panel lateral con presentaciones, marbete y comentarios. */
export function PanelFicha({ cod, fichaId: fichaIdInicial, nombreProducto, onCerrar, onCambio }: {
  cod?: string; fichaId?: string; nombreProducto?: string; onCerrar: () => void; onCambio?: () => void;
}) {
  const data = useData();
  const toast = useToast();
  const { usuario } = useAuth();
  const esAdmin = usuario.rol === 'admin';
  const [fichaId, setFichaId] = useState<string | undefined>(fichaIdInicial);
  const [cargando, setCargando] = useState(true);
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [codigos, setCodigos] = useState<ProductoLista[]>([]);
  const [comentarios, setComentarios] = useState<ComentarioFicha[]>([]);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [editandoNombre, setEditandoNombre] = useState<string | null>(null);
  const [agregando, setAgregando] = useState<{ q: string; libres: ProductoLista[] } | null>(null);
  const archivoRef = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    try {
      let id = fichaId;
      if (!id && cod) {
        const indice = await data.fetchIndiceFichas();
        id = indice[cod]?.fichaId;
        if (id) setFichaId(id);
      }
      if (!id) { setFicha(null); return; }
      const r = await data.fetchFicha(id);
      setFicha(r?.ficha ?? null);
      setCodigos(r?.codigos ?? []);
      setComentarios(r?.comentarios ?? []);
    } catch (e) { toast.error(e); } finally { setCargando(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fichaId, cod]);
  useEffect(() => { void cargar(); }, [cargar]);

  // Cerrar con Escape
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onCerrar]);

  async function correr(clave: string, fn: () => Promise<void>, ok?: string, refrescar = true) {
    setOcupado(clave);
    try {
      await fn();
      if (ok) toast.exito(ok);
      if (refrescar) { refrescarIndiceFichas(); onCambio?.(); await cargar(); }
    } catch (e) { toast.error(e); } finally { setOcupado(null); }
  }

  async function abrirMarbete(descargar: boolean) {
    if (!ficha?.marbete_path) return;
    // La ventana se abre antes de pedir el link: si no, el celular la bloquea
    const w = descargar ? null : window.open('', '_blank');
    try {
      const url = await data.urlMarbete(ficha.marbete_path, descargar ? (ficha.marbete_nombre || `Marbete ${ficha.nombre}.pdf`) : undefined);
      if (w) w.location.href = url; else window.location.href = url;
    } catch (e) { w?.close(); toast.error(e); }
  }

  function elegirArchivo(file: File) {
    if (!ficha) return;
    const err = validarMarbete(file);
    if (err) { toast.aviso(err); return; }
    void correr('marbete', async () => {
      await data.subirMarbete(ficha, file, usuario.nombre || '', rutaMarbete(ficha.id, file.name));
      await registrarCambio({ tipo: 'lista', entidad: `Ficha ${ficha.nombre}`, campo: 'marbete', valor_anterior: ficha.marbete_nombre, valor_nuevo: file.name });
    }, ficha.marbete_path ? 'Marbete reemplazado' : 'Marbete subido');
  }

  async function crearFichaDesdeCodigo() {
    if (!cod) return;
    const nombre = separarEnvase(nombreProducto || cod).base;
    await correr('crear', async () => {
      const f = await data.crearFicha(nombre, [cod]);
      setFichaId(f.id);
      await registrarCambio({ tipo: 'lista', entidad: `Ficha ${nombre}`, campo: 'ficha', valor_nuevo: nombre, detalle: 'Ficha creada' });
    }, 'Ficha creada. Ya podés subir el marbete y agregar presentaciones.');
  }

  async function abrirAgregar() {
    try {
      const cat = await data.fetchCatalogo();
      const ocupados = new Set(cat.codigos.map((c) => c.cod));
      const base = ficha ? separarEnvase(ficha.nombre).base.toUpperCase() : '';
      const libres = cat.productos.filter((p) => !ocupados.has(p.cod));
      // Primero los que se parecen al nombre de la ficha
      libres.sort((a, b) => Number(separarEnvase(b.producto).base.toUpperCase() === base) - Number(separarEnvase(a.producto).base.toUpperCase() === base) || a.producto.localeCompare(b.producto, 'es'));
      setAgregando({ q: '', libres });
    } catch (e) { toast.error(e); }
  }

  const titulo = ficha?.nombre || (nombreProducto ? separarEnvase(nombreProducto).base : cod) || 'Producto';

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`Ficha de ${titulo}`}>
      <div className="absolute inset-0 bg-black/40" onClick={onCerrar} />
      <aside className="relative bg-white w-full max-w-lg h-full shadow-2xl flex flex-col">
        <header className="px-5 py-4 border-b border-gray-200 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-gray-400">Ficha del producto</p>
            {editandoNombre !== null ? (
              <div className="flex gap-1 mt-1">
                <input autoFocus value={editandoNombre} onChange={(e) => setEditandoNombre(e.target.value)} className={inputCls} aria-label="Nombre de la ficha" />
                <button onClick={() => ficha && editandoNombre.trim() && void correr('nombre', async () => { await data.renombrarFicha(ficha.id, editandoNombre); setEditandoNombre(null); }, 'Nombre guardado')}
                  className="px-2.5 bg-emerald-700 text-white rounded-lg" aria-label="Guardar nombre"><Check className="w-4 h-4" /></button>
                <button onClick={() => setEditandoNombre(null)} className="px-2.5 text-gray-500 hover:bg-gray-100 rounded-lg" aria-label="Cancelar"><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-1.5">
                <span className="truncate">{titulo}</span>
                {esAdmin && ficha && <button onClick={() => setEditandoNombre(ficha.nombre)} className="p-1 text-gray-300 hover:text-gray-600" aria-label="Cambiar nombre"><Pencil className="w-3.5 h-3.5" /></button>}
              </h2>
            )}
          </div>
          <button onClick={onCerrar} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg" aria-label="Cerrar ficha"><X className="w-5 h-5" /></button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {cargando ? <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-emerald-600 animate-spin" /></div> : !ficha ? (
            <div className="text-center py-10">
              <Package className="w-10 h-10 mx-auto text-gray-300 mb-2" />
              <p className="font-medium text-gray-700">Este producto todavía no tiene ficha</p>
              {esAdmin ? (
                <>
                  <p className="text-sm text-gray-500 mt-1">Creala para subir el marbete y que el equipo pueda comentar.</p>
                  <button onClick={() => void crearFichaDesdeCodigo()} disabled={!!ocupado || !cod} className="mt-4 px-4 py-2 bg-emerald-700 text-white rounded-lg text-sm font-medium hover:bg-emerald-800 disabled:opacity-50 inline-flex items-center gap-2">
                    {ocupado === 'crear' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Crear ficha
                  </button>
                </>
              ) : <p className="text-sm text-gray-500 mt-1">La tiene que crear el administrador desde el Catálogo.</p>}
            </div>
          ) : (
            <>
              {/* Marbete */}
              <section>
                <h3 className="font-semibold text-gray-700 mb-2 flex items-center gap-2"><FileText className="w-4 h-4 text-gray-400" /> Marbete</h3>
                {ficha.marbete_path ? (
                  <div className="rounded-lg border border-gray-200 p-3">
                    <p className="text-sm text-gray-800 truncate">{ficha.marbete_nombre || 'Marbete.pdf'}</p>
                    <p className="text-xs text-gray-400">{pesoLegible(ficha.marbete_bytes)}{ficha.marbete_subido_at ? ` · subido ${formatearFechaHora(ficha.marbete_subido_at)}` : ''}{ficha.marbete_subido_por ? ` por ${ficha.marbete_subido_por}` : ''}</p>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <button onClick={() => void abrirMarbete(false)} className="px-3 py-1.5 bg-emerald-700 text-white rounded-lg text-sm font-medium hover:bg-emerald-800 flex items-center gap-1.5"><FileText className="w-4 h-4" /> Ver marbete</button>
                      <button onClick={() => void abrirMarbete(true)} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-1.5"><Download className="w-4 h-4" /> Descargar</button>
                      {esAdmin && <>
                        <button onClick={() => archivoRef.current?.click()} disabled={!!ocupado} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-1.5 disabled:opacity-50">{ocupado === 'marbete' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Reemplazar</button>
                        <button onClick={() => window.confirm('¿Quitar el marbete de esta ficha?') && void correr('quitar', async () => { await data.quitarMarbete(ficha); }, 'Marbete quitado')} disabled={!!ocupado} className="px-2 py-1.5 text-gray-400 hover:text-red-600 rounded-lg" aria-label="Quitar marbete"><Trash2 className="w-4 h-4" /></button>
                      </>}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-gray-300 p-4 text-center">
                    <p className="text-sm text-gray-500">Todavía no se subió el marbete.</p>
                    {esAdmin && (
                      <button onClick={() => archivoRef.current?.click()} disabled={!!ocupado} className="mt-2 px-3 py-1.5 bg-emerald-700 text-white rounded-lg text-sm font-medium hover:bg-emerald-800 disabled:opacity-50 inline-flex items-center gap-1.5">
                        {ocupado === 'marbete' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Subir marbete (PDF, hasta 5 MB)
                      </button>
                    )}
                  </div>
                )}
                <input ref={archivoRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) elegirArchivo(f); e.target.value = ''; }} />
              </section>

              {/* Presentaciones */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-gray-700 flex items-center gap-2"><Package className="w-4 h-4 text-gray-400" /> Presentaciones</h3>
                  {esAdmin && !agregando && <button onClick={() => void abrirAgregar()} className="text-sm text-emerald-700 hover:text-emerald-800 flex items-center gap-1"><Plus className="w-4 h-4" /> Agregar</button>}
                </div>
                <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
                  {codigos.map((c) => (
                    <li key={c.cod} className="px-3 py-2 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800">{presentacion(c)}</p>
                        <p className="text-xs text-gray-400 truncate">{c.producto} · {c.cod}</p>
                      </div>
                      {esAdmin && codigos.length > 1 && (
                        <button onClick={() => void correr(`q-${c.cod}`, async () => { await data.quitarCodigoFicha(c.cod); }, 'Presentación quitada')} disabled={!!ocupado} className="p-1.5 text-gray-300 hover:text-red-600" aria-label={`Quitar ${c.producto}`}><X className="w-4 h-4" /></button>
                      )}
                    </li>
                  ))}
                </ul>
                {agregando && (
                  <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50/40 p-2 space-y-2">
                    <input autoFocus value={agregando.q} onChange={(e) => setAgregando({ ...agregando, q: e.target.value })} placeholder="Buscar código o producto sin ficha..." className={inputCls} />
                    <ul className="max-h-56 overflow-y-auto divide-y divide-gray-100 bg-white rounded-lg border border-gray-200">
                      {agregando.libres.filter((p) => !agregando.q || `${p.producto} ${p.cod}`.toLowerCase().includes(agregando.q.toLowerCase())).slice(0, 40).map((p) => (
                        <li key={p.cod}>
                          <button onClick={() => void correr(`a-${p.cod}`, async () => { await data.agregarCodigosFicha(ficha.id, [p.cod]); setAgregando((a) => a && { ...a, libres: a.libres.filter((x) => x.cod !== p.cod) }); }, 'Presentación agregada')}
                            className="w-full text-left px-3 py-2 hover:bg-emerald-50 text-sm">
                            <span className="font-medium text-gray-800">{p.producto}</span> <span className="text-xs text-gray-400">{p.cod} · {presentacion(p)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                    <button onClick={() => setAgregando(null)} className="text-xs text-gray-500 hover:underline">Listo</button>
                  </div>
                )}
              </section>

              {/* Comentarios */}
              <Comentarios ficha={ficha} comentarios={comentarios} onCambio={() => { onCambio?.(); void cargar(); }} />

              {esAdmin && (
                <div className="pt-2 border-t border-gray-100">
                  <button onClick={() => window.confirm(`¿Eliminar la ficha "${ficha.nombre}"? Se borran el marbete y los comentarios. Los productos siguen en la lista.`) && void correr('eliminar', async () => {
                    await data.eliminarFicha(ficha);
                    await registrarCambio({ tipo: 'lista', entidad: `Ficha ${ficha.nombre}`, campo: 'ficha', valor_anterior: ficha.nombre, valor_nuevo: null, detalle: 'Ficha eliminada' });
                    refrescarIndiceFichas(); onCambio?.(); onCerrar();
                  }, 'Ficha eliminada', false)} className="text-sm text-red-600 hover:text-red-700 flex items-center gap-1.5"><Trash2 className="w-4 h-4" /> Eliminar ficha</button>
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function Comentarios({ ficha, comentarios, onCambio }: { ficha: Ficha; comentarios: ComentarioFicha[]; onCambio: () => void }) {
  const data = useData();
  const toast = useToast();
  const { usuario } = useAuth();
  const [texto, setTexto] = useState('');
  const [etiqueta, setEtiqueta] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [editando, setEditando] = useState<{ id: string; texto: string; etiqueta: string } | null>(null);
  const [filtro, setFiltro] = useState('');

  async function publicar() {
    const err = validarComentario(texto, etiqueta);
    if (err) { setError(err); return; }
    setGuardando(true); setError(null);
    try { await data.comentarFicha(ficha.id, texto, etiqueta || null); setTexto(''); setEtiqueta(''); onCambio(); } catch (e) { toast.error(e); } finally { setGuardando(false); }
  }
  async function guardarEdicion() {
    if (!editando) return;
    const err = validarComentario(editando.texto, editando.etiqueta);
    if (err) { toast.aviso(err); return; }
    try { await data.editarComentarioFicha(editando.id, editando.texto, editando.etiqueta || null); setEditando(null); onCambio(); } catch (e) { toast.error(e); }
  }
  async function borrar(c: ComentarioFicha) {
    if (!window.confirm('¿Borrar este comentario?')) return;
    try { await data.borrarComentarioFicha(c.id); onCambio(); } catch (e) { toast.error(e); }
  }

  const visibles = filtro ? comentarios.filter((c) => c.etiqueta === filtro) : comentarios;

  return (
    <section>
      <h3 className="font-semibold text-gray-700 mb-2 flex items-center gap-2"><MessageSquare className="w-4 h-4 text-gray-400" /> Comentarios del equipo {comentarios.length > 0 && <span className="text-xs font-normal text-gray-400">({comentarios.length})</span>}</h3>
      <div className="rounded-lg border border-gray-200 p-3 space-y-2">
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} maxLength={2000} placeholder="Manejo, posicionamiento, algo técnico que aprendimos con este producto..." className={inputCls} aria-label="Nuevo comentario" />
        <div className="flex flex-wrap items-center gap-2">
          <select value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} className="px-2.5 py-2 border border-gray-300 rounded-lg text-sm bg-white" aria-label="Etiqueta del comentario">
            <option value="">Sin etiqueta</option>
            {ETIQUETAS_COMENTARIO.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
          <button onClick={() => void publicar()} disabled={guardando || !texto.trim()} className="ml-auto px-3 py-2 bg-emerald-700 text-white rounded-lg text-sm font-medium hover:bg-emerald-800 disabled:opacity-50 flex items-center gap-1.5">
            {guardando && <Loader2 className="w-4 h-4 animate-spin" />} Comentar
          </button>
        </div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      </div>

      {comentarios.length > 1 && (
        <div className="flex flex-wrap gap-1 mt-3">
          {['', ...ETIQUETAS_COMENTARIO].map((e) => (
            <button key={e || 'todos'} onClick={() => setFiltro(e)} className={`px-2 py-1 rounded-full text-xs font-medium ${filtro === e ? 'bg-emerald-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{e || 'Todos'}</button>
          ))}
        </div>
      )}

      <ul className="mt-3 space-y-3">
        {visibles.map((c) => {
          const mio = c.autor_id === usuario.id;
          const puedeBorrar = mio || usuario.rol === 'admin';
          return (
            <li key={c.id} className="rounded-lg bg-gray-50 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-gray-500">
                  <span className="font-medium text-gray-700">{c.autor_nombre || 'Alguien'}</span> · {formatearFechaHora(c.created_at)}{c.updated_at !== c.created_at && new Date(c.updated_at).getTime() - new Date(c.created_at).getTime() > 1000 ? ' · editado' : ''}
                  {c.etiqueta && <span className={`ml-2 px-1.5 py-0.5 rounded font-medium ${COLOR_ETIQUETA[c.etiqueta] || 'bg-gray-200 text-gray-700'}`}>{c.etiqueta}</span>}
                </p>
                <div className="flex gap-0.5">
                  {mio && <button onClick={() => setEditando({ id: c.id, texto: c.texto, etiqueta: c.etiqueta || '' })} className="p-1 text-gray-300 hover:text-gray-600" aria-label="Editar comentario"><Pencil className="w-3.5 h-3.5" /></button>}
                  {puedeBorrar && <button onClick={() => void borrar(c)} className="p-1 text-gray-300 hover:text-red-600" aria-label="Borrar comentario"><Trash2 className="w-3.5 h-3.5" /></button>}
                </div>
              </div>
              {editando?.id === c.id ? (
                <div className="mt-2 space-y-2">
                  <textarea value={editando.texto} onChange={(e) => setEditando({ ...editando, texto: e.target.value })} rows={3} maxLength={2000} className={inputCls} aria-label="Editar comentario" />
                  <div className="flex gap-2">
                    <select value={editando.etiqueta} onChange={(e) => setEditando({ ...editando, etiqueta: e.target.value })} className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm bg-white" aria-label="Etiqueta">
                      <option value="">Sin etiqueta</option>
                      {ETIQUETAS_COMENTARIO.map((e) => <option key={e} value={e}>{e}</option>)}
                    </select>
                    <button onClick={() => void guardarEdicion()} className="ml-auto px-3 py-1.5 bg-emerald-700 text-white rounded-lg text-sm">Guardar</button>
                    <button onClick={() => setEditando(null)} className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Cancelar</button>
                  </div>
                </div>
              ) : <p className="mt-1 text-sm text-gray-800 whitespace-pre-line">{c.texto}</p>}
            </li>
          );
        })}
        {comentarios.length === 0 && <li className="text-sm text-gray-400">Todavía no hay comentarios.</li>}
      </ul>
    </section>
  );
}
