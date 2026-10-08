import { AuthProvider, useAuth, useSesion } from '@/context/AuthContext';
import AuthScreen from '@/screens/AuthScreen';
import { Loader2 } from 'lucide-react';
import { ToastProvider } from '@/components/Toast';
import Layout, { type Screen } from '@/components/Layout';
import Inicio from '@/screens/Inicio';
import NuevaCotizacion from '@/screens/NuevaCotizacion';
import Cotizaciones from '@/screens/Cotizaciones';
import Pipeline from '@/screens/Pipeline';
import Tareas from '@/screens/Tareas';
import Visitas from '@/screens/Visitas';
import Clientes from '@/screens/Clientes';
import Listas from '@/screens/Listas';
import Estadisticas from '@/screens/Estadisticas';
import ConfigScreen from '@/screens/ConfigScreen';
import Historial from '@/screens/Historial';
import Recotizar from '@/screens/Recotizar';
import Rentabilidad from '@/screens/Rentabilidad';
import Vencimientos from '@/screens/Vencimientos';
import Cobranzas from '@/screens/Cobranzas';
import EvolucionCostos from '@/screens/EvolucionCostos';
import PedidosMesa from '@/screens/PedidosMesa';
import PublicoMesa from '@/screens/PublicoMesa';
import { vencimientos } from '@/lib/vencimientos';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { hoyAR } from '@/lib/fechas';

function AppContent() {
  const { usuario } = useAuth();
  const [screen, setScreen] = useState<Screen>('inicio');
  const [editCotizId, setEditCotizId] = useState<string | undefined>(undefined);
  const [duplicateFromId, setDuplicateFromId] = useState<string | undefined>(undefined);
  const [taskBadge, setTaskBadge] = useState(0);
  const [vencBadge, setVencBadge] = useState(0);
  const [cobroBadge, setCobroBadge] = useState(0);
  const [pedidoBadge, setPedidoBadge] = useState(0);

  const loadTaskBadge = useCallback(async () => {
    const hoy = hoyAR();
    const { count } = await supabase
      .from('tareas')
      .select('*', { count: 'exact', head: true })
      .eq('estado', 'Pendiente')
      .lte('fecha_vencimiento', hoy);
    setTaskBadge(count || 0);
  }, []);

  /** Cotizaciones abiertas vencidas o que vencen en los próximos 3 días. */
  const loadVencBadge = useCallback(async () => {
    const { data } = await supabase
      .from('cotizaciones')
      .select('id, fecha, vigencia_dias, estado, numero')
      .in('estado', ['Borrador', 'Enviada', 'En negociación'])
      .limit(1000);
    setVencBadge(vencimientos((data || []) as never, hoyAR(), 3).length);
  }, []);

  /** Cobros pendientes que vencen hoy o ya están atrasados. */
  const loadCobroBadge = useCallback(async () => {
    const { count } = await supabase
      .from('cobranzas')
      .select('*', { count: 'exact', head: true })
      .eq('estado', 'Pendiente')
      .lte('vencimiento', hoyAR());
    setCobroBadge(count || 0);
  }, []);

  /** Pedidos a mesa con costos cargados sin aplicar, o con corrección pedida. */
  const loadPedidoBadge = useCallback(async () => {
    const { count } = await supabase
      .from('pedidos_precio')
      .select('*', { count: 'exact', head: true })
      .or('and(estado.eq.Respondido,aplicado_at.is.null),and(estado.eq.Respondido,correccion_solicitada.eq.true)');
    setPedidoBadge(count || 0);
  }, []);

  useEffect(() => { loadTaskBadge(); loadVencBadge(); loadCobroBadge(); loadPedidoBadge(); }, [loadTaskBadge, loadVencBadge, loadCobroBadge, loadPedidoBadge, screen]);

  // La mesa puede responder mientras la app está abierta: se revisa cada 2 minutos y al volver a la pestaña
  useEffect(() => {
    const t = setInterval(() => { void loadPedidoBadge(); }, 120000);
    const alVolver = () => { if (document.visibilityState === 'visible') void loadPedidoBadge(); };
    document.addEventListener('visibilitychange', alVolver);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', alVolver); };
  }, [loadPedidoBadge]);

  function handleNavigate(s: Screen) {
    setScreen(s);
    if (s === 'nueva') { setEditCotizId(undefined); setDuplicateFromId(undefined); }
  }

  function handleEditCotiz(id: string) {
    setEditCotizId(id); setDuplicateFromId(undefined); setScreen('nueva');
  }

  function handleDuplicateCotiz(id: string) {
    setDuplicateFromId(id); setEditCotizId(undefined); setScreen('nueva');
  }

  return (
    <Layout current={screen} onNavigate={handleNavigate} taskBadge={taskBadge} vencBadge={vencBadge} cobroBadge={cobroBadge} pedidoBadge={pedidoBadge}>
      {screen === 'inicio' && <Inicio onNavigate={handleNavigate} onEditCotiz={handleEditCotiz} pedidoBadge={pedidoBadge} />}
      {screen === 'nueva' && <NuevaCotizacion editId={editCotizId} duplicateFromId={duplicateFromId} onDeleted={() => handleNavigate('cotizaciones')} onAbrirGuardada={handleEditCotiz} />}
      {screen === 'pipeline' && <Pipeline onEdit={handleEditCotiz} />}
      {screen === 'cotizaciones' && <Cotizaciones onEdit={handleEditCotiz} onDuplicate={handleDuplicateCotiz} />}
      {screen === 'recotizar' && <Recotizar onEdit={handleEditCotiz} />}
      {screen === 'vencimientos' && <Vencimientos onEdit={handleEditCotiz} />}
      {screen === 'cobranzas' && <Cobranzas onEdit={handleEditCotiz} />}
      {screen === 'pedidos' && <PedidosMesa onEdit={handleEditCotiz} />}
      {screen === 'costos' && <EvolucionCostos />}
      {screen === 'rentabilidad' && <Rentabilidad onEdit={handleEditCotiz} />}
      {screen === 'tareas' && <Tareas />}
      {screen === 'visitas' && <Visitas />}
      {screen === 'clientes' && <Clientes />}
      {screen === 'listas' && <Listas />}
      {screen === 'estadisticas' && <Estadisticas />}
      {screen === 'config' && usuario.rol === 'admin' && <ConfigScreen />}
      {screen === 'historial' && <Historial />}
    </Layout>
  );
}

/** Sin sesión iniciada solo se ve la pantalla de ingreso. */
function Puerta() {
  const { cargando, usuario } = useSesion();
  if (cargando) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50"><Loader2 className="w-8 h-8 text-emerald-600 animate-spin" /></div>;
  }
  if (!usuario) return <AuthScreen />;
  return <AppContent />;
}

/** Link público de la mesa de insumos (?mesa=código): se abre sin usuario ni contraseña. */
function codigoMesa(): string | null {
  const t = new URLSearchParams(window.location.search).get('mesa');
  return t && /^[a-f0-9]{64}$/i.test(t) ? t : t ? 'invalido' : null;
}

export default function App() {
  const mesa = codigoMesa();
  if (mesa) {
    return <ToastProvider><PublicoMesa token={mesa} /></ToastProvider>;
  }
  return (
    <AuthProvider>
      <ToastProvider>
        <Puerta />
      </ToastProvider>
    </AuthProvider>
  );
}
