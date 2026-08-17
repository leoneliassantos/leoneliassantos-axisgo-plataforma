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
  { id: 'entregue', ordem: 11, label: 'Entregue/Finalizado' },
]

/** Etapas a partir das quais o item é considerado PRODUZIDO (Saiu para Entrega em diante). */
export const ETAPAS_PRODUZIDO = ['entrega', 'entregue']
/** true se o item já saiu da produção (ordem >= "Saiu para Entrega"). */
export function isProduzido(etapaId: string): boolean {
  return ETAPAS_PRODUZIDO.includes(etapaId)
}

/** Cor de destaque por etapa (só visual, para o quadro/stepper). */
export const ETAPA_COR: Record<string, string> = {
  pedido: '#0e9488', ficha: '#3574c4', modelagem: '#6d4bd0', compra: '#1f9d6b',
  corte: '#c98a12', logo: '#e2670a', oficina: '#4a6b86', acabamento: '#c23c86',
  finalizada: '#189f57', entrega: '#0e9488', entregue: '#0f7a3d',
}

export const PRIO_LABEL: Record<Prioridade, string> = { alta: 'Alta', media: 'Média', baixa: 'Baixa' }
export const STATUS_LABEL: Record<StatusProd, string> = {
  ok: 'No prazo', atrasado: 'Atrasado', alerta: 'Alerta', aguardando: 'Aguardando',
}

/** Grade de tamanhos: tamanho -> quantidade de peças (só guarda os > 0). */
export type Grade = Record<string, number>
/** Tamanhos da grade, em duas linhas (espelham a tela). */
export const TAMANHOS_LINHA1 = ['PP', 'P', 'M', 'G', 'GG', 'EXG', 'SGG', 'E', 'TU']
export const TAMANHOS_LINHA2 = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']
export const TAMANHOS = [...TAMANHOS_LINHA1, ...TAMANHOS_LINHA2]
/** Soma das peças distribuídas na grade. */
export function somaGrade(g: Grade): number {
  return Object.values(g || {}).reduce((s, n) => s + (Number(n) || 0), 0)
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
  usuario?: string | null
}

export interface Produto {
  id: string
  opId: string
  uniformeId: string | null
  uniformeNome: string
  corId: string | null
  corNome: string
  tecidoId: string | null
  tecidoNome: string
  numeroProposta: string
  numeroPedido: string
  qtd: number
  prioridade: Prioridade
  status: StatusProd // situação EFETIVA (automática ou manual) — usada em toda exibição/resumo
  situacaoAuto: boolean // true = situação calculada pela data de entrega; false = manual
  situacaoManual: StatusProd // valor manual escolhido (usado quando situacaoAuto = false)
  etapaId: string
  progresso: number
  responsavel: string
  previsaoEntrega: string // YYYY-MM-DD | ''
  observacao: string
  grade: Grade
  logos: LogoItem[]
  datas: Record<string, string> // etapaId -> data conclusão
  historico: HistEntry[]
}

export interface Pedido {
  id: string
  clienteId: string
  clienteNome: string
  numeroProposta: string
  numeroPedido: string
  dataPedido: string // YYYY-MM-DD
  prioridade: Prioridade
  evento: boolean
  amostra: boolean
  dataEntrega: string // YYYY-MM-DD | '' — alimenta a previsão dos itens
  observacao: string
  produtos: Produto[]
}

export interface Cadastros {
  clientes: Cadastro[]
  uniformes: Cadastro[]
  cores: Cadastro[]
  tecidos: Cadastro[]
  fornecedores: Cadastro[]
}

export interface NovoProdutoInput {
  uniformeId: string | null
  corId: string | null
  tecidoId: string | null
  numeroProposta: string
  numeroPedido: string
  qtd: number
  prioridade: Prioridade
  previsaoEntrega: string
  observacao: string
  grade: Grade
  logos: { tipo: TipoLogo; fornecedorId: string | null }[]
}

export interface NovoPedidoInput {
  clienteId: string
  numeroProposta: string
  numeroPedido: string
  dataPedido: string
  prioridade: Prioridade
  evento: boolean
  amostra: boolean
  dataEntrega: string
  observacao: string
  produtos: NovoProdutoInput[]
}

