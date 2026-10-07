import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { fijarUsuarioActual } from '@/lib/usuarioActual';

export interface Usuario {
  id: string;
  email: string;
  nombre: string;
  rol: 'admin' | 'vendedor';
  puede_ver_costos: boolean;
}

interface SesionCtx {
  /** true mientras se averigua si hay una sesión iniciada */
  cargando: boolean;
  usuario: Usuario | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Usuario | null>(null);
  const [cargandoSesion, setCargandoSesion] = useState(true);
  const [cargandoPerfil, setCargandoPerfil] = useState(false);

  useEffect(() => {
    let vivo = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!vivo) return;
      setSesion(data.session);
      setCargandoSesion(false);
    }).catch(() => {
      if (vivo) setCargandoSesion(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, s) => {
      // Solo se guarda la sesión: no se hacen pedidos a Supabase dentro de este callback
      setSesion(s);
    });
    return () => { vivo = false; sub.subscription.unsubscribe(); };
  }, []);

  const userId = sesion?.user.id ?? null;
  const email = sesion?.user.email ?? '';

  useEffect(() => {
    if (!userId) { setPerfil(null); setCargandoPerfil(false); return; }
    let vivo = true;
    setCargandoPerfil(true);
    (async () => {
      const { data, error } = await supabase
        .from('usuarios')
        .select('id, email, nombre, rol, puede_ver_costos')
        .eq('id', userId)
        .maybeSingle();
      if (!vivo) return;
      if (error) console.error('No se pudo leer el perfil del usuario:', error);
      // Sin perfil (o error): se entra con permisos de vendedor; el admin lo corrige en Supabase
      setPerfil(
        data
          ? { ...(data as Usuario), nombre: (data as Usuario).nombre || email.split('@')[0] }
          : { id: userId, email, nombre: email.split('@')[0] || 'Usuario', rol: 'vendedor', puede_ver_costos: true }
      );
      setCargandoPerfil(false);
    })();
    return () => { vivo = false; };
  }, [userId, email]);

  useEffect(() => { fijarUsuarioActual(perfil?.nombre || 'Admin'); }, [perfil]);

  const signIn = useCallback(async (mail: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: mail.trim(), password });
    return { error: error ? traducirErrorLogin(error.message) : null };
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
  }), [cargandoSesion, cargandoPerfil, userId, perfil, signIn, signOut]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Estado de la sesión (lo usa la pantalla de ingreso). */
export function useSesion(): SesionCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSesion debe usarse dentro de AuthProvider');
  return c;
}

/** Usuario logueado. Solo se usa en pantallas que se muestran después del ingreso. */
export function useAuth(): { usuario: Usuario; signOut: () => Promise<void> } {
  const c = useSesion();
  if (!c.usuario) throw new Error('useAuth se usó sin una sesión iniciada');
  return { usuario: c.usuario, signOut: c.signOut };
}
