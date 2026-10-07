import { AuthProvider } from '@/context/AuthContext';
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
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { hoyAR } from '@/lib/fechas';

function AppContent() {
  const [screen, setScreen] = useState<Screen>('inicio');
  const [editCotizId, setEditCotizId] = useState<string | undefined>(undefined);
  const [duplicateFromId, setDuplicateFromId] = useState<string | undefined>(undefined);
  const [taskBadge, setTaskBadge] = useState(0);

  const loadTaskBadge = useCallback(async () => {
    const hoy = hoyAR();
    const { count } = await supabase
      .from('tareas')
      .select('*', { count: 'exact', head: true })
      .eq('estado', 'Pendiente')
      .lte('fecha_vencimiento', hoy);
    setTaskBadge(count || 0);
  }, []);

  useEffect(() => { loadTaskBadge(); }, [loadTaskBadge, screen]);

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
    <Layout current={screen} onNavigate={handleNavigate} taskBadge={taskBadge}>
      {screen === 'inicio' && <Inicio onNavigate={handleNavigate} onEditCotiz={handleEditCotiz} />}
      {screen === 'nueva' && <NuevaCotizacion editId={editCotizId} duplicateFromId={duplicateFromId} onDeleted={() => handleNavigate('cotizaciones')} />}
      {screen === 'pipeline' && <Pipeline onEdit={handleEditCotiz} />}
      {screen === 'cotizaciones' && <Cotizaciones onEdit={handleEditCotiz} onDuplicate={handleDuplicateCotiz} />}
      {screen === 'tareas' && <Tareas />}
      {screen === 'visitas' && <Visitas />}
      {screen === 'clientes' && <Clientes />}
      {screen === 'listas' && <Listas />}
      {screen === 'estadisticas' && <Estadisticas />}
      {screen === 'config' && <ConfigScreen />}
      {screen === 'historial' && <Historial />}
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </AuthProvider>
  );
}