export const isDemo = !isSupabaseConfigured

/** Dias entre hoje (00h local) e uma data ISO (alvo - hoje). Vazio → 0. */
function diasAte(iso: string): number {
  if (!iso) return 0
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const alvo = new Date(`${iso}T00:00:00`)
  return Math.round((alvo.getTime() - hoje.getTime()) / 86400000)
}

/** Nº de dias para disparar o "Alerta" automático antes da entrega. */
export const ALERTA_DIAS = 3

/**
 * Situação AUTOMÁTICA de um item pela previsão de entrega:
 * já saiu para entrega/entregue → No prazo; vencida → Atrasado;
 * faltando ≤ ALERTA_DIAS → Alerta; senão → No prazo. Sem data → No prazo.
 */
export function situacaoAutomatica(previsaoEntrega: string, etapaId: string): StatusProd {
  if (isProduzido(etapaId)) return 'ok'
  if (!previsaoEntrega) return 'ok'
  const dias = diasAte(previsaoEntrega)
  if (dias < 0) return 'atrasado'
  if (dias <= ALERTA_DIAS) return 'alerta'
  return 'ok'
}

/** Devolve a situação EFETIVA do item (automática quando situacaoAuto, senão a manual). */
export function situacaoEfetiva(p: { situacaoAuto: boolean; situacaoManual: StatusProd; previsaoEntrega: string; etapaId: string }): StatusProd {
  return p.situacaoAuto ? situacaoAutomatica(p.previsaoEntrega, p.etapaId) : p.situacaoManual
}

/** Texto explicativo da regra da situação (para tooltips). */
export const SITUACAO_REGRA =
  'Situação calculada pela previsão de entrega:\n' +
  '• Atrasado — a previsão já venceu e o item não saiu para entrega\n' +
  `• Alerta — faltam ${ALERTA_DIAS} dias ou menos para a entrega\n` +
  `• No prazo — mais de ${ALERTA_DIAS} dias, sem data, ou item já entregue\n` +
  'Pode ser definida manualmente no detalhe do item.'

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
  const vazio: DemoDB = { clientes: [], uniformes: [], cores: [], tecidos: [], fornecedores: [], pedidos: [] }
  try {
    const raw = localStorage.getItem(DEMO_KEY)
    if (raw) return { ...vazio, ...(JSON.parse(raw) as Partial<DemoDB>) }
  } catch {
    /* ignore */
  }
  return vazio
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
    return { clientes: db.clientes, uniformes: db.uniformes, cores: db.cores, tecidos: db.tecidos, fornecedores: db.fornecedores }
  }
  const [cli, uni, cor, tec, forn] = await Promise.all([
    supabase!.from('clientes').select('id, nome, apelido, contato, bloqueado').order('nome'),
    supabase!.from('uniformes').select('id, nome, bloqueado').order('nome'),
    supabase!.from('cores').select('id, nome, bloqueado').order('nome'),
    supabase!.from('tecidos').select('id, nome, bloqueado').order('nome'),
    supabase!.from('fornecedores').select('id, nome, bloqueado').order('nome'),
  ])
  const err = cli.error || uni.error || cor.error || tec.error || forn.error
  if (err) throw new Error(err.message)
  return {
    clientes: (cli.data as Cadastro[]) ?? [],
    uniformes: (uni.data as Cadastro[]) ?? [],
    cores: (cor.data as Cadastro[]) ?? [],
    tecidos: (tec.data as Cadastro[]) ?? [],
    fornecedores: (forn.data as Cadastro[]) ?? [],
  }
}

