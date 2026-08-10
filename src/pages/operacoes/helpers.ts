import type { Pedido, Produto, StatusProd, Prioridade } from './data'
import { ETAPAS } from './data'

/** Última etapa do fluxo (Entregue/Finalizado). */
const ULTIMA_ETAPA = ETAPAS[ETAPAS.length - 1].id

/** ISO (YYYY-MM-DD) do dia de hoje, no fuso local. */
export function hojeISO(): string {
  const d = new Date()
  const p = (n: number) => `${n < 10 ? '0' : ''}${n}`
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 'YYYY-MM-DD' → 'dd/mm'. Vazio devolve ''. */
export function fmtBR(iso: string): string {
  if (!iso) return ''
  const [, m, d] = iso.split('-')
  return d && m ? `${d}/${m}` : iso
}

/** 'YYYY-MM-DD' → 'dd/mm/aaaa'. */
export function fmtBRfull(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return d && m && y ? `${d}/${m}/${y}` : iso
}

/** Dias entre duas datas ISO (b - a). */
export function daysBetween(a: string, b: string): number {
  if (!a || !b) return 0
  const da = new Date(a).getTime()
  const db = new Date(b).getTime()
  return Math.round((db - da) / 86400000)
}

const PRIO_RANK: Record<Prioridade, number> = { alta: 3, media: 2, baixa: 1 }

export interface ResumoPedido {
  total: number
  entregues: number
  atrasados: number
  alertas: number
  aguardando: number
  progresso: number
  situacao: StatusProd
  prioridade: Prioridade
}

/** Resumo do pedido derivado dos itens (situação NÃO é armazenada no banco). */
export function resumoPedido(ped: Pedido): ResumoPedido {
  const its = ped.produtos
  const total = its.length
  const atrasados = its.filter((i) => i.status === 'atrasado').length
  const alertas = its.filter((i) => i.status === 'alerta').length
  const aguardando = its.filter((i) => i.status === 'aguardando').length
  const entregues = its.filter((i) => i.etapaId === ULTIMA_ETAPA).length
  const progresso = total ? Math.round(its.reduce((s, i) => s + (i.progresso || 0), 0) / total) : 0
  let situacao: StatusProd = 'ok'
  if (atrasados) situacao = 'atrasado'
  else if (aguardando) situacao = 'aguardando'
  else if (alertas) situacao = 'alerta'
  const rank = its.reduce((m, i) => Math.max(m, PRIO_RANK[i.prioridade] || 2), 0)
  const prioridade = (Object.keys(PRIO_RANK) as Prioridade[]).find((k) => PRIO_RANK[k] === rank) ?? 'media'
  return { total, entregues, atrasados, alertas, aguardando, progresso, situacao, prioridade }
}

/** Contagem de itens por etapa (para o mini-mapa da lista). */
export function contagemPorEtapa(ped: Pedido): Record<string, number> {
  const m: Record<string, number> = {}
  for (const e of ETAPAS) m[e.id] = 0
  for (const it of ped.produtos) m[it.etapaId] = (m[it.etapaId] ?? 0) + 1
  return m
}

/** Classe Tailwind do selo de status. */
export function statusClasse(s: StatusProd): string {
  switch (s) {
    case 'atrasado': return 'bg-neg/10 text-neg'
    case 'alerta': return 'bg-amber-500/12 text-amber-700'
    case 'aguardando': return 'bg-slate-500/12 text-slate-600'
    default: return 'bg-pos/10 text-pos'
  }
}

/** Cor do pontinho de prioridade. */
export function prioCor(p: Prioridade): string {
  return p === 'alta' ? '#e5484d' : p === 'media' ? '#f2a020' : '#93a1ac'
}

export function itemFiltraTexto(it: Produto, termo: string): boolean {
  if (!termo) return true
  const t = termo.toLowerCase()
  return [it.uniformeNome, it.corNome, it.numeroPedido, it.numeroProposta].join(' ').toLowerCase().includes(t)
}
