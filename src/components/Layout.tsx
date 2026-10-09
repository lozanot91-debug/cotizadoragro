import { useEffect, useState } from 'react';
import { Sprout, FilePlus, FileText, Users, ListChecks, BarChart3, Settings, Menu, X, History, UserCircle, LogOut, Home, KanbanSquare, CheckSquare, MapPin, RefreshCw, TrendingUp, CalendarClock, Wallet, LineChart, ClipboardList, SearchCheck, Receipt, BookOpen, ChevronDown, Briefcase, Contact, Tags, PieChart, ShieldCheck, Wheat, Scale, Swords, CalendarDays, Map as MapIcon } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import InstalarApp from '@/components/InstalarApp';
import MiPerfil from '@/components/MiPerfil';
import SinConexion from '@/components/SinConexion';

import { SUELTOS, badgeDeGrupo, grupoDe, gruposVisibles, type Badge, type Screen } from '@/lib/menu';

export type { Screen };

type Icono = React.ComponentType<{ className?: string }>;
const ICONOS: Record<Screen, Icono> = {
  inicio: Home, nueva: FilePlus, cotizaciones: FileText, pipeline: KanbanSquare, vencimientos: CalendarClock,
  recotizar: RefreshCw, pedidos: ClipboardList, facturacion: Receipt, catalogo: BookOpen, clientes: Users, tareas: CheckSquare, visitas: MapPin, mapa: MapIcon,
  cobranzas: Wallet, consulta: SearchCheck, canje: Wheat, relacion: Scale, competencia: Swords, resumen: CalendarDays, listas: ListChecks, costos: LineChart, estadisticas: BarChart3,
  rentabilidad: TrendingUp, config: Settings, historial: History,
};
const ICONOS_GRUPO: Record<string, Icono> = { cotizaciones: Briefcase, clientes: Contact, precios: Tags, analisis: PieChart, admin: ShieldCheck };

