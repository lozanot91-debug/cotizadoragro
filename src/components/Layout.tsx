import { useState, useEffect } from 'react';
import { Sprout, FilePlus, FileText, Users, ListChecks, BarChart3, Settings, Menu, X, History, UserCircle, Home, KanbanSquare, CheckSquare, MapPin } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

export type Screen = 'inicio' | 'nueva' | 'pipeline' | 'cotizaciones' | 'tareas' | 'visitas' | 'clientes' | 'listas' | 'estadisticas' | 'config' | 'historial';

interface Props {
  current: Screen;
  onNavigate: (s: Screen) => void;
  children: React.ReactNode;
  taskBadge?: number;
}

export default function Layout({ current, onNavigate, children, taskBadge }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { usuario, setUsuarioNombre } = useAuth();
  const [modalOperador, setModalOperador] = useState(false);
  const [vendedores, setVendedores] = useState<string[]>([]);
  const [nuevoNombre, setNuevoNombre] = useState('');

  useEffect(() => {
    try {
      const stored = localStorage.getItem('operador_nombre');
      if (!stored) setModalOperador(true);
    } catch {
      setModalOperador(true);
    }
    supabase.from('usuarios').select('nombre').then(({ data }) => {
      if (data && data.length > 0) {
        setVendedores(data.map((d: { nombre: string }) => d.nombre).filter(Boolean));
      }
    });
  }, []);

  function handleNav(s: Screen) {
    onNavigate(s);
    setMenuOpen(false);
  }

  function confirmarOperador() {
    const nombre = nuevoNombre.trim() || 'Admin';
    setUsuarioNombre(nombre);
    setModalOperador(false);
    setNuevoNombre('');
  }

  const navItems: { id: Screen; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number }[] = [
    { id: 'inicio', label: 'Inicio', icon: Home },
    { id: 'nueva', label: 'Nueva cotización', icon: FilePlus },
    { id: 'pipeline', label: 'Pipeline', icon: KanbanSquare },
    { id: 'cotizaciones', label: 'Cotizaciones', icon: FileText },
    { id: 'tareas', label: 'Tareas', icon: CheckSquare, badge: taskBadge },
    { id: 'visitas', label: 'Visitas', icon: MapPin },
    { id: 'clientes', label: 'Clientes', icon: Users },
    { id: 'listas', label: 'Listas', icon: ListChecks },
    { id: 'estadisticas', label: 'Estadísticas', icon: BarChart3 },
    { id: 'config', label: 'Márgenes y config.', icon: Settings },
    { id: 'historial', label: 'Historial', icon: History },
  ];

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
            <button onClick={() => setModalOperador(true)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100">
              <UserCircle className="w-5 h-5 text-emerald-600" />
              <span className="hidden sm:block font-medium">{usuario.nombre}</span>
              <span className="text-xs text-gray-400 hidden sm:block">(Cambiar)</span>
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

      {modalOperador && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { if (usuario.nombre) setModalOperador(false); }}>
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                <UserCircle className="w-5 h-5 text-emerald-600" />
              </div>
              <div><h3 className="font-bold text-gray-800">¿Quién sos?</h3><p className="text-sm text-gray-500">Identificáte para registrar los cambios</p></div>
            </div>
            {vendedores.length > 0 && (
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">Vendedores cargados</label>
                <div className="flex flex-wrap gap-2">
                  {vendedores.map((v) => (
                    <button key={v} onClick={() => { setUsuarioNombre(v); setModalOperador(false); }} className="px-3 py-1.5 rounded-lg text-sm border border-gray-300 hover:bg-emerald-50 hover:border-emerald-400">{v}</button>
                  ))}
                </div>
              </div>
            )}
            <label className="block text-sm font-medium text-gray-700 mb-1">O escribir nombre</label>
            <input type="text" value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') confirmarOperador(); }} placeholder="Tu nombre..." className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500 mb-4" autoFocus />
            <div className="flex gap-2 justify-end">
              <button onClick={confirmarOperador} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700">Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
