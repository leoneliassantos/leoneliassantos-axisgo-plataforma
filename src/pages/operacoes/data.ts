/* ================================================================== *
 *  Operações — Fluxo de Produção · camada de dados
 * ------------------------------------------------------------------ *
 *  Fala com o Supabase (tabelas op / op_produtos / op_produto_logo /
 *  op_produto_etapa / op_etapa_historico + cadastros clientes /
 *  uniformes / cores / fornecedores). Quando o Supabase não está
 *  configurado (modo DEMO), guarda tudo no localStorage do navegador,
 *  para dar para clicar e testar antes do banco estar ligado.
 * ================================================================== */
import { supabase, isSupabaseConfigured } from '../../lib/supabase'

export type Prioridade = 'alta' | 'media' | 'baixa'
export type StatusProd = 'ok' | 'atrasado' | 'alerta' | 'aguardando'
export type TipoLogo = 'Bordado' | 'Silk' | 'DTF'

export interface Etapa {
  id: string
  ordem: number
  label: string
}

/** As 10 fases do fluxo (espelham a tabela op_etapas — usadas também no modo demo). */
export const ETAPAS: Etapa[] = [
  { id: 'pedido', ordem: 1, label: 'Pedido de Venda' },
  { id: 'ficha', ordem: 2, label: 'Ficha Técnica' },
  { id: 'modelagem', ordem: 3, label: 'Modelagem' },
  { id: 'compra', ordem: 4, label: 'Compra de MP' },
  { id: 'corte', ordem: 5, label: 'Corte' },
  { id: 'logo', ordem: 6, label: 'Aplicação de Logomarca' },
  { id: 'oficina', ordem: 7, label: 'Oficina' },
  { id: 'acabamento', ordem: 8, label: 'Acabamento' },
  { id: 'finalizada', ordem: 9, label: 'Produção Finalizada' },
  { id: 'entrega', ordem: 10, label: 'Saiu para Entrega' },
]

/** Cor de destaque por etapa (só visual, para o quadro/stepper). */
export const ETAPA_COR: Record<string, string> = {
  pedido: '#0e9488', ficha: '#3574c4', modelagem: '#6d4bd0', compra: '#1f9d6b',
  corte: '#c98a12', logo: '#e2670a', oficina: '#4a6b86', acabamento: '#c23c86',
  finalizada: '#189f57', entrega: '#0e9488',
}

export const PRIO_LABEL: Record<Prioridade, string> = { alta: 'Alta', media: 'Média', baixa: 'Baixa' }
export const STATUS_LABEL: Record<StatusProd, string> = {
  ok: 'No prazo', atrasado: 'Atrasado', alerta: 'Alerta', aguardando: 'Aguardando',
}

export interface Cadastro {
  id: string
  nome: string
  apelido?: string | null
  contato?: string | null
  bloqueado?: boolean
}

export interface LogoItem {
  tipo: TipoLogo
  fornecedorId?: string | null
  fornecedorNome?: string
}

export interface HistEntry {
  id?: string
  kind: 'mov' | 'obs'
  etapaDe?: string | null
  etapaPara?: string | null
  data: string // YYYY-MM-DD
  texto?: string | null
}

export interface Produto {
  id: string
  opId: string
  uniformeId: string | null
  uniformeNome: string
  corId: string | null
  corNome: string
  numeroProposta: string
  numeroPedido: string
  qtd: number
  prioridade: Prioridade
  status: StatusProd
  etapaId: string
  progresso: number
  responsavel: string
  previsaoEntrega: string // YYYY-MM-DD | ''
  observacao: string
  logos: LogoItem[]
  datas: Record<string, string> // etapaId -> data conclusão
  historico: HistEntry[]
}

export interface Pedido {
  id: string
  clienteId: string
  clienteNome: string
  numeroProposta: string
  dataPedido: string // YYYY-MM-DD
  prioridade: Prioridade
  observacao: string
  produtos: Produto[]
}

export interface Cadastros {
  clientes: Cadastro[]
  uniformes: Cadastro[]
  cores: Cadastro[]
  fornecedores: Cadastro[]
}

export interface NovoProdutoInput {
  uniformeId: string | null
  corId: string | null
  numeroProposta: string
  numeroPedido: string
  qtd: number
  prioridade: Prioridade
  previsaoEntrega: string
  logos: { tipo: TipoLogo; fornecedorId: string | null }[]
}

