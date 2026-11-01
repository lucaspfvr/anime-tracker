import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * A chave publishable/anon é pública por design. NUNCA use service_role aqui.
 * Sem .env.local o catálogo continua utilizável, mas contas ficam desabilitadas.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const publicKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabase: SupabaseClient | null =
  url && publicKey
    ? createClient(url, publicKey, {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
        },
      })
    : null;
