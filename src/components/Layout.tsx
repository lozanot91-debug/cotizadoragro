import { useState } from 'react';
import { Sprout, FilePlus, FileText, Users, ListChecks, BarChart3, Settings, Menu, X, History, UserCircle, LogOut, Home, KanbanSquare, CheckSquare, MapPin, RefreshCw, TrendingUp, CalendarClock } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export type Screen = 'inicio' | 'nueva' | 'pipeline' | 'cotizaciones' | 'tareas' | 'visitas' | 'clientes' | 'listas' | 'estadisticas' | 'config' | 'historial' | 'recotizar' | 'rentabilidad' | 'vencimientos';

interface Props {
  current: Screen;
  onNavigate: (s: Screen) => void;
  children: React.ReactNode;
  taskBadge?: number;
  vencBadge?: number;
}

export default function Layout({ current, onNavigate, children, taskBadge, vencBadge }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { usuario, signOut } = useAuth();

  function handleNav(s: Screen) {
    onNavigate(s);
    setMenuOpen(false);
  }

  const todosLosItems: { id: Screen; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number }[] = [
    { id: 'inicio', label: 'Inicio', icon: Home },
    { id: 'nueva', label: 'Nueva cotización', icon: FilePlus },
    { id: 'pipeline', label: 'Pipeline', icon: KanbanSquare },
    { id: 'cotizaciones', label: 'Cotizaciones', icon: FileText },
    { id: 'vencimientos', label: 'Vencimientos', icon: CalendarClock, badge: vencBadge },
    { id: 'recotizar', label: 'Recotizar', icon: RefreshCw },
    { id: 'tareas', label: 'Tareas', icon: CheckSquare, badge: taskBadge },
    { id: 'visitas', label: 'Visitas', icon: MapPin },
    { id: 'clientes', label: 'Clientes', icon: Users },
    { id: 'listas', label: 'Listas', icon: ListChecks },
    { id: 'estadisticas', label: 'Estadísticas', icon: BarChart3 },
    { id: 'rentabilidad', label: 'Rentabilidad', icon: TrendingUp },
    { id: 'config', label: 'Márgenes y config.', icon: Settings },
    { id: 'historial', label: 'Historial', icon: History },
  ];
  // Tocar márgenes y configuración es solo del administrador (las listas las ven todos, solo el admin las carga)
  const navItems = todosLosItems.filter((item) => (usuario.rol === 'admin' || item.id !== 'config') && (usuario.puede_ver_costos || item.id !== 'rentabilidad'));

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="px-4 lg:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-emerald-600 to-green-700 rounded-lg flex items-center justify-center">
              <Sprout className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-gray-800 hidden sm:block">Cotizador Agro</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600">
              <UserCircle className="w-5 h-5 text-emerald-600" />
              <span className="hidden sm:block font-medium">{usuario.nombre}</span>
              {usuario.rol === 'admin' && <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full hidden sm:block">Admin</span>}
            </div>
            <button onClick={() => { void signOut(); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100" title="Cerrar sesión">
              <LogOut className="w-4 h-4" /> <span className="hidden sm:block">Salir</span>
            </button>
            <button onClick={() => setMenuOpen(!menuOpen)} className="lg:hidden p-2 text-gray-500 hover:bg-gray-100 rounded-lg">
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        <aside className={`
          ${menuOpen ? 'fixed inset-0 top-14 z-20 bg-white' : 'hidden'}
          lg:sticky lg:top-14 lg:block lg:z-0
          w-full lg:w-60 flex-shrink-0 bg-white border-r border-gray-200
          h-[calc(100vh-3.5rem)] overflow-y-auto
        `}>
          <nav className="p-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = current === item.id;
              return (
                <button key={item.id} onClick={() => handleNav(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${active ? 'bg-emerald-50 text-emerald-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}>
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  {item.label}
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="ml-auto bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full font-bold min-w-5 text-center">{item.badge}</span>
                  )}
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="flex-1 overflow-x-hidden">
          <div className="p-4 lg:p-6 max-w-7xl mx-auto w-full">
            {children}
          </div>
        </main>
      </div>

    </div>
  );
}
