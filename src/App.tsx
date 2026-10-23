import { AuthProvider, useAuth, useSesion } from '@/context/AuthContext';
import AuthScreen from '@/screens/AuthScreen';
import CuentaPendiente from '@/components/CuentaPendiente';
import { Loader2 } from 'lucide-react';
import { ToastProvider } from '@/components/Toast';
import Layout, { type Screen } from '@/components/Layout';
import Inicio from '@/screens/Inicio';
import { useState, useEffect, useCallback, Suspense } from 'react';
import { lazyConRecarga } from '@/lib/lazy';
import { supabase } from '@/lib/supabase';
import { hoyAR } from '@/lib/fechas';
import type { CanjeGuardado } from '@/types';
const Mapa = lazyConRecarga(() => import('@/screens/Mapa'));
const NuevaCotizacion = lazyConRecarga(() => import('@/screens/NuevaCotizacion'));
const Cotizaciones = lazyConRecarga(() => import('@/screens/Cotizaciones'));
const Pipeline = lazyConRecarga(() => import('@/screens/Pipeline'));
const Tareas = lazyConRecarga(() => import('@/screens/Tareas'));
const Visitas = lazyConRecarga(() => import('@/screens/Visitas'));
const Clientes = lazyConRecarga(() => import('@/screens/Clientes'));
const Listas = lazyConRecarga(() => import('@/screens/Listas'));
const Estadisticas = lazyConRecarga(() => import('@/screens/Estadisticas'));
const ConfigScreen = lazyConRecarga(() => import('@/screens/ConfigScreen'));
const Historial = lazyConRecarga(() => import('@/screens/Historial'));
const Recotizar = lazyConRecarga(() => import('@/screens/Recotizar'));
const Rentabilidad = lazyConRecarga(() => import('@/screens/Rentabilidad'));
const Vencimientos = lazyConRecarga(() => import('@/screens/Vencimientos'));
const Cobranzas = lazyConRecarga(() => import('@/screens/Cobranzas'));
const ConsultaCostos = lazyConRecarga(() => import('@/screens/ConsultaCostos'));
const CalculadoraCanje = lazyConRecarga(() => import('@/screens/CalculadoraCanje'));
const FormasPago = lazyConRecarga(() => import('@/screens/FormasPago'));
const RelacionInsumoGrano = lazyConRecarga(() => import('@/screens/RelacionInsumoGrano'));
const Competencia = lazyConRecarga(() => import('@/screens/Competencia'));
const ResumenSemanal = lazyConRecarga(() => import('@/screens/ResumenSemanal'));
const EvolucionCostos = lazyConRecarga(() => import('@/screens/EvolucionCostos'));
const PedidosMesa = lazyConRecarga(() => import('@/screens/PedidosMesa'));
const PublicoMesa = lazyConRecarga(() => import('@/screens/PublicoMesa'));
const PublicoFacturacion = lazyConRecarga(() => import('@/screens/PublicoFacturacion'));
const Facturacion = lazyConRecarga(() => import('@/screens/Facturacion'));
const Catalogo = lazyConRecarga(() => import('@/screens/Catalogo'));

