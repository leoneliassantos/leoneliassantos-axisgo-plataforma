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

/**
 * Lê TODAS as linhas de uma consulta, paginando em blocos de 1.000.
 * O PostgREST limita cada requisição (padrão ~1.000 linhas); sem paginar,
 * tabelas grandes (fluxo_caixa, dre_lancamentos, vendas) seriam cortadas
 * SILENCIOSAMENTE, exibindo só parte dos dados (as datas mais antigas).
 *
 * Passe um builder que aplique `.range(from, to)` e sempre ordene por uma
 * coluna ÚNICA (ex.: `.order('id')`) para a paginação ser estável.
 */
export async function fetchAllRows<T>(
  makeQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const PAGE = 1000
  const all: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await makeQuery(from, from + PAGE - 1)
    if (error) return { data: all, error }
    const lote = data ?? []
    all.push(...lote)
    if (lote.length < PAGE) break
  }
  return { data: all, error: null }
}
