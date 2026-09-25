/**
 * Leads do CRM — persistidos no Supabase (tabela crm_leads). Os arrays aninhados
 * (itens de venda, atividades/histórico, propostas) ficam em colunas JSONB, o que
 * mantém a lógica de mutação simples (mexe no lead e regrava a linha inteira).
 * Compromissos (agenda) numa tabela própria (crm_compromissos).
 *
 * Segue o padrão do módulo Operações: usa o Supabase quando configurado; senão
 * cai num fallback local (demo/dev).
 */
import { isSupabaseConfigured, supabase } from '../../lib/supabase'
import {
  agora, uid,
  type Atividade, type Compromisso, type EtapaCRM, type Lead, type LeadItem,
  type OrigemComercial, type PropostaLead, type Temperatura, type TipoOportunidade,
} from './data'

const isDemo = !isSupabaseConfigured
const LEADS_KEY = 'axg_comercial_leads_demo'
const COMPROMISSOS_KEY = 'axg_comercial_compromissos_demo'

/* ------------------------------ mapeamento ------------------------------ */

type Row = Record<string, unknown>

const COLS =
  'id, nome, empresa, tipo, produto_interesse, origem, consultor, valor_potencial, etapa, probabilidade, temperatura, dias_sem_contato, proxima_atividade, telefone, email, motivo_perda, cnpj, cnpj_dados, cliente_op_id, apelido, itens, atividades, propostas, criado_em, atualizado_em'

function rowToLead(r: Row): Lead {
  const s = (v: unknown, d = '') => (v == null ? d : String(v))
  const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])
  return {
    id: s(r.id),
    nome: s(r.nome),
    empresa: s(r.empresa),
    tipo: s(r.tipo, 'Uniforme profissional') as TipoOportunidade,
    produtoInteresse: s(r.produto_interesse),
    origem: s(r.origem, 'Indicação') as OrigemComercial,
    consultor: s(r.consultor),
    valorPotencial: Number(r.valor_potencial) || 0,
    etapa: s(r.etapa, 'Novo lead') as EtapaCRM,
    probabilidade: Number(r.probabilidade) || 0,
    temperatura: s(r.temperatura, 'Morno') as Temperatura,
    diasSemContato: Number(r.dias_sem_contato) || 0,
    proximaAtividade: r.proxima_atividade ? String(r.proxima_atividade) : undefined,
    criadoEm: s(r.criado_em, agora()),
    atualizadoEm: s(r.atualizado_em, agora()),
    telefone: s(r.telefone),
    email: s(r.email),
    motivoPerda: r.motivo_perda ? String(r.motivo_perda) : undefined,
    cnpj: r.cnpj ? String(r.cnpj) : undefined,
    cnpjDados: (r.cnpj_dados as Lead['cnpjDados']) ?? undefined,
    clienteOpId: r.cliente_op_id ? String(r.cliente_op_id) : undefined,
    apelido: r.apelido ? String(r.apelido) : undefined,
    itens: arr<LeadItem>(r.itens),
    atividades: arr<Atividade>(r.atividades),
    propostas: arr<PropostaLead>(r.propostas),
  }
}

/** Colunas graváveis (sem id/criado_em). Usado no update e como base do insert. */
function leadToRow(l: Lead): Row {
  return {
    nome: l.nome,
    empresa: l.empresa,
    tipo: l.tipo,
    produto_interesse: l.produtoInteresse,
    origem: l.origem,
    consultor: l.consultor,
    valor_potencial: l.valorPotencial,
    etapa: l.etapa,
    probabilidade: l.probabilidade,
    temperatura: l.temperatura,
    dias_sem_contato: l.diasSemContato,
    proxima_atividade: l.proximaAtividade ?? null,
    telefone: l.telefone,
    email: l.email,
    motivo_perda: l.motivoPerda ?? null,
    cnpj: l.cnpj ?? null,
    cnpj_dados: l.cnpjDados ?? null,
    cliente_op_id: l.clienteOpId || null,
    apelido: l.apelido ?? null,
    itens: l.itens ?? [],
    atividades: l.atividades ?? [],
    propostas: l.propostas ?? [],
    atualizado_em: l.atualizadoEm ?? agora(),
  }
}