function AppContent() {
  const { usuario } = useAuth();
  const [screen, setScreen] = useState<Screen>('inicio');
  const [editCotizId, setEditCotizId] = useState<string | undefined>(undefined);
  const [duplicateFromId, setDuplicateFromId] = useState<string | undefined>(undefined);
  // Cliente con el que se abre la calculadora de canje (desde la ficha del cliente)
  const [canjeClienteId, setCanjeClienteId] = useState<string | undefined>(undefined);
  const [canjeEditar, setCanjeEditar] = useState<CanjeGuardado | undefined>(undefined);
  const [taskBadge, setTaskBadge] = useState(0);
  const [vencBadge, setVencBadge] = useState(0);
  const [cobroBadge, setCobroBadge] = useState(0);
  const [pedidoBadge, setPedidoBadge] = useState(0);
  const [facturaBadge, setFacturaBadge] = useState(0);

  /** Los 5 contadores del menú, en una sola consulta. */
  const loadBadges = useCallback(async () => {
    try {
      const { data: r, error } = await supabase.rpc('contadores_menu', { p_hoy: hoyAR() });
      if (error || !r) return;
      const c = r as { tareas?: number; vencimientos?: number; cobros?: number; pedidos?: number; facturas?: number };
      setTaskBadge(c.tareas ?? 0);
      setVencBadge(c.vencimientos ?? 0);
      setCobroBadge(c.cobros ?? 0);
      setPedidoBadge(c.pedidos ?? 0);
      setFacturaBadge(c.facturas ?? 0);
    } catch {
      // Los contadores son decorativos: si falla, se dejan como estaban
    }
  }, []);

  useEffect(() => { void loadBadges(); }, [loadBadges, screen]);

  // La mesa puede responder mientras la app está abierta: se revisa cada 2 minutos y al volver a la pestaña
  useEffect(() => {
    const t = setInterval(() => { void loadBadges(); }, 120000);
    const alVolver = () => { if (document.visibilityState === 'visible') void loadBadges(); };
    document.addEventListener('visibilitychange', alVolver);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', alVolver); };
  }, [loadBadges]);

  // Al tocar una notificación: llega ?abrir=<id> (app cerrada) o un mensaje del service worker (app abierta)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('abrir');
    const pantallaUrl = params.get('pantalla');
    if (pantallaUrl === 'resumen') {
      setScreen('resumen');
      params.delete('pantalla');
      const q = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${q ? `?${q}` : ''}${window.location.hash}`);
    }
    if (id && /^[0-9a-f-]{36}$/i.test(id)) {
      setEditCotizId(id); setDuplicateFromId(undefined); setScreen('nueva');
      params.delete('abrir');
      const q = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${q ? `?${q}` : ''}${window.location.hash}`);
    }
    if (!('serviceWorker' in navigator)) return;
    const alMensaje = (e: MessageEvent) => {
      const d = e.data as { tipo?: string; cotizacionId?: string; pantalla?: string } | null;
      if (d?.tipo === 'abrir-pantalla' && d.pantalla === 'resumen') { setScreen('resumen'); return; }
      if (d?.tipo === 'abrir-cotizacion' && d.cotizacionId) {
        setEditCotizId(d.cotizacionId); setDuplicateFromId(undefined); setScreen('nueva');
        void loadBadges();
      }
    };
    navigator.serviceWorker.addEventListener('message', alMensaje);
    return () => navigator.serviceWorker.removeEventListener('message', alMensaje);
  }, [loadBadges]);

  function handleNavigate(s: Screen) {
    setScreen(s);
    if (s === 'canje') { setCanjeClienteId(undefined); setCanjeEditar(undefined); }
    if (s === 'nueva') { setEditCotizId(undefined); setDuplicateFromId(undefined); }
  }

  function handleEditCotiz(id: string) {
    setEditCotizId(id); setDuplicateFromId(undefined); setScreen('nueva');
  }

  function handleDuplicateCotiz(id: string) {
    setDuplicateFromId(id); setEditCotizId(undefined); setScreen('nueva');
  }

  return (
    <Layout current={screen} onNavigate={handleNavigate} taskBadge={taskBadge} vencBadge={vencBadge} cobroBadge={cobroBadge} pedidoBadge={pedidoBadge} facturaBadge={facturaBadge}>
      {screen === 'inicio' && <Inicio onNavigate={handleNavigate} onEditCotiz={handleEditCotiz} onDuplicateCotiz={handleDuplicateCotiz} pedidoBadge={pedidoBadge} />}
      <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-emerald-600" /></div>}>
        {screen === 'nueva' && <NuevaCotizacion editId={editCotizId} duplicateFromId={duplicateFromId} onDeleted={() => handleNavigate('cotizaciones')} onAbrirGuardada={handleEditCotiz} />}
        {screen === 'pipeline' && <Pipeline onEdit={handleEditCotiz} />}
        {screen === 'cotizaciones' && <Cotizaciones onEdit={handleEditCotiz} onDuplicate={handleDuplicateCotiz} />}
        {screen === 'recotizar' && <Recotizar onEdit={handleEditCotiz} />}
        {screen === 'vencimientos' && <Vencimientos onEdit={handleEditCotiz} />}
        {screen === 'cobranzas' && <Cobranzas onEdit={handleEditCotiz} />}
        {screen === 'pedidos' && <PedidosMesa onEdit={handleEditCotiz} />}
        {screen === 'facturacion' && <Facturacion onEdit={handleEditCotiz} />}
        {screen === 'costos' && <EvolucionCostos />}
        {screen === 'consulta' && <ConsultaCostos />}
        {screen === 'canje' && <CalculadoraCanje key={canjeEditar?.id ?? canjeClienteId ?? 'suelta'} clienteInicial={canjeClienteId} canjeInicial={canjeEditar} onEditCotiz={handleEditCotiz} />}
        {screen === 'catalogo' && <Catalogo />}
        {screen === 'relacion' && <RelacionInsumoGrano />}
        {screen === 'formasPago' && <FormasPago />}
        {screen === 'competencia' && <Competencia />}
        {screen === 'resumen' && <ResumenSemanal onEditCotiz={handleEditCotiz} onNavigate={handleNavigate} />}
        {screen === 'rentabilidad' && <Rentabilidad onEdit={handleEditCotiz} />}
        {screen === 'tareas' && <Tareas />}
        {screen === 'visitas' && <Visitas />}
        {screen === 'mapa' && <Mapa />}
        {screen === 'clientes' && <Clientes onCalcularCanje={(id, c) => { setCanjeClienteId(id); setCanjeEditar(c); setScreen('canje'); }} onEditCotiz={handleEditCotiz} />}
        {screen === 'listas' && <Listas />}
        {screen === 'estadisticas' && <Estadisticas />}
        {screen === 'config' && usuario.rol === 'admin' && <ConfigScreen />}
        {screen === 'historial' && <Historial />}
      </Suspense>
    </Layout>
  );
}

