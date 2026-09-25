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

import { useCallback, useState } from 'react'
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

/** Produto do catálogo (gerido na tela Produtos), com valor por peça. */
export interface Produto {
  id: string
  nome: string
  valorUnitario: number // valor de venda por peça
  ativo: boolean
}

/** Item de venda dentro de um lead (produto escolhido + quantidade). */
export interface LeadItem {
  id: string
  produtoId: string
  produtoNome: string // snapshot do nome no momento
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

/* ------------------------------------------------------------------ *
 *  Persistência (localStorage)
 * ------------------------------------------------------------------ */

const KEY = 'axg_comercial_mm_v1'

export interface ComercialDB {
  _v: number
  leads: Lead[]
  compromissos: Compromisso[]
  produtos: Produto[]
}

const VERSAO = 1

/** Garante que campos/arrays adicionados depois existam em bases antigas. */
function normaliza(db: ComercialDB): ComercialDB {
  db.leads = Array.isArray(db.leads) ? db.leads : []
  db.compromissos = Array.isArray(db.compromissos) ? db.compromissos : []
  db.produtos = Array.isArray(db.produtos) ? db.produtos : seedProdutos()
  for (const l of db.leads) if (!Array.isArray(l.itens)) l.itens = []
  return db
}

export function loadDB(): ComercialDB {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as ComercialDB
      if (parsed && parsed._v === VERSAO && Array.isArray(parsed.leads)) {
        const norm = normaliza(parsed)
        saveDB(norm)
        return norm
      }
    }
  } catch {
    /* ignore */
  }
  const seed = seedDB()
  saveDB(seed)
  return seed
}

/** Hook de estado compartilhado pelas telas do Comercial (CRM e Produtos). */
export function useComercialStore() {
  const [db, setDb] = useState<ComercialDB>(loadDB)
  const update = useCallback((fn: (d: ComercialDB) => void) => {
    setDb((prev) => {
      const next = structuredClone(prev) as ComercialDB
      fn(next)
      saveDB(next)
      return next
    })
  }, [])
  return { db, setDb, update }
}

export function saveDB(db: ComercialDB) {
  try {
    localStorage.setItem(KEY, JSON.stringify(db))
  } catch {
    /* ignore */
  }
}

/** Zera os leads/agenda de exemplo (mantém o catálogo de produtos). */
export function resetDB(): ComercialDB {
  const atual = loadDB()
  const vazio: ComercialDB = { _v: VERSAO, leads: [], compromissos: [], produtos: atual.produtos }
  saveDB(vazio)
  return vazio
}

/** Produtos de exemplo (apagáveis/editáveis na tela Produtos). */
function seedProdutos(): Produto[] {
  return [
    { id: uid(), nome: 'Camisa polo piquê (bordada)', valorUnitario: 48, ativo: true },
    { id: uid(), nome: 'Camiseta malha PV (silk)', valorUnitario: 29, ativo: true },
    { id: uid(), nome: 'Camiseta dry-fit personalizada', valorUnitario: 39, ativo: true },
    { id: uid(), nome: 'Jaleco / avental', valorUnitario: 65, ativo: true },
    { id: uid(), nome: 'Colete refletivo', valorUnitario: 42, ativo: true },
    { id: uid(), nome: 'Calça de brim', valorUnitario: 79, ativo: true },
    { id: uid(), nome: 'Boné bordado', valorUnitario: 22, ativo: true },
  ]
}

/* ------------------------------------------------------------------ *
 *  Seed de exemplo (dados FICTÍCIOS — apagáveis pelo botão da tela)
 *  Servem só para visualizar o funil enquanto ajustamos o perfil.
 * ------------------------------------------------------------------ */

function diasAtras(n: number): string {
  const d = new Date()
  d.setHours(9, 0, 0, 0)
  d.setDate(d.getDate() - n)
  return d.toISOString()
}
function daquiA(n: number): string {
  const d = new Date()
  d.setHours(9, 0, 0, 0)
  d.setDate(d.getDate() + n)
  return d.toISOString()
}