export interface NovoPedidoInput {
  clienteId: string
  numeroProposta: string
  dataPedido: string
  prioridade: Prioridade
  produtos: NovoProdutoInput[]
}

export const isDemo = !isSupabaseConfigured

/** Progresso (0-100) a partir da etapa atual. */
export function progressoDaEtapa(etapaId: string): number {
  const idx = ETAPAS.findIndex((e) => e.id === etapaId)
  if (idx < 0) return 0
  return Math.round((idx / (ETAPAS.length - 1)) * 100)
}

export function etapaLabel(id: string): string {
  return ETAPAS.find((e) => e.id === id)?.label ?? id
}

/* ================================================================== *
 *  Modo DEMO — localStorage
 * ================================================================== */
const DEMO_KEY = 'axg_operacoes_demo'
interface DemoDB extends Cadastros {
  pedidos: Pedido[]
}
function demoLoad(): DemoDB {
  try {
    const raw = localStorage.getItem(DEMO_KEY)
    if (raw) return JSON.parse(raw) as DemoDB
  } catch {
    /* ignore */
  }
  return { clientes: [], uniformes: [], cores: [], fornecedores: [], pedidos: [] }
}
function demoSave(db: DemoDB) {
  localStorage.setItem(DEMO_KEY, JSON.stringify(db))
}
const uid = () => (crypto?.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.round(Math.random() * 1e6)}`)

/* ================================================================== *
 *  API pública
 * ================================================================== */

export async function loadCadastros(): Promise<Cadastros> {
  if (isDemo) {
    const db = demoLoad()
    return { clientes: db.clientes, uniformes: db.uniformes, cores: db.cores, fornecedores: db.fornecedores }
  }
  const [cli, uni, cor, forn] = await Promise.all([
    supabase!.from('clientes').select('id, nome, apelido, contato, bloqueado').order('nome'),
    supabase!.from('uniformes').select('id, nome, bloqueado').order('nome'),
    supabase!.from('cores').select('id, nome, bloqueado').order('nome'),
    supabase!.from('fornecedores').select('id, nome, bloqueado').order('nome'),
  ])
  const err = cli.error || uni.error || cor.error || forn.error
  if (err) throw new Error(err.message)
  return {
    clientes: (cli.data as Cadastro[]) ?? [],
    uniformes: (uni.data as Cadastro[]) ?? [],
    cores: (cor.data as Cadastro[]) ?? [],
    fornecedores: (forn.data as Cadastro[]) ?? [],
  }
}

export type TabelaCadastro = 'clientes' | 'uniformes' | 'cores' | 'fornecedores'

/** Colunas de leitura conforme a tabela (só clientes tem apelido/contato). */
function colunas(tabela: TabelaCadastro): string {
  return tabela === 'clientes' ? 'id, nome, apelido, contato, bloqueado' : 'id, nome, bloqueado'
}

export async function addCadastro(
  tabela: TabelaCadastro,
  nome: string,
  extra?: { apelido?: string; contato?: string },
): Promise<Cadastro> {
  const nomeTrim = nome.trim()
  if (isDemo) {
    const db = demoLoad()
    const existente = db[tabela].find((c) => c.nome.toLowerCase() === nomeTrim.toLowerCase())
    if (existente) return existente
    const novo: Cadastro = { id: uid(), nome: nomeTrim, apelido: extra?.apelido ?? null, contato: extra?.contato ?? null, bloqueado: false }
    db[tabela] = [...db[tabela], novo].sort((a, b) => a.nome.localeCompare(b.nome))
    demoSave(db)
    return novo
  }
  const payload: Record<string, unknown> = { nome: nomeTrim }
  if (tabela === 'clientes') {
    payload.apelido = extra?.apelido ?? null
    payload.contato = extra?.contato ?? null
  }
  const { data, error } = await supabase!.from(tabela).insert(payload).select(colunas(tabela)).single()
  if (error) {
    // Nome duplicado (índice único): busca o existente para reaproveitar.
    const { data: achou } = await supabase!.from(tabela).select(colunas(tabela)).ilike('nome', nomeTrim).limit(1)
    if (achou && achou.length) return achou[0] as unknown as Cadastro
    throw new Error(error.message)
  }
  return data as unknown as Cadastro
}

/** Edita nome (e, para clientes, apelido/contato). */
export async function updateCadastro(
  tabela: TabelaCadastro,
  id: string,
  patch: { nome?: string; apelido?: string; contato?: string },
): Promise<void> {
  if (isDemo) {
    const db = demoLoad()
    const item = db[tabela].find((c) => c.id === id)
    if (item) {
      if (patch.nome !== undefined) item.nome = patch.nome.trim()
      if (tabela === 'clientes') {
        if (patch.apelido !== undefined) item.apelido = patch.apelido || null
        if (patch.contato !== undefined) item.contato = patch.contato || null
      }
      db[tabela] = [...db[tabela]].sort((a, b) => a.nome.localeCompare(b.nome))
    }
    demoSave(db)
    return
  }
  const payload: Record<string, unknown> = {}
  if (patch.nome !== undefined) payload.nome = patch.nome.trim()
  if (tabela === 'clientes') {
    if (patch.apelido !== undefined) payload.apelido = patch.apelido || null
    if (patch.contato !== undefined) payload.contato = patch.contato || null
  }
  const { error } = await supabase!.from(tabela).update(payload).eq('id', id)
  if (error) throw new Error(error.message)
}

/** Bloqueia/desbloqueia um cadastro (nunca exclui). */
export async function setBloqueado(tabela: TabelaCadastro, id: string, bloqueado: boolean): Promise<void> {
  if (isDemo) {
    const db = demoLoad()
    const item = db[tabela].find((c) => c.id === id)
    if (item) item.bloqueado = bloqueado
    demoSave(db)
    return
  }
  const { error } = await supabase!.from(tabela).update({ bloqueado }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function loadPedidos(): Promise<Pedido[]> {
  if (isDemo) return demoLoad().pedidos
  const [ops, prods, logos, datas, hist] = await Promise.all([
    supabase!.from('op').select('id, cliente_id, numero_proposta, data_pedido, prioridade, observacao, clientes(nome)').order('data_pedido', { ascending: false }),
    supabase!.from('op_produtos').select('id, op_id, uniforme_id, cor_id, numero_proposta, numero_pedido, qtd, prioridade, status, etapa_id, progresso, responsavel, previsao_entrega, observacao, uniformes(nome), cores(nome)'),
    supabase!.from('op_produto_logo').select('produto_id, tipo, fornecedor_id, fornecedores(nome)'),
    supabase!.from('op_produto_etapa').select('produto_id, etapa_id, data_conclusao'),
    supabase!.from('op_etapa_historico').select('id, produto_id, kind, etapa_de, etapa_para, data, texto').order('created_at'),
  ])
  const err = ops.error || prods.error || logos.error || datas.error || hist.error
  if (err) throw new Error(err.message)

  const logosByProd = new Map<string, LogoItem[]>()
  for (const l of (logos.data ?? []) as Array<Record<string, unknown>>) {
    const arr = logosByProd.get(l.produto_id as string) ?? []
    arr.push({ tipo: l.tipo as TipoLogo, fornecedorId: (l.fornecedor_id as string) ?? null, fornecedorNome: rel(l.fornecedores) })
    logosByProd.set(l.produto_id as string, arr)
  }
  const datasByProd = new Map<string, Record<string, string>>()
  for (const d of (datas.data ?? []) as Array<Record<string, unknown>>) {
    const m = datasByProd.get(d.produto_id as string) ?? {}
    if (d.data_conclusao) m[d.etapa_id as string] = (d.data_conclusao as string).slice(0, 10)
    datasByProd.set(d.produto_id as string, m)
  }
  const histByProd = new Map<string, HistEntry[]>()
  for (const h of (hist.data ?? []) as Array<Record<string, unknown>>) {
    const arr = histByProd.get(h.produto_id as string) ?? []
    arr.push({
      id: h.id as string, kind: h.kind as 'mov' | 'obs',
      etapaDe: (h.etapa_de as string) ?? null, etapaPara: (h.etapa_para as string) ?? null,
      data: (h.data as string).slice(0, 10), texto: (h.texto as string) ?? null,
    })
    histByProd.set(h.produto_id as string, arr)
  }
  const prodsByOp = new Map<string, Produto[]>()
  for (const p of (prods.data ?? []) as Array<Record<string, unknown>>) {
    const arr = prodsByOp.get(p.op_id as string) ?? []
    arr.push({
      id: p.id as string, opId: p.op_id as string,
      uniformeId: (p.uniforme_id as string) ?? null, uniformeNome: rel(p.uniformes),
      corId: (p.cor_id as string) ?? null, corNome: rel(p.cores),
      numeroProposta: (p.numero_proposta as string) ?? '', numeroPedido: (p.numero_pedido as string) ?? '',
      qtd: Number(p.qtd) || 0, prioridade: (p.prioridade as Prioridade) ?? 'media',
      status: (p.status as StatusProd) ?? 'ok', etapaId: (p.etapa_id as string) ?? 'pedido',
      progresso: Number(p.progresso) || 0, responsavel: (p.responsavel as string) ?? '',
      previsaoEntrega: p.previsao_entrega ? (p.previsao_entrega as string).slice(0, 10) : '',
      observacao: (p.observacao as string) ?? '',
      logos: logosByProd.get(p.id as string) ?? [],
      datas: datasByProd.get(p.id as string) ?? {},
      historico: histByProd.get(p.id as string) ?? [],
    })
    prodsByOp.set(p.op_id as string, arr)
  }
  return ((ops.data ?? []) as Array<Record<string, unknown>>).map((o) => ({
    id: o.id as string, clienteId: o.cliente_id as string, clienteNome: rel(o.clientes),
    numeroProposta: (o.numero_proposta as string) ?? '', dataPedido: (o.data_pedido as string).slice(0, 10),
    prioridade: (o.prioridade as Prioridade) ?? 'media', observacao: (o.observacao as string) ?? '',
    produtos: prodsByOp.get(o.id as string) ?? [],
  }))
}

/** Extrai o `nome` de um relacionamento do PostgREST (objeto ou array). */
function rel(v: unknown): string {
  if (!v) return ''
  if (Array.isArray(v)) return (v[0] as { nome?: string })?.nome ?? ''
  return (v as { nome?: string })?.nome ?? ''
}

export async function createPedido(input: NovoPedidoInput, cadastros: Cadastros): Promise<void> {
  if (isDemo) {
    const db = demoLoad()
    const cliente = db.clientes.find((c) => c.id === input.clienteId)
    const opId = uid()
    const produtos: Produto[] = input.produtos.map((p) => {
      const uni = db.uniformes.find((u) => u.id === p.uniformeId)
      const cor = db.cores.find((c) => c.id === p.corId)
      return {
        id: uid(), opId, uniformeId: p.uniformeId, uniformeNome: uni?.nome ?? '',
        corId: p.corId, corNome: cor?.nome ?? '', numeroProposta: p.numeroProposta || input.numeroProposta,
        numeroPedido: p.numeroPedido, qtd: p.qtd, prioridade: p.prioridade, status: 'ok',
        etapaId: 'pedido', progresso: progressoDaEtapa('pedido'), responsavel: '',
        previsaoEntrega: p.previsaoEntrega, observacao: '',
        logos: p.logos.map((l) => ({ tipo: l.tipo, fornecedorId: l.fornecedorId, fornecedorNome: db.fornecedores.find((f) => f.id === l.fornecedorId)?.nome })),
        datas: {}, historico: [],
      }
    })
    db.pedidos = [
      { id: opId, clienteId: input.clienteId, clienteNome: cliente?.nome ?? '', numeroProposta: input.numeroProposta, dataPedido: input.dataPedido, prioridade: input.prioridade, observacao: '', produtos },
      ...db.pedidos,
    ]
    demoSave(db)
    return
  }

  const { data: op, error: opErr } = await supabase!
    .from('op')
    .insert({ cliente_id: input.clienteId, numero_proposta: input.numeroProposta || null, data_pedido: input.dataPedido, prioridade: input.prioridade })
    .select('id')
    .single()
  if (opErr) throw new Error(opErr.message)
  const opId = (op as { id: string }).id

  for (const p of input.produtos) {
    const { data: prod, error: pErr } = await supabase!
      .from('op_produtos')
      .insert({
        op_id: opId, uniforme_id: p.uniformeId, cor_id: p.corId,
        numero_proposta: p.numeroProposta || input.numeroProposta || null, numero_pedido: p.numeroPedido || null,
        qtd: p.qtd, prioridade: p.prioridade, status: 'ok', etapa_id: 'pedido', progresso: progressoDaEtapa('pedido'),
        previsao_entrega: p.previsaoEntrega || null,
      })
      .select('id')
      .single()
    if (pErr) throw new Error(pErr.message)
    const prodId = (prod as { id: string }).id
    if (p.logos.length) {
      const { error: lErr } = await supabase!
        .from('op_produto_logo')
        .insert(p.logos.map((l) => ({ produto_id: prodId, tipo: l.tipo, fornecedor_id: l.fornecedorId })))
      if (lErr) throw new Error(lErr.message)
    }
  }
  // Silencia o parâmetro não usado fora do modo demo.
  void cadastros
}

export interface ProdutoPatch {
  qtd?: number
  prioridade?: Prioridade
  status?: StatusProd
  responsavel?: string
  previsaoEntrega?: string
  observacao?: string
}

export async function updateProduto(id: string, patch: ProdutoPatch): Promise<void> {
  if (isDemo) {
    const db = demoLoad()
    for (const ped of db.pedidos) {
      const prod = ped.produtos.find((p) => p.id === id)
      if (prod) {
        if (patch.qtd !== undefined) prod.qtd = patch.qtd
        if (patch.prioridade !== undefined) prod.prioridade = patch.prioridade
        if (patch.status !== undefined) prod.status = patch.status
        if (patch.responsavel !== undefined) prod.responsavel = patch.responsavel
        if (patch.previsaoEntrega !== undefined) prod.previsaoEntrega = patch.previsaoEntrega
        if (patch.observacao !== undefined) prod.observacao = patch.observacao
        break
      }
    }
    demoSave(db)
    return
  }
  const payload: Record<string, unknown> = {}
  if (patch.qtd !== undefined) payload.qtd = patch.qtd
  if (patch.prioridade !== undefined) payload.prioridade = patch.prioridade
  if (patch.status !== undefined) payload.status = patch.status
  if (patch.responsavel !== undefined) payload.responsavel = patch.responsavel || null
  if (patch.previsaoEntrega !== undefined) payload.previsao_entrega = patch.previsaoEntrega || null
  if (patch.observacao !== undefined) payload.observacao = patch.observacao || null
  const { error } = await supabase!.from('op_produtos').update(payload).eq('id', id)
  if (error) throw new Error(error.message)
}

/** Move um item de etapa: grava histórico, data de conclusão da etapa de origem e recalcula o progresso. */
export async function moveProduto(id: string, de: string, para: string, data: string, obs: string): Promise<void> {
  const prog = progressoDaEtapa(para)
  if (isDemo) {
    const db = demoLoad()
    for (const ped of db.pedidos) {
      const prod = ped.produtos.find((p) => p.id === id)
      if (prod) {
        prod.etapaId = para
        prod.progresso = prog
        prod.datas[de] = data
        prod.historico.push({ kind: 'mov', etapaDe: de, etapaPara: para, data, texto: obs || null })
        break
      }
    }
    demoSave(db)
    return
  }
  const up = await supabase!.from('op_produtos').update({ etapa_id: para, progresso: prog }).eq('id', id)
  if (up.error) throw new Error(up.error.message)
  const ed = await supabase!.from('op_produto_etapa').upsert({ produto_id: id, etapa_id: de, data_conclusao: data }, { onConflict: 'produto_id,etapa_id' })
  if (ed.error) throw new Error(ed.error.message)
  const h = await supabase!.from('op_etapa_historico').insert({ produto_id: id, kind: 'mov', etapa_de: de, etapa_para: para, data, texto: obs || null })
  if (h.error) throw new Error(h.error.message)
}

export async function addObservacao(id: string, data: string, texto: string): Promise<void> {
  if (isDemo) {
    const db = demoLoad()
    for (const ped of db.pedidos) {
      const prod = ped.produtos.find((p) => p.id === id)
      if (prod) { prod.historico.push({ kind: 'obs', data, texto }); break }
    }
    demoSave(db)
    return
  }
  const { error } = await supabase!.from('op_etapa_historico').insert({ produto_id: id, kind: 'obs', data, texto })
  if (error) throw new Error(error.message)
}