/* ------------------------------ demo/local ------------------------------ */

function demoLoadLeads(): Lead[] {
  try {
    const raw = localStorage.getItem(LEADS_KEY)
    if (raw) return JSON.parse(raw) as Lead[]
  } catch {
    /* ignore */
  }
  return []
}
function demoSaveLeads(list: Lead[]) {
  try {
    localStorage.setItem(LEADS_KEY, JSON.stringify(list))
  } catch {
    /* ignore */
  }
}

/* ------------------------------ API: leads ------------------------------ */

export async function loadLeads(): Promise<Lead[]> {
  if (isDemo) {
    return demoLoadLeads().sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
  }
  const { data, error } = await supabase!
    .from('crm_leads')
    .select(COLS)
    .order('criado_em', { ascending: false })
  if (error) throw new Error(error.message)
  return ((data as Row[]) ?? []).map(rowToLead)
}

/** Cria um lead. No Supabase o id (uuid) é gerado pelo banco e devolvido. */
export async function createLead(l: Lead): Promise<Lead> {
  if (isDemo) {
    const novo: Lead = { ...l, id: uid() }
    demoSaveLeads([novo, ...demoLoadLeads()])
    return novo
  }
  const { data, error } = await supabase!
    .from('crm_leads')
    .insert({ ...leadToRow(l), criado_em: l.criadoEm ?? agora() })
    .select(COLS)
    .single()
  if (error) throw new Error(error.message)
  return rowToLead(data as Row)
}

/** Regrava um lead existente (linha inteira). */
export async function saveLead(l: Lead): Promise<void> {
  if (isDemo) {
    const list = demoLoadLeads()
    const idx = list.findIndex((x) => x.id === l.id)
    if (idx >= 0) list[idx] = l
    else list.unshift(l)
    demoSaveLeads(list)
    return
  }
  const { error } = await supabase!.from('crm_leads').update(leadToRow(l)).eq('id', l.id)
  if (error) throw new Error(error.message)
}

export async function deleteLead(id: string): Promise<void> {
  if (isDemo) {
    demoSaveLeads(demoLoadLeads().filter((x) => x.id !== id))
    return
  }
  const { error } = await supabase!.from('crm_leads').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/* --------------------------- API: compromissos --------------------------- */

export async function loadCompromissos(): Promise<Compromisso[]> {
  if (isDemo) {
    try {
      const raw = localStorage.getItem(COMPROMISSOS_KEY)
      if (raw) return JSON.parse(raw) as Compromisso[]
    } catch {
      /* ignore */
    }
    return []
  }
  const { data, error } = await supabase!
    .from('crm_compromissos')
    .select('id, lead_id, titulo, tipo, data, responsavel, concluido, cliente, descricao, relacionado_a')
    .order('data', { ascending: true })
  if (error) throw new Error(error.message)
  return ((data as Row[]) ?? []).map((r) => ({
    id: String(r.id),
    titulo: String(r.titulo ?? ''),
    tipo: String(r.tipo ?? ''),
    data: String(r.data ?? ''),
    responsavel: String(r.responsavel ?? ''),
    concluido: r.concluido === true,
    cliente: r.cliente ? String(r.cliente) : undefined,
    descricao: r.descricao ? String(r.descricao) : undefined,
    relacionadoA: r.relacionado_a ? String(r.relacionado_a) : undefined,
  }))
}

export async function addCompromisso(c: Compromisso, leadId?: string): Promise<void> {
  if (isDemo) {
    let list: Compromisso[] = []
    try {
      const raw = localStorage.getItem(COMPROMISSOS_KEY)
      if (raw) list = JSON.parse(raw) as Compromisso[]
    } catch {
      /* ignore */
    }
    localStorage.setItem(COMPROMISSOS_KEY, JSON.stringify([...list, c]))
    return
  }
  const { error } = await supabase!.from('crm_compromissos').insert({
    lead_id: leadId ?? null,
    titulo: c.titulo,
    tipo: c.tipo,
    data: c.data,
    responsavel: c.responsavel,
    concluido: c.concluido,
    cliente: c.cliente ?? null,
    descricao: c.descricao ?? null,
  })
  if (error) throw new Error(error.message)
}