export type TabelaCadastro = 'clientes' | 'uniformes' | 'cores' | 'tecidos' | 'fornecedores'

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
  if (isDemo) {
    return demoLoad().pedidos.map((ped) => ({
      ...ped,
      produtos: ped.produtos.map((p) => {
        const situacaoAuto = p.situacaoAuto ?? true
        const situacaoManual = p.situacaoManual ?? p.status ?? 'ok'
        return { ...p, situacaoAuto, situacaoManual, status: situacaoEfetiva({ situacaoAuto, situacaoManual, previsaoEntrega: p.previsaoEntrega, etapaId: p.etapaId }) }
      }),
    }))
  }
  const [ops, prods, logos, datas, hist] = await Promise.all([
    supabase!.from('op').select('id, cliente_id, numero_proposta, numero_pedido, data_pedido, prioridade, evento, amostra, data_entrega, observacao, clientes(nome)').order('data_pedido', { ascending: false }),
    supabase!.from('op_produtos').select('id, op_id, uniforme_id, cor_id, tecido_id, numero_proposta, numero_pedido, qtd, prioridade, status, situacao_auto, etapa_id, progresso, responsavel, previsao_entrega, observacao, grade, uniformes(nome), cores(nome), tecidos(nome)'),
    supabase!.from('op_produto_logo').select('produto_id, tipo, fornecedor_id, fornecedores(nome)'),
    supabase!.from('op_produto_etapa').select('produto_id, etapa_id, data_conclusao'),
    supabase!.from('op_etapa_historico').select('id, produto_id, kind, etapa_de, etapa_para, data, texto, usuario').order('created_at'),
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
      usuario: (h.usuario as string) ?? null,
    })
    histByProd.set(h.produto_id as string, arr)
  }
  const prodsByOp = new Map<string, Produto[]>()
  for (const p of (prods.data ?? []) as Array<Record<string, unknown>>) {
    const arr = prodsByOp.get(p.op_id as string) ?? []
    const manual = (p.status as StatusProd) ?? 'ok'
    const auto = p.situacao_auto !== false // default: automático
    const etapa = (p.etapa_id as string) ?? 'pedido'
    const prev = p.previsao_entrega ? (p.previsao_entrega as string).slice(0, 10) : ''
    arr.push({
      id: p.id as string, opId: p.op_id as string,
      uniformeId: (p.uniforme_id as string) ?? null, uniformeNome: rel(p.uniformes),
      corId: (p.cor_id as string) ?? null, corNome: rel(p.cores),
      tecidoId: (p.tecido_id as string) ?? null, tecidoNome: rel(p.tecidos),
      numeroProposta: (p.numero_proposta as string) ?? '', numeroPedido: (p.numero_pedido as string) ?? '',
      qtd: Number(p.qtd) || 0, prioridade: (p.prioridade as Prioridade) ?? 'media',
      status: situacaoEfetiva({ situacaoAuto: auto, situacaoManual: manual, previsaoEntrega: prev, etapaId: etapa }),
      situacaoAuto: auto, situacaoManual: manual,
      etapaId: etapa,
      progresso: Number(p.progresso) || 0, responsavel: (p.responsavel as string) ?? '',
      previsaoEntrega: prev,
      observacao: (p.observacao as string) ?? '',
      grade: (p.grade as Grade) ?? {},
      logos: logosByProd.get(p.id as string) ?? [],
      datas: datasByProd.get(p.id as string) ?? {},
      historico: histByProd.get(p.id as string) ?? [],
    })
    prodsByOp.set(p.op_id as string, arr)
  }
  return ((ops.data ?? []) as Array<Record<string, unknown>>).map((o) => ({
    id: o.id as string, clienteId: o.cliente_id as string, clienteNome: rel(o.clientes),
    numeroProposta: (o.numero_proposta as string) ?? '', numeroPedido: (o.numero_pedido as string) ?? '',
    dataPedido: (o.data_pedido as string).slice(0, 10),
    prioridade: (o.prioridade as Prioridade) ?? 'media',
    evento: !!o.evento, amostra: !!o.amostra,
    dataEntrega: o.data_entrega ? (o.data_entrega as string).slice(0, 10) : '',
    observacao: (o.observacao as string) ?? '',
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
      const tec = db.tecidos.find((t) => t.id === p.tecidoId)
      return {
        id: uid(), opId, uniformeId: p.uniformeId, uniformeNome: uni?.nome ?? '',
        corId: p.corId, corNome: cor?.nome ?? '', tecidoId: p.tecidoId, tecidoNome: tec?.nome ?? '',
        numeroProposta: p.numeroProposta || input.numeroProposta,
        numeroPedido: p.numeroPedido, qtd: p.qtd, prioridade: p.prioridade, status: 'ok', situacaoAuto: true, situacaoManual: 'ok',
        etapaId: 'pedido', progresso: progressoDaEtapa('pedido'), responsavel: '',
        previsaoEntrega: p.previsaoEntrega, observacao: p.observacao, grade: p.grade ?? {},
        logos: p.logos.map((l) => ({ tipo: l.tipo, fornecedorId: l.fornecedorId, fornecedorNome: db.fornecedores.find((f) => f.id === l.fornecedorId)?.nome })),
        datas: {}, historico: [],
      }
    })
    db.pedidos = [
      { id: opId, clienteId: input.clienteId, clienteNome: cliente?.nome ?? '', numeroProposta: input.numeroProposta, numeroPedido: input.numeroPedido, dataPedido: input.dataPedido, prioridade: input.prioridade, evento: input.evento, amostra: input.amostra, dataEntrega: input.dataEntrega, observacao: input.observacao, produtos },
      ...db.pedidos,
    ]
    demoSave(db)
    return
  }

  const { data: op, error: opErr } = await supabase!
    .from('op')
    .insert({ cliente_id: input.clienteId, numero_proposta: input.numeroProposta || null, numero_pedido: input.numeroPedido || null, data_pedido: input.dataPedido, prioridade: input.prioridade, evento: input.evento, amostra: input.amostra, data_entrega: input.dataEntrega || null, observacao: input.observacao || null })
    .select('id')
    .single()
  if (opErr) throw new Error(opErr.message)
  const opId = (op as { id: string }).id

  for (const p of input.produtos) {
    const { data: prod, error: pErr } = await supabase!
      .from('op_produtos')
      .insert({
        op_id: opId, uniforme_id: p.uniformeId, cor_id: p.corId, tecido_id: p.tecidoId,
        numero_proposta: p.numeroProposta || input.numeroProposta || null, numero_pedido: p.numeroPedido || input.numeroPedido || null,
        qtd: p.qtd, prioridade: p.prioridade, status: 'ok', situacao_auto: true, etapa_id: 'pedido', progresso: progressoDaEtapa('pedido'),
        previsao_entrega: p.previsaoEntrega || null, observacao: p.observacao || null, grade: p.grade ?? {},
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

/** Acrescenta UM produto a uma OP já existente (complementar a OP). */
export async function addProduto(opId: string, p: NovoProdutoInput): Promise<void> {
  if (isDemo) {
    const db = demoLoad()
    const ped = db.pedidos.find((o) => o.id === opId)
    if (!ped) return
    const uni = db.uniformes.find((u) => u.id === p.uniformeId)
    const cor = db.cores.find((c) => c.id === p.corId)
    const tec = db.tecidos.find((t) => t.id === p.tecidoId)
    ped.produtos.push({
      id: uid(), opId, uniformeId: p.uniformeId, uniformeNome: uni?.nome ?? '',
      corId: p.corId, corNome: cor?.nome ?? '', tecidoId: p.tecidoId, tecidoNome: tec?.nome ?? '',
      numeroProposta: p.numeroProposta, numeroPedido: p.numeroPedido, qtd: p.qtd,
      prioridade: p.prioridade, status: 'ok', situacaoAuto: true, situacaoManual: 'ok', etapaId: 'pedido', progresso: progressoDaEtapa('pedido'),
      responsavel: '', previsaoEntrega: p.previsaoEntrega, observacao: p.observacao, grade: p.grade ?? {},
      logos: p.logos.map((l) => ({ tipo: l.tipo, fornecedorId: l.fornecedorId, fornecedorNome: db.fornecedores.find((f) => f.id === l.fornecedorId)?.nome })),
      datas: {}, historico: [],
    })
    demoSave(db)
    return
  }
  const { data: prod, error } = await supabase!
    .from('op_produtos')
    .insert({
      op_id: opId, uniforme_id: p.uniformeId, cor_id: p.corId, tecido_id: p.tecidoId,
      numero_proposta: p.numeroProposta || null, numero_pedido: p.numeroPedido || null,
      qtd: p.qtd, prioridade: p.prioridade, status: 'ok', situacao_auto: true, etapa_id: 'pedido', progresso: progressoDaEtapa('pedido'),
      previsao_entrega: p.previsaoEntrega || null, observacao: p.observacao || null, grade: p.grade ?? {},
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  const prodId = (prod as { id: string }).id
  if (p.logos.length) {
    const { error: lErr } = await supabase!
      .from('op_produto_logo')
      .insert(p.logos.map((l) => ({ produto_id: prodId, tipo: l.tipo, fornecedor_id: l.fornecedorId })))
    if (lErr) throw new Error(lErr.message)
  }
}

export interface ProdutoPatch {
  uniformeId?: string | null
  corId?: string | null
  tecidoId?: string | null
  numeroProposta?: string
  numeroPedido?: string
  qtd?: number
  prioridade?: Prioridade
  situacaoAuto?: boolean
  situacaoManual?: StatusProd
  responsavel?: string
  previsaoEntrega?: string
  observacao?: string
  grade?: Grade
}

export async function updateProduto(id: string, patch: ProdutoPatch): Promise<void> {
  if (isDemo) {
    const db = demoLoad()
    for (const ped of db.pedidos) {
      const prod = ped.produtos.find((p) => p.id === id)
      if (prod) {
        if (patch.uniformeId !== undefined) { prod.uniformeId = patch.uniformeId; prod.uniformeNome = db.uniformes.find((u) => u.id === patch.uniformeId)?.nome ?? '' }
        if (patch.corId !== undefined) { prod.corId = patch.corId; prod.corNome = db.cores.find((c) => c.id === patch.corId)?.nome ?? '' }
        if (patch.tecidoId !== undefined) { prod.tecidoId = patch.tecidoId; prod.tecidoNome = db.tecidos.find((t) => t.id === patch.tecidoId)?.nome ?? '' }
        if (patch.numeroProposta !== undefined) prod.numeroProposta = patch.numeroProposta
        if (patch.numeroPedido !== undefined) prod.numeroPedido = patch.numeroPedido
        if (patch.qtd !== undefined) prod.qtd = patch.qtd
        if (patch.prioridade !== undefined) prod.prioridade = patch.prioridade
        if (patch.situacaoAuto !== undefined) prod.situacaoAuto = patch.situacaoAuto
        if (patch.situacaoManual !== undefined) prod.situacaoManual = patch.situacaoManual
        if (patch.responsavel !== undefined) prod.responsavel = patch.responsavel
        if (patch.previsaoEntrega !== undefined) prod.previsaoEntrega = patch.previsaoEntrega
        if (patch.observacao !== undefined) prod.observacao = patch.observacao
        if (patch.grade !== undefined) prod.grade = patch.grade
        prod.status = situacaoEfetiva(prod) // recalcula a efetiva após a edição
        break
      }
    }
    demoSave(db)
    return
  }
  const payload: Record<string, unknown> = {}
  if (patch.uniformeId !== undefined) payload.uniforme_id = patch.uniformeId
  if (patch.corId !== undefined) payload.cor_id = patch.corId
  if (patch.tecidoId !== undefined) payload.tecido_id = patch.tecidoId
  if (patch.numeroProposta !== undefined) payload.numero_proposta = patch.numeroProposta || null
  if (patch.numeroPedido !== undefined) payload.numero_pedido = patch.numeroPedido || null
  if (patch.qtd !== undefined) payload.qtd = patch.qtd
  if (patch.prioridade !== undefined) payload.prioridade = patch.prioridade
  if (patch.situacaoAuto !== undefined) payload.situacao_auto = patch.situacaoAuto
  if (patch.situacaoManual !== undefined) payload.status = patch.situacaoManual
  if (patch.responsavel !== undefined) payload.responsavel = patch.responsavel || null
  if (patch.previsaoEntrega !== undefined) payload.previsao_entrega = patch.previsaoEntrega || null
  if (patch.observacao !== undefined) payload.observacao = patch.observacao || null
  if (patch.grade !== undefined) payload.grade = patch.grade ?? {}
  const { error } = await supabase!.from('op_produtos').update(payload).eq('id', id)
  if (error) throw new Error(error.message)
}

/** Substitui as logomarcas de um produto (apaga as antigas e grava as novas). */
export async function setProdutoLogos(produtoId: string, logos: { tipo: TipoLogo; fornecedorId: string | null }[]): Promise<void> {
  if (isDemo) {
    const db = demoLoad()
    for (const ped of db.pedidos) {
      const prod = ped.produtos.find((p) => p.id === produtoId)
      if (prod) {
        prod.logos = logos.map((l) => ({ tipo: l.tipo, fornecedorId: l.fornecedorId, fornecedorNome: db.fornecedores.find((f) => f.id === l.fornecedorId)?.nome }))
        break
      }
    }
    demoSave(db)
    return
  }
  const del = await supabase!.from('op_produto_logo').delete().eq('produto_id', produtoId)
  if (del.error) throw new Error(del.error.message)
  if (logos.length) {
    const ins = await supabase!.from('op_produto_logo').insert(logos.map((l) => ({ produto_id: produtoId, tipo: l.tipo, fornecedor_id: l.fornecedorId })))
    if (ins.error) throw new Error(ins.error.message)
  }
}

/** Ordem (índice) de uma etapa no fluxo. -1 se desconhecida. */
function ordemEtapa(id: string): number {
  return ETAPAS.findIndex((e) => e.id === id)
}

/**
 * Move um item de etapa (para FRENTE ou para TRÁS). Registra SEMPRE o histórico
 * da movimentação (é o registro completo pedido). A linha do tempo acompanha o
 * sentido: avançar marca a etapa de origem como concluída; retroceder desfaz as
 * conclusões da etapa de destino em diante (o item ainda não as cumpriu de novo).
 */
export async function moveProduto(id: string, de: string, para: string, data: string, obs: string, usuario = ''): Promise<void> {
  const prog = progressoDaEtapa(para)
  const oDe = ordemEtapa(de)
  const oPara = ordemEtapa(para)
  const avanco = oPara > oDe
  // Ao retroceder, as etapas de "para" em diante deixam de estar concluídas.
  const etapasADesfazer = ETAPAS.filter((_, i) => i >= oPara).map((e) => e.id)

  if (isDemo) {
    const db = demoLoad()
    for (const ped of db.pedidos) {
      const prod = ped.produtos.find((p) => p.id === id)
      if (prod) {
        prod.etapaId = para
        prod.progresso = prog
        // Log SEMPRE (frente ou trás).
        prod.historico.push({ kind: 'mov', etapaDe: de, etapaPara: para, data, texto: obs || null, usuario: usuario || null })
        if (avanco) prod.datas[de] = data
        else for (const eid of etapasADesfazer) delete prod.datas[eid]
        break
      }
    }
    demoSave(db)
    return
  }
  // 1) O movimento em si.
  const up = await supabase!.from('op_produtos').update({ etapa_id: para, progresso: prog }).eq('id', id)
  if (up.error) throw new Error(up.error.message)
  // 2) O LOG — gravado antes do passo da linha do tempo, para nunca ser suprimido.
  const h = await supabase!.from('op_etapa_historico').insert({ produto_id: id, kind: 'mov', etapa_de: de, etapa_para: para, data, texto: obs || null, usuario: usuario || null })
  if (h.error) throw new Error(h.error.message)
  // 3) Linha do tempo (data de conclusão) coerente com o sentido.
  if (avanco) {
    const ed = await supabase!.from('op_produto_etapa').upsert({ produto_id: id, etapa_id: de, data_conclusao: data }, { onConflict: 'produto_id,etapa_id' })
    if (ed.error) throw new Error(ed.error.message)
  } else if (etapasADesfazer.length) {
    const ed = await supabase!.from('op_produto_etapa').delete().eq('produto_id', id).in('etapa_id', etapasADesfazer)
    if (ed.error) throw new Error(ed.error.message)
  }
}

export async function addObservacao(id: string, data: string, texto: string, usuario = ''): Promise<void> {
  if (isDemo) {
    const db = demoLoad()
    for (const ped of db.pedidos) {
      const prod = ped.produtos.find((p) => p.id === id)
      if (prod) { prod.historico.push({ kind: 'obs', data, texto, usuario: usuario || null }); break }
    }
    demoSave(db)
    return
  }
  const { error } = await supabase!.from('op_etapa_historico').insert({ produto_id: id, kind: 'obs', data, texto, usuario: usuario || null })
  if (error) throw new Error(error.message)
}
