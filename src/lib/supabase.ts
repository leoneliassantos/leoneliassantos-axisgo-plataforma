import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/**
 * Quando as variáveis de ambiente do Supabase existem, a plataforma opera em
 * modo PRODUÇÃO (dados persistem no Postgres do Supabase). Caso contrário, ela
 * roda em modo DEMO local (autenticação e dados simulados no navegador), para
 * desenvolvimento e demonstração antes do banco estar configurado.
 */
export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anonKey as string)
  : null