function seedDB(): ComercialDB {
  const mk = (p: Partial<Lead> & Pick<Lead, 'nome' | 'empresa' | 'etapa'>): Lead => ({
    id: uid(),
    nome: p.nome,
    empresa: p.empresa,
    tipo: p.tipo ?? 'Uniforme profissional',
    produtoInteresse: p.produtoInteresse ?? '',
    origem: p.origem ?? 'Indicação',
    consultor: p.consultor ?? 'Comercial MM',
    valorPotencial: p.valorPotencial ?? 0,
    etapa: p.etapa,
    probabilidade: p.probabilidade ?? 20,
    temperatura: p.temperatura ?? 'Morno',
    diasSemContato: p.diasSemContato ?? 0,
    proximaAtividade: p.proximaAtividade,
    criadoEm: p.criadoEm ?? diasAtras(10),
    atualizadoEm: p.atualizadoEm ?? diasAtras(2),
    telefone: p.telefone ?? '',
    email: p.email ?? '',
    motivoPerda: p.motivoPerda,
    atividades: p.atividades ?? [{ data: p.criadoEm ?? diasAtras(10), tipo: 'Criação', texto: 'Lead de exemplo.' }],
    propostas: p.propostas ?? [],
  })

  const leads: Lead[] = [
    mk({
      nome: 'Mariana Alves', empresa: 'Colégio Horizonte', tipo: 'Uniforme escolar',
      produtoInteresse: 'Kit uniforme fundamental (camisa + agasalho)', origem: 'Site',
      valorPotencial: 48000, etapa: 'Novo lead', probabilidade: 15, temperatura: 'Morno',
      telefone: '(11) 99123-4567', email: 'mariana@colegiohorizonte.com.br',
      diasSemContato: 1, proximaAtividade: daquiA(2),
    }),
    mk({
      nome: 'Ricardo Souza', empresa: 'Construtora Alfa', tipo: 'EPI',
      produtoInteresse: 'Camisas de brim + coletes refletivos (120 peças)', origem: 'Indicação',
      valorPotencial: 32000, etapa: 'Contato realizado', probabilidade: 30, temperatura: 'Quente',
      telefone: '(11) 98888-2211', email: 'ricardo@construtoraalfa.com', diasSemContato: 2,
      proximaAtividade: daquiA(1),
    }),
    mk({
      nome: 'Patrícia Lima', empresa: 'Rede Sabor & Cia', tipo: 'Uniforme profissional',
      produtoInteresse: 'Aventais e camisetas para 3 unidades', origem: 'Instagram',
      valorPotencial: 21500, etapa: 'Levantamento', probabilidade: 40, temperatura: 'Morno',
      telefone: '(11) 97777-8080', email: 'compras@saborecia.com.br', diasSemContato: 3,
      proximaAtividade: daquiA(3),
    }),
    mk({
      nome: 'Eduardo Nunes', empresa: 'TransLog Transportes', tipo: 'Fardamento',
      produtoInteresse: 'Fardamento operacional (80 colaboradores)', origem: 'Prospecção ativa',
      valorPotencial: 56000, etapa: 'Proposta enviada', probabilidade: 55, temperatura: 'Quente',
      telefone: '(11) 96666-1200', email: 'eduardo@translog.com.br', diasSemContato: 4,
      proximaAtividade: diasAtras(1), // atrasado de propósito, para mostrar o alerta
      propostas: [{ id: uid(), nome: 'Proposta_TransLog_v1.pdf', data: diasAtras(4), valor: 56000, status: 'Enviada' }],
    }),
    mk({
      nome: 'Camila Ferreira', empresa: 'Academia MoveFit', tipo: 'Camisetas / Brindes',
      produtoInteresse: 'Camisetas dry-fit personalizadas (200 un)', origem: 'WhatsApp',
      valorPotencial: 18000, etapa: 'Em negociação', probabilidade: 70, temperatura: 'Quente',
      telefone: '(11) 95555-3322', email: 'camila@movefit.com', diasSemContato: 1,
      proximaAtividade: daquiA(1),
      propostas: [{ id: uid(), nome: 'Proposta_MoveFit.pdf', data: diasAtras(3), valor: 18000, status: 'Em análise' }],
    }),
    mk({
      nome: 'João Batista', empresa: 'Supermercado BomPreço', tipo: 'Uniforme profissional',
      produtoInteresse: 'Coletes e camisas para operadores', origem: 'Cliente recorrente',
      valorPotencial: 27000, etapa: 'Fechado ganho', probabilidade: 100, temperatura: 'Quente',
      telefone: '(11) 94444-7788', email: 'joao@bompreco.com.br', diasSemContato: 0,
      atualizadoEm: diasAtras(1),
      propostas: [{ id: uid(), nome: 'Proposta_BomPreco.pdf', data: diasAtras(8), valor: 27000, status: 'Aceita' }],
    }),
    mk({
      nome: 'Fernanda Rocha', empresa: 'Clínica VidaPlena', tipo: 'Uniforme profissional',
      produtoInteresse: 'Jalecos e scrubs', origem: 'Indicação',
      valorPotencial: 15000, etapa: 'Fechado perdido', probabilidade: 0, temperatura: 'Frio',
      telefone: '(11) 93333-9911', email: 'fernanda@vidaplena.com', diasSemContato: 12,
      motivoPerda: 'Escolheu concorrente', atualizadoEm: diasAtras(6),
    }),
  ]

  return { _v: VERSAO, leads, compromissos: [], produtos: seedProdutos() }
}
