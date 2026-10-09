import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, llegoPorRecuperacion } from '@/lib/supabase';
import { fijarUsuarioActual } from '@/lib/usuarioActual';

export interface Usuario {
  id: string;
  email: string;
  nombre: string;
  rol: 'admin' | 'vendedor';
  activo: boolean;
}

interface SesionCtx {
  /** true mientras se averigua si hay una sesión iniciada */
  cargando: boolean;
  usuario: Usuario | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  /** true si se entró por el link del mail de recuperación: hay que elegir contraseña nueva */
  recuperando: boolean;
  pedirRecuperacion: (email: string) => Promise<{ error: string | null }>;
  cambiarPassword: (password: string) => Promise<{ error: string | null }>;
  /** Cambia el nombre del usuario logueado (solo el propio). */
  actualizarNombre: (nombre: string) => Promise<{ error: string | null }>;
  /** Mensaje si no se pudo leer el perfil (la cuenta queda como pendiente). */
  errorPerfil: string | null;
  /** Vuelve a leer el perfil (ej: después de que un admin aprobó la cuenta). */
  reintentarPerfil: () => void;
}

const Ctx = createContext<SesionCtx | undefined>(undefined);

function traducirErrorLogin(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('invalid login') || m.includes('invalid credentials')) return 'Email o contraseña incorrectos.';
  if (m.includes('email not confirmed')) return 'El usuario todavía no está confirmado. Pedile al administrador que lo confirme.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'No hay conexión. Revisá tu internet e intentá de nuevo.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Demasiados intentos. Esperá un rato e intentá de nuevo.';
  return 'No se pudo iniciar sesión. Intentá de nuevo.';
}

function traducirErrorRecuperacion(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('failed to fetch') || m.includes('network')) return 'No hay conexión. Revisá tu internet e intentá de nuevo.';
  if (m.includes('rate limit') || m.includes('too many') || m.includes('security purposes')) return 'Ya se pidió un mail hace poco. Esperá unos minutos e intentá de nuevo.';
  if (m.includes('should be different') || m.includes('same password')) return 'La contraseña nueva tiene que ser distinta de la anterior.';
  if (m.includes('weak') || m.includes('pwned') || m.includes('leaked')) return 'Esa contraseña es muy débil o apareció en filtraciones. Elegí otra.';
  if (m.includes('at least')) return 'La contraseña es muy corta.';
  if (m.includes('session') || m.includes('expired') || m.includes('invalid')) return 'El link venció. Pedí uno nuevo desde "Olvidé mi contraseña".';
  return 'No se pudo completar. Intentá de nuevo.';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Usuario | null>(null);
  const [cargandoSesion, setCargandoSesion] = useState(true);
  const [cargandoPerfil, setCargandoPerfil] = useState(false);
  const [recuperando, setRecuperando] = useState(llegoPorRecuperacion);
  const [errorPerfil, setErrorPerfil] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const reintentarPerfil = useCallback(() => setIntento((n) => n + 1), []);

  useEffect(() => {
    let vivo = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!vivo) return;
      setSesion(data.session);
      setCargandoSesion(false);
    }).catch(() => {
      if (vivo) setCargandoSesion(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((evento, s) => {
      // Solo se guarda la sesión: no se hacen pedidos a Supabase dentro de este callback
      setSesion(s);
      if (evento === 'PASSWORD_RECOVERY') setRecuperando(true);
      if (evento === 'SIGNED_OUT') setRecuperando(false);
    });
    return () => { vivo = false; sub.subscription.unsubscribe(); };
  }, []);

  const userId = sesion?.user.id ?? null;
  const email = sesion?.user.email ?? '';

  useEffect(() => {
    if (!userId) { setPerfil(null); setErrorPerfil(null); setCargandoPerfil(false); return; }
    let vivo = true;
    setCargandoPerfil(true);
    (async () => {
      const { data, error } = await supabase
        .from('usuarios')
        .select('id, email, nombre, rol, activo')
        .eq('id', userId)
        .maybeSingle();
      if (!vivo) return;
      if (error) console.error('No se pudo leer el perfil del usuario:', error);
      setErrorPerfil(error ? 'No se pudo leer tu perfil. Revisá la conexión y probá de nuevo.' : null);
      // Sin perfil (o error): la cuenta queda pendiente hasta que se pueda leer
      const u = data as Usuario | null;
      setPerfil(
        u && !error
          ? { ...u, nombre: u.nombre || email.split('@')[0], activo: u.activo !== false }
          : { id: userId, email, nombre: email.split('@')[0] || 'Usuario', rol: 'vendedor', activo: false }
      );
      setCargandoPerfil(false);
    })();
    return () => { vivo = false; };
  }, [userId, email, intento]);

  useEffect(() => { fijarUsuarioActual(perfil?.nombre || 'Admin'); }, [perfil]);

  const signIn = useCallback(async (mail: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: mail.trim(), password });
    return { error: error ? traducirErrorLogin(error.message) : null };
  }, []);

  const pedirRecuperacion = useCallback(async (mail: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(mail.trim(), {
      redirectTo: `${window.location.origin}/`,
    });
    return { error: error ? traducirErrorRecuperacion(error.message) : null };
  }, []);

  const cambiarPassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (!error) setRecuperando(false);
    return { error: error ? traducirErrorRecuperacion(error.message) : null };
  }, []);

  const actualizarNombre = useCallback(async (nombre: string) => {
    const { data, error } = await supabase.rpc('actualizar_mi_nombre', { p_nombre: nombre });
    if (error) return { error: error.code === 'P0001' && error.message ? error.message : 'No se pudo guardar el nombre. Probá de nuevo.' };
    setPerfil((p) => (p ? { ...p, nombre: String(data) } : p));
    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setPerfil(null);
  }, []);

  const value = useMemo<SesionCtx>(() => ({
    cargando: cargandoSesion || (!!userId && !perfil),
    usuario: userId ? perfil : null,
    signIn,
    signOut,
    recuperando: recuperando && !!userId,
    pedirRecuperacion,
    cambiarPassword,
    actualizarNombre,
    errorPerfil,
    reintentarPerfil,
  }), [cargandoSesion, cargandoPerfil, userId, perfil, signIn, signOut, recuperando, pedirRecuperacion, cambiarPassword, actualizarNombre, errorPerfil, reintentarPerfil]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Estado de la sesión (lo usa la pantalla de ingreso). */
export function useSesion(): SesionCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSesion debe usarse dentro de AuthProvider');
  return c;
}

/** Usuario logueado. Solo se usa en pantallas que se muestran después del ingreso. */
export function useAuth(): Pick<SesionCtx, 'signOut' | 'cambiarPassword' | 'actualizarNombre'> & { usuario: Usuario } {
  const c = useSesion();
  if (!c.usuario) throw new Error('useAuth se usó sin una sesión iniciada');
  return { usuario: c.usuario, signOut: c.signOut, cambiarPassword: c.cambiarPassword, actualizarNombre: c.actualizarNombre };
}
