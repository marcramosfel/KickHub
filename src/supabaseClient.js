import { createClient } from '@supabase/supabase-js'

// Cliente único do Supabase para toda a app.
// A chave é a "publishable key" (pública); as tabelas estão fechadas por RLS
// e todo o acesso passa pelas funções RPC (SECURITY DEFINER).
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY
)
