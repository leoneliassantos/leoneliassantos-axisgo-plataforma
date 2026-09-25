/**
 * CRM Comercial — camada de dados.
 *
 * NESTA PRIMEIRA VERSÃO os dados ficam no `localStorage` do navegador (mock),
 * para podermos ajustar o PERFIL da MM (etapas, tipos, campos) sem migração de
 * banco a cada mudança. Quando o formato estiver fechado, migramos para o
 * Supabase seguindo o mesmo padrão do módulo Operações (isDemo + tabelas).
 *
 * Portado do CRM do MVP da Fukuda, adaptado para o negócio de UNIFORMES da MM.
 */

import type { CnpjDados } from './cnpj'

/* ------------------------------------------------------------------ *
 *  Tipos
 * ------------------------------------------------------------------ */

export type EtapaCRM =
  | 'Novo lead'
  | 'Contato realizado'
  | 'Levantamento'
  | 'Proposta enviada'
  | 'Em negociação'
  | 'Fechado ganho'
  | 'Fechado perdido'

export type Temperatura = 'Quente' | 'Morno' | 'Frio'

/** Tipos de oportunidade do negócio de uniformes (ajustável). */
export type TipoOportunidade =
  | 'Uniforme profissional'
  | 'Uniforme escolar'
  | 'Fardamento'
  | 'Camisetas / Brindes'
  | 'EPI'
  | 'Recompra'

export type OrigemComercial =
  | 'Indicação'
  | 'Instagram'
  | 'Prospecção ativa'
  | 'Site'
  | 'WhatsApp'
  | 'Evento'
  | 'Cliente recorrente'
  | 'Outro'

export type StatusProposta = 'Enviada' | 'Em análise' | 'Aceita' | 'Recusada'

export interface Atividade {
  data: string // ISO
  tipo: string
  texto: string
}

export interface PropostaLead {
  id: string
  nome: string // nome do arquivo / título
  data: string // ISO
  valor?: number
  status: StatusProposta
}

/** Produto do catálogo (gerido na tela Produtos), com valor por peça.
 *  Persistido no Supabase (tabela crm_produtos) — ver produtosData.ts. */
export interface Produto {
  id: string
  categoria: string // Malharia e Blusa de Lã · Social · Operacional
  nome: string
  cor: string
  tecido: string
  valorUnitario: number // valor de venda por peça (VALOR ATUAL da Tabela de Vendas)
  ativo: boolean
}

/** Item de venda dentro de um lead (produto escolhido + quantidade). */
export interface LeadItem {
  id: string
  produtoId: string
  produtoNome: string // snapshot do nome no momento
  cor?: string // snapshot
  tecido?: string // snapshot
  qtd: number
  valorUnit: number // snapshot do valor unitário no momento
}

export interface Lead {
  id: string
  nome: string // nome do contato (pessoa)
  empresa: string // empresa prospect (texto livre — a MM vende para empresas)
  tipo: TipoOportunidade
  produtoInteresse: string
  origem: OrigemComercial
  consultor: string // vendedor responsável (texto livre)
  valorPotencial: number
  etapa: EtapaCRM
  probabilidade: number // 0-100
  temperatura: Temperatura
  diasSemContato: number
  proximaAtividade?: string // ISO
  criadoEm: string // ISO
  atualizadoEm: string // ISO
  telefone: string
  email: string
  motivoPerda?: string
  atividades: Atividade[]
  propostas: PropostaLead[]
  // --- Cadastro fiscal / vínculo com Operações ---
  cnpj?: string // só dígitos
  cnpjDados?: CnpjDados // dados oficiais preenchidos pela BrasilAPI
  clienteOpId?: string // id do cliente cadastrado em Operações
  apelido?: string // nome/apelido do cliente de Operações (agrupa vários CNPJs)
  // --- Itens de venda (base para a futura proposta) ---
  itens?: LeadItem[]
}

export interface Compromisso {
  id: string
  titulo: string
  tipo: string
  data: string // ISO com hora
  responsavel: string
  concluido: boolean
  cliente?: string
  descricao?: string
  relacionadoA?: string // id do compromisso pai (follow-up)
}