const CLAVE_ABIERTOS = 'cotizador.menu.abiertos';
function leerAbiertos(): string[] {
  try { const v = JSON.parse(localStorage.getItem(CLAVE_ABIERTOS) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
function guardarAbiertos(ids: string[]) {
  try { localStorage.setItem(CLAVE_ABIERTOS, JSON.stringify(ids)); } catch { /* sin almacenamiento */ }
}

function Aviso({ n }: { n: number }) {
  if (!(n > 0)) return null;
  return <span className="ml-auto bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full font-bold min-w-5 text-center">{n}</span>;
}

interface Props {
  current: Screen;
  onNavigate: (s: Screen) => void;
  children: React.ReactNode;
  taskBadge?: number;
  vencBadge?: number;
  cobroBadge?: number;
  pedidoBadge?: number;
  facturaBadge?: number;
}

export default function Layout({ current, onNavigate, children, taskBadge, vencBadge, cobroBadge, pedidoBadge, facturaBadge }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { usuario, signOut } = useAuth();
  const [perfilAbierto, setPerfilAbierto] = useState(false);

  function handleNav(s: Screen) {
    onNavigate(s);
    setMenuOpen(false);
  }

  const badges: Partial<Record<Badge, number>> = { venc: vencBadge, pedido: pedidoBadge, cobro: cobroBadge, tarea: taskBadge, factura: facturaBadge };
  const grupos = gruposVisibles(usuario.rol === 'admin');

  // Grupos abiertos: los que el usuario dejó abiertos + siempre el de la pantalla actual
  const [abiertos, setAbiertos] = useState<string[]>(leerAbiertos);
  const grupoActual = grupoDe(current);
  useEffect(() => {
    if (grupoActual && !abiertos.includes(grupoActual)) setAbiertos((a) => [...a, grupoActual]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grupoActual]);
  useEffect(() => { guardarAbiertos(abiertos); }, [abiertos]);
  const alternar = (id: string) => setAbiertos((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));

  const botonItem = (id: Screen, label: string, n?: number, sangria = false) => {
    const Icon = ICONOS[id];
    const active = current === id;
    return (
      <button key={id} onClick={() => handleNav(id)} aria-current={active ? 'page' : undefined}
        className={`w-full flex items-center gap-3 ${sangria ? 'pl-5 pr-3 py-2' : 'px-3 py-2.5'} rounded-lg text-sm font-medium transition-all ${active ? 'bg-gray-100 text-emerald-800 shadow-[inset_3px_0_0_#C0900F]' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}>
        <Icon className={`${sangria ? 'w-4 h-4' : 'w-5 h-5'} flex-shrink-0`} />
        {label}
        <Aviso n={n || 0} />
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-emerald-900 text-white sticky top-0 z-30">
        <div className="px-4 lg:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-amber-400 rounded-lg flex items-center justify-center">
              <Sprout className="w-5 h-5 text-emerald-900" />
            </div>
            <span className="titulo text-xl tracking-wide">Cotizador Agro</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setPerfilAbierto(true)} title="Mi perfil" aria-label="Mi perfil"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-emerald-100 hover:bg-emerald-800">
              <UserCircle className="w-5 h-5 text-amber-300" />
              <span className="hidden sm:block font-medium">{usuario.nombre}</span>
              {usuario.rol === 'admin' && <span className="text-xs bg-amber-400 text-emerald-950 font-semibold px-1.5 py-0.5 rounded hidden sm:block">Admin</span>}
            </button>
            <button onClick={() => { void signOut(); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-emerald-200 hover:bg-emerald-800" title="Cerrar sesión">
              <LogOut className="w-4 h-4" /> <span className="hidden sm:block">Salir</span>
            </button>
            <button onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'} className="lg:hidden p-2 text-emerald-100 hover:bg-emerald-800 rounded-lg">
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>
      <SinConexion />

      <div className="flex flex-1">
        <aside className={`
          ${menuOpen ? 'fixed inset-0 top-14 z-20 bg-white' : 'hidden'}
          lg:sticky lg:top-14 lg:block lg:z-0
          w-full lg:w-60 flex-shrink-0 bg-white border-r border-gray-200
          h-[calc(100vh-3.5rem)] overflow-y-auto
        `}>
          <nav className="p-3 space-y-1">
            {botonItem('inicio', SUELTOS[0].label)}
            <button onClick={() => handleNav('nueva')} aria-current={current === 'nueva' ? 'page' : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all ${current === 'nueva' ? 'bg-emerald-800 text-white shadow-[inset_3px_0_0_#C0900F]' : 'bg-emerald-700 text-white hover:bg-emerald-800'}`}>
              <FilePlus className="w-5 h-5 flex-shrink-0" /> {SUELTOS[1].label}
            </button>

            {grupos.map((g) => {
              const abierto = abiertos.includes(g.id);
              const Icono = ICONOS_GRUPO[g.id] ?? FileText;
              const avisos = badgeDeGrupo(g, badges);
              return (
                <div key={g.id} className="pt-2">
                  <button onClick={() => alternar(g.id)} aria-expanded={abierto}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide transition-colors ${grupoActual === g.id ? 'text-emerald-800' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'}`}>
                    <Icono className="w-4 h-4 flex-shrink-0" />
                    {g.label}
                    {!abierto && avisos > 0
                      ? <Aviso n={avisos} />
                      : <span className="ml-auto" />}
                    <ChevronDown className={`w-4 h-4 transition-transform ${abierto ? '' : '-rotate-90'}`} />
                  </button>
                  {abierto && (
                    <div className="mt-0.5 space-y-0.5">
                      {g.items.map((i) => botonItem(i.id, i.label, i.badge ? badges[i.badge] : undefined, true))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
          <div className="p-3 pt-0"><InstalarApp /></div>
        </aside>

        <main className="flex-1 overflow-x-hidden">
          <div className="p-4 lg:p-6 max-w-7xl mx-auto w-full">
            {children}
          </div>
        </main>
      </div>

      {perfilAbierto && <MiPerfil onCerrar={() => setPerfilAbierto(false)} />}
    </div>
  );
}
