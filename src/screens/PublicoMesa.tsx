import { useCallback, useEffect, useState } from 'react';
import { Sprout, Loader2, Lock, FileDown, FileSpreadsheet, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { traducirError } from '@/lib/errores';
import { parseNumberInput, formatUSD, formatNumber } from '@/lib/format';
import { unidadCosto } from '@/lib/pedidosPrecio';
import { comprobanteExcel, comprobantePDF, type ComprobanteMesa } from '@/lib/mesaExport';
import { nombreCotizacion } from '@/lib/nombreCotizacion';

interface LineaPublica {
  id: string; cod: string; producto: string; unidad: string | null; es_fertilizante: boolean;
  cantidad: number; costo_usd: number | null; proveedor: string | null;
}
interface PedidoPublico {
  estado: 'NoExiste' | 'Cancelado' | 'Vencido' | 'Abierto' | 'Respondido';
  numero?: number; numero_cliente?: number | null; cliente?: string; vence_el?: string; nota?: string | null;
  respondido_por?: string | null; respondido_at?: string | null; nota_respuesta?: string | null;
  correccion_solicitada?: boolean; lineas?: LineaPublica[];
}

function fechaHora(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
}

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-emerald-900 text-white">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <div className="w-9 h-9 bg-amber-400 rounded-lg flex items-center justify-center"><Sprout className="w-5 h-5 text-emerald-900" /></div>
          <span className="titulo text-xl tracking-wide">Mesa de insumos</span>
        </div>
      </header>
      <main className="max-w-3xl mx-auto p-4 space-y-4">{children}</main>
    </div>
  );
}

function Mensaje({ icono, titulo, texto }: { icono: React.ReactNode; titulo: string; texto: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
      <div className="flex justify-center mb-3">{icono}</div>
      <h1 className="text-lg font-semibold text-gray-800">{titulo}</h1>
      <p className="text-sm text-gray-500 mt-1">{texto}</p>
    </div>
  );
}