/** Sin sesión iniciada solo se ve la pantalla de ingreso. */
function Puerta() {
  const { cargando, usuario, recuperando } = useSesion();
  if (cargando) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50"><Loader2 className="w-8 h-8 text-emerald-600 animate-spin" /></div>;
  }
  if (!usuario) return <AuthScreen />;
  if (recuperando) return <AuthScreen modoInicial="nueva" />;
  if (!usuario.activo) return <CuentaPendiente />;
  return <AppContent />;
}

/** Links públicos (?mesa=código o ?facturar=código): se abren sin usuario ni contraseña. */
function codigoPublico(param: 'mesa' | 'facturar'): string | null {
  const t = new URLSearchParams(window.location.search).get(param);
  return t && /^[a-f0-9]{64}$/i.test(t) ? t : t ? 'invalido' : null;
}

export default function App() {
  const mesa = codigoPublico('mesa');
  if (mesa) {
    return <ToastProvider><Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50"><Loader2 className="w-8 h-8 text-emerald-600 animate-spin" /></div>}><PublicoMesa token={mesa} /></Suspense></ToastProvider>;
  }
  const facturar = codigoPublico('facturar');
  if (facturar) {
    return <ToastProvider><Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50"><Loader2 className="w-8 h-8 text-emerald-600 animate-spin" /></div>}><PublicoFacturacion token={facturar} /></Suspense></ToastProvider>;
  }
  return (
    <AuthProvider>
      <ToastProvider>
        <Puerta />
      </ToastProvider>
    </AuthProvider>
  );
}
