import type { SupabaseClient } from '@supabase/supabase-js'

/* ================================================================== *
 *  Fonte de dados compartilhada do Fluxo de Caixa (Supabase)
 *  Usada pelo módulo Fluxo de Caixa e pelo painel de Indicadores.
 * ================================================================== */

export interface Lancamento {
  tipo: 'ENTRADA' | 'SAÍDA'
  desc: string
  cat: string
  valor: number
  data: string // 'YYYY-MM-DD'
}

export const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

export const z12 = () => new Array(12).fill(0) as number[]
export const sum12 = (a: number[]) => a.reduce((s, v) => s + v, 0)

export function fmt0(v: number): string {
  // Sem centavos.
  if (Math.abs(v) < 0.5) return '0'
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
export function fmtCompacto(v: number): string {
  // Ex.: 1.234.567 -> "1,2 mi"; 12.345 -> "12,3 mil"
  const s = v < 0 ? '-' : ''
  const a = Math.abs(v)
  if (a >= 1_000_000) return `${s}${(a / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
  if (a >= 1_000) return `${s}${(a / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`
  return `${s}${a.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
}

export function parseBRNumber(s: string | number): number {
  if (typeof s === 'number') return s
  let t = (s || '').toString().trim().replace(/\s|R\$/g, '')
  if (t === '') return 0
  t = t.replace(/\./g, '').replace(',', '.')
  const n = parseFloat(t)
  return isNaN(n) ? 0 : n
}
export function normTipo(t: unknown): string {
  const s = (t ?? '').toString().toUpperCase().trim()
  if (s.indexOf('ENT') === 0) return 'ENTRADA'
  if (s.indexOf('SA') === 0) return 'SAÍDA'
  return s
}
export function monthOf(dstr: string): number | null {
  const m = parseInt((dstr || '').slice(5, 7), 10)
  return m >= 1 && m <= 12 ? m - 1 : null
}

/* --------------------------- agregação --------------------------- */
export interface Pivot {
  ent: Record<string, number[]>
  sai: Record<string, number[]>
  entD: Record<string, Record<string, number[]>>
  saiD: Record<string, Record<string, number[]>>
  years: string[]
}
export function build(rows: Lancamento[]): Pivot {
  const ent: Record<string, number[]> = {}
  const sai: Record<string, number[]> = {}
  const entD: Record<string, Record<string, number[]>> = {}
  const saiD: Record<string, Record<string, number[]>> = {}
  const years: Record<string, 1> = {}
  for (const r of rows) {
    const tp = normTipo(r.tipo)
    const m = monthOf(r.data)
    if (m === null) continue
    const v = typeof r.valor === 'number' ? r.valor : parseBRNumber(r.valor)
    const y = (r.data || '').slice(0, 4)
    if (y) years[y] = 1
    const bag = tp === 'ENTRADA' ? ent : tp === 'SAÍDA' ? sai : null
    const bagD = tp === 'ENTRADA' ? entD : tp === 'SAÍDA' ? saiD : null
    if (!bag || !bagD) continue
    const cat = (r.cat || '(sem categoria)').trim()
    if (!bag[cat]) bag[cat] = z12()
    bag[cat][m] += v
    const d = (r.desc || '(sem descrição)').trim()
    if (!bagD[cat]) bagD[cat] = {}
    if (!bagD[cat][d]) bagD[cat][d] = z12()
    bagD[cat][d][m] += v
  }
  return { ent, sai, entD, saiD, years: Object.keys(years).sort() }
}
export function colSum(bag: Record<string, number[]>): number[] {
  const t = z12()
  for (const c of Object.keys(bag)) for (let i = 0; i < 12; i++) t[i] += bag[c][i]
  return t
}

/** Séries mensais consolidadas + saldo encadeado a partir do saldo inicial. */
export function computeSeries(rows: Lancamento[], saldoInicial: number) {
  const d = build(rows)
  const receb = colSum(d.ent)
  const pag = colSum(d.sai)
  const resultado = receb.map((r, i) => r - pag[i])
  const saldoAnt = z12()
  const saldo = z12()
  let prev = saldoInicial
  for (let m = 0; m < 12; m++) {
    saldoAnt[m] = prev
    saldo[m] = prev + receb[m] - pag[m]
    prev = saldo[m]
  }
  return { d, receb, pag, resultado, saldoAnt, saldo }
}

/** Soma anual por categoria, ordenada desc. */
export function totalPorCategoria(bag: Record<string, number[]>): { nome: string; valor: number }[] {
  return Object.keys(bag)
    .map((nome) => ({ nome, valor: sum12(bag[nome]) }))
    .filter((x) => x.valor > 0.5)
    .sort((a, b) => b.valor - a.valor)
}

/** Top N descrições (agregando entre categorias) por valor anual. */
export function topDescricoes(bagD: Record<string, Record<string, number[]>>, n: number): { nome: string; valor: number }[] {
  const acc: Record<string, number> = {}
  for (const cat of Object.keys(bagD)) {
    for (const desc of Object.keys(bagD[cat])) {
      acc[desc] = (acc[desc] || 0) + sum12(bagD[cat][desc])
    }
  }
  return Object.keys(acc)
    .map((nome) => ({ nome, valor: acc[nome] }))
    .filter((x) => x.valor > 0.5)
    .sort((a, b) => b.valor - a.valor)
    .slice(0, n)
}

/* --------------------------- carga do Supabase --------------------------- */
export async function loadFluxo(
  supabase: SupabaseClient,
): Promise<{ rows: Lancamento[]; saldoInicial: number; error?: string }> {
  const [lanc, cfg] = await Promise.all([
    supabase.from('fluxo_caixa').select('tipo, descricao, categoria, valor, data').order('data'),
    supabase.from('fluxo_caixa_config').select('valor').eq('chave', 'saldo_inicial').maybeSingle(),
  ])
  if (lanc.error) return { rows: [], saldoInicial: 0, error: lanc.error.message }
  const rows: Lancamento[] = (lanc.data ?? []).map((r) => ({
    tipo: normTipo(r.tipo) as 'ENTRADA' | 'SAÍDA',
    desc: (r.descricao ?? '').toString(),
    cat: (r.categoria ?? '').toString(),
    valor: Number(r.valor) || 0,
    data: (r.data ?? '').toString().slice(0, 10),
  }))
  const saldoInicial = cfg.data ? Number(cfg.data.valor) || 0 : 0
  return { rows, saldoInicial }
}