/* ------------------------------------------------------------------ *
 *  Constantes de domínio (perfil MM)
 * ------------------------------------------------------------------ */

export const ETAPAS: { key: EtapaCRM; cor: string }[] = [
  { key: 'Novo lead', cor: '#64748B' },
  { key: 'Contato realizado', cor: '#2E86DE' },
  { key: 'Levantamento', cor: '#7A6CF0' },
  { key: 'Proposta enviada', cor: '#FD6400' }, // laranja da marca MM
  { key: 'Em negociação', cor: '#E7A13A' },
  { key: 'Fechado ganho', cor: '#15805A' },
  { key: 'Fechado perdido', cor: '#C0392B' },
]

export const TEMPS: Temperatura[] = ['Quente', 'Morno', 'Frio']

export const TIPOS_OP: TipoOportunidade[] = [
  'Uniforme profissional',
  'Uniforme escolar',
  'Fardamento',
  'Camisetas / Brindes',
  'EPI',
  'Recompra',
]

export const ORIGENS: OrigemComercial[] = [
  'Indicação',
  'Instagram',
  'Prospecção ativa',
  'Site',
  'WhatsApp',
  'Evento',
  'Cliente recorrente',
  'Outro',
]

export const CANAIS = ['Ligação', 'WhatsApp', 'E-mail', 'Reunião', 'Mensagem', 'Visita', 'Outro']

export const MOTIVOS_PERDA = [
  'Preço',
  'Escolheu concorrente',
  'Sem retorno',
  'Prazo de entrega',
  'Fora do perfil',
  'Adiou a decisão',
  'Sem verba',
  'Outro',
]

export const TIPOS_ATIVIDADE = [
  'Follow-up',
  'Ligação',
  'Reunião comercial',
  'Visita',
  'Envio de proposta',
  'Vencimento de proposta',
]

/** Cor da temperatura (pontinho / selo). */
export const tempCor: Record<Temperatura, string> = {
  Quente: '#C0392B',
  Morno: '#E7A13A',
  Frio: '#2E86DE',
}

/** Cor do status da proposta. */
export const propCor: Record<StatusProposta, string> = {
  Enviada: '#2E86DE',
  'Em análise': '#E7A13A',
  Aceita: '#15805A',
  Recusada: '#C0392B',
}

export function corEtapa(e: EtapaCRM): string {
  return ETAPAS.find((x) => x.key === e)?.cor ?? '#64748B'
}

/* ------------------------------------------------------------------ *
 *  Utilidades de formatação
 * ------------------------------------------------------------------ */

export const uid = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

export const agora = () => new Date().toISOString()

/** ISO → 'dd/mm/aaaa'. Aceita ISO com ou sem hora. */
export function dmy(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`)
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`
}

/** Número → 'R$ 1.234' (sem centavos). */
export function brl(n: number): string {
  return (Number(n) || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  })
}

/** Versão compacta: 'R$ 12 mil' / 'R$ 1,2 mi'. */
export function brlc(n: number): string {
  const v = Number(n) || 0
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
  if (abs >= 1_000) return `R$ ${(v / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`
  return brl(v)
}

export const iniciais = (n: string) =>
  n.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()

/** Total de um item = quantidade × valor unitário. */
export const totalItem = (i: LeadItem) => (Number(i.qtd) || 0) * (Number(i.valorUnit) || 0)

/** Soma dos itens de venda do lead. */
export const valorItens = (itens?: LeadItem[]) => (itens ?? []).reduce((s, i) => s + totalItem(i), 0)

export function ehAtrasado(l: Lead): boolean {
  if (!l.proximaAtividade) return false
  if (l.etapa === 'Fechado ganho' || l.etapa === 'Fechado perdido') return false
  return new Date(l.proximaAtividade).getTime() < Date.now()
}

/* Leads, compromissos e produtos agora vivem no Supabase — ver leadsData.ts e produtosData.ts. */
