import { createClient } from '@supabase/supabase-js';

/**
 * Si se entró desde el mail de "olvidé mi contraseña", el link trae `type=recovery` en el hash.
 * Se lee antes de crear el cliente porque Supabase limpia el hash al procesar la sesión.
 */
export const llegoPorRecuperacion =
  typeof window !== 'undefined' && /(^|[#&])type=recovery(&|$)/.test(window.location.hash);

/** El link del mail venció o ya se usó: Supabase vuelve con `error_code` en el hash. */
export const linkRecuperacionVencido =
  typeof window !== 'undefined' && /(^|[#&])error_code=(otp_expired|access_denied)/.test(window.location.hash);

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'implicit',
  },
});
