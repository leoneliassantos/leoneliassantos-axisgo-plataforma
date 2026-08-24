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
 *
 * PERFORMANCE: busca a 1ª página e, se ela veio cheia, dispara as próximas
 * em PARALELO (lotes de BATCH). Assim uma tabela de ~5 páginas carrega em ~2
 * idas ao banco, em vez de 5 em fila — o que deixava o menu Vendas lento (~5s).
 */
export async function fetchAllRows<T>(
  makeQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const PAGE = 1000
  const BATCH = 8 // páginas buscadas em paralelo por rodada

  const first = await makeQuery(0, PAGE - 1)
  if (first.error) return { data: first.data ?? [], error: first.error }
  const all: T[] = [...(first.data ?? [])]
  if ((first.data?.length ?? 0) < PAGE) return { data: all, error: null } // cabe numa página só

  // Ainda há mais: pega as demais páginas em paralelo, em lotes, até uma vir incompleta.
  let page = 1
  for (;;) {
    const reqs = Array.from({ length: BATCH }, (_, i) => {
      const p = page + i
      return makeQuery(p * PAGE, p * PAGE + PAGE - 1)
    })
    const results = await Promise.all(reqs)
    let acabou = false
    for (const { data, error } of results) {
      if (error) return { data: all, error }
      const lote = data ?? []
      all.push(...lote) // Promise.all preserva a ordem → páginas ficam na sequência certa
      if (lote.length < PAGE) acabou = true
    }
    if (acabou) break
    page += BATCH
  }
  return { data: all, error: null }
}