export default function PublicoMesa({ token }: { token: string }) {
  const [pedido, setPedido] = useState<PedidoPublico | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [costos, setCostos] = useState<Record<string, string>>({});
  const [provs, setProvs] = useState<Record<string, string>>({});
  const [nombre, setNombre] = useState('');
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [mensajeCorr, setMensajeCorr] = useState('');
  const [pidiendo, setPidiendo] = useState(false);

  const cargar = useCallback(async () => {
    setErrorCarga(null);
    const { data, error } = await supabase.rpc('pedido_publico_obtener', { p_token: token });
    if (error) { setErrorCarga(traducirError(error)); return; }
    setPedido(data as PedidoPublico);
  }, [token]);

  useEffect(() => { void cargar(); }, [cargar]);

  async function guardar() {
    if (!pedido?.lineas) return;
    setErrorForm(null);
    if (nombre.trim().length < 2) { setErrorForm('Poné tu nombre para que sepamos quién cargó los costos.'); return; }
    const filas = pedido.lineas.map((l) => ({ id: l.id, costo_usd: parseNumberInput(costos[l.id] || ''), proveedor: (provs[l.id] || '').trim() }));
    if (filas.some((f) => !(f.costo_usd > 0))) { setErrorForm('Falta cargar el costo de uno o más productos (tiene que ser mayor a cero).'); return; }
    if (filas.some((f) => f.costo_usd >= 100000000)) { setErrorForm('Revisá los costos: hay un número demasiado grande.'); return; }
    if (!window.confirm('Al guardar, los costos quedan bloqueados y ya no vas a poder editarlos. ¿Guardar?')) return;
    setGuardando(true);
    const { data, error } = await supabase.rpc('pedido_publico_guardar', { p_token: token, p_nombre: nombre.trim(), p_nota: nota.trim(), p_costos: filas });
    setGuardando(false);
    if (error) { setErrorForm(traducirError(error)); return; }
    setPedido(data as PedidoPublico);
  }

  async function pedirCorreccion() {
    setErrorForm(null);
    if (mensajeCorr.trim().length < 3) { setErrorForm('Contanos qué hay que corregir.'); return; }
    setPidiendo(true);
    const { data, error } = await supabase.rpc('pedido_publico_pedir_correccion', { p_token: token, p_mensaje: mensajeCorr.trim() });
    setPidiendo(false);
    if (error) { setErrorForm(traducirError(error)); return; }
    setPedido(data as PedidoPublico);
    setMensajeCorr('');
  }

  if (errorCarga) {
    return <Marco><Mensaje icono={<AlertCircle className="w-10 h-10 text-red-500" />} titulo="No se pudo abrir el pedido" texto={errorCarga} /><button onClick={() => void cargar()} className="w-full py-3 bg-emerald-600 text-white rounded-lg font-medium">Reintentar</button></Marco>;
  }
  if (!pedido) {
    return <Marco><div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-emerald-600 animate-spin" /></div></Marco>;
  }
  if (pedido.estado === 'NoExiste') {
    return <Marco><Mensaje icono={<AlertCircle className="w-10 h-10 text-gray-400" />} titulo="El link no es válido" texto="Revisá que esté completo o pedí uno nuevo." /></Marco>;
  }
  if (pedido.estado === 'Cancelado') {
    return <Marco><Mensaje icono={<AlertCircle className="w-10 h-10 text-gray-400" />} titulo="Este pedido fue cancelado" texto="Pedí un link nuevo si todavía hace falta cargar costos." /></Marco>;
  }
  if (pedido.estado === 'Vencido') {
    return <Marco><Mensaje icono={<Clock className="w-10 h-10 text-amber-500" />} titulo="El link venció" texto="Pedí un link nuevo para cargar los costos." /></Marco>;
  }

  const lineas = pedido.lineas || [];
  const nombreCotiz = nombreCotizacion({ numero: pedido.numero, numero_cliente: pedido.numero_cliente, cliente_nombre: pedido.cliente });
  const cabecera = (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-xs uppercase tracking-wide text-gray-400">Pedido de costos</p>
      <h1 className="titulo text-2xl text-emerald-900 mt-0.5">{nombreCotiz}</h1>
      {pedido.nota && <p className="mt-2 text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-2">{pedido.nota}</p>}
    </div>
  );

  if (pedido.estado === 'Respondido') {
    const comprobante: ComprobanteMesa = {
      numero: pedido.numero || 0, nombre: nombreCotiz, cliente: pedido.cliente || '', respondidoPor: pedido.respondido_por || '',
      respondidoAt: pedido.respondido_at || new Date().toISOString(), nota: pedido.nota_respuesta || null, lineas,
    };
    return (
      <Marco>
        {cabecera}
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex gap-3">
          <Lock className="w-5 h-5 text-emerald-700 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-emerald-900">
            <p className="font-semibold">Costos guardados y bloqueados</p>
            <p>Cargados por {pedido.respondido_por}{pedido.respondido_at ? ` el ${fechaHora(pedido.respondido_at)}` : ''} — ya no se pueden editar desde acá.</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {lineas.map((l) => (
            <div key={l.id} className="p-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-gray-800">{l.producto}</p>
                <p className="text-xs text-gray-400">{l.cod} · {formatNumber(l.cantidad, l.cantidad % 1 === 0 ? 0 : 2)} {l.es_fertilizante ? 'tn' : l.unidad || 'un'}{l.proveedor ? ` · ${l.proveedor}` : ''}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="cifra text-lg text-gray-900">USD {formatUSD(l.costo_usd || 0)}</p>
                <p className="text-xs text-gray-400">{unidadCosto(l).replace('USD ', '')}</p>
              </div>
            </div>
          ))}
        </div>
        {pedido.nota_respuesta && <p className="text-sm text-gray-600 bg-white rounded-xl border border-gray-200 p-4"><strong>Tu nota:</strong> {pedido.nota_respuesta}</p>}
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => comprobanteExcel(comprobante)} className="py-3 bg-white border border-gray-300 rounded-lg font-medium text-gray-700 flex items-center justify-center gap-2"><FileSpreadsheet className="w-4 h-4" /> Bajar Excel</button>
          <button onClick={() => comprobantePDF(comprobante)} className="py-3 bg-white border border-gray-300 rounded-lg font-medium text-gray-700 flex items-center justify-center gap-2"><FileDown className="w-4 h-4" /> Bajar PDF</button>
        </div>
        {pedido.correccion_solicitada ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900 flex gap-3">
            <Clock className="w-5 h-5 flex-shrink-0" />
            <p><strong>Pediste una corrección.</strong> Cuando te la habiliten, volvé a abrir este mismo link.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
            <p className="text-sm font-medium text-gray-700">¿Hay algo para corregir?</p>
            <p className="text-xs text-gray-500">Avisanos qué cambiar. Lo tiene que habilitar el equipo comercial; no se puede editar directamente.</p>
            <textarea value={mensajeCorr} onChange={(e) => setMensajeCorr(e.target.value)} rows={2} maxLength={500} placeholder="Ej: el costo del producto X está mal, es 120" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
            {errorForm && <p className="text-sm text-red-600">{errorForm}</p>}
            <button onClick={() => void pedirCorreccion()} disabled={pidiendo} className="w-full py-3 bg-amber-500 text-white rounded-lg font-medium disabled:opacity-50">{pidiendo ? 'Enviando…' : 'Pedir corrección'}</button>
          </div>
        )}
      </Marco>
    );
  }

  // Abierto: la mesa carga los costos
  return (
    <Marco>
      {cabecera}
      <p className="text-sm text-gray-600 px-1">Cargá el costo de cada producto. {pedido.vence_el && <>El link vence el {fechaHora(pedido.vence_el)} — </>}al guardar queda bloqueado.</p>
      <div className="space-y-3">
        {lineas.map((l) => (
          <div key={l.id} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <div>
              <p className="font-medium text-gray-800">{l.producto}</p>
              <p className="text-xs text-gray-400">{l.cod} · Cantidad: {formatNumber(l.cantidad, l.cantidad % 1 === 0 ? 0 : 2)} {l.es_fertilizante ? 'tn' : l.unidad || 'un'}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-gray-500">Costo ({unidadCosto(l)})</span>
                <input type="text" inputMode="decimal" value={costos[l.id] || ''} onChange={(e) => setCostos({ ...costos, [l.id]: e.target.value })} placeholder="0,00" className="mt-1 w-full px-3 py-3 border border-gray-300 rounded-lg text-base text-right focus:ring-2 focus:ring-emerald-500 outline-none" />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">Proveedor (opcional)</span>
                <input type="text" value={provs[l.id] || ''} maxLength={100} onChange={(e) => setProvs({ ...provs, [l.id]: e.target.value })} className="mt-1 w-full px-3 py-3 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-emerald-500 outline-none" />
              </label>
            </div>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <label className="block">
          <span className="text-xs text-gray-500">Tu nombre</span>
          <input type="text" value={nombre} maxLength={100} onChange={(e) => setNombre(e.target.value)} className="mt-1 w-full px-3 py-3 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-emerald-500 outline-none" />
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">Nota (opcional)</span>
          <textarea value={nota} maxLength={500} rows={2} onChange={(e) => setNota(e.target.value)} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-emerald-500 outline-none" />
        </label>
        {errorForm && <p className="text-sm text-red-600 flex gap-2"><AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />{errorForm}</p>}
        <button onClick={() => void guardar()} disabled={guardando} className="w-full py-3.5 bg-emerald-600 text-white rounded-lg font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
          {guardando ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />} Guardar y bloquear
        </button>
      </div>
    </Marco>
  );
}
