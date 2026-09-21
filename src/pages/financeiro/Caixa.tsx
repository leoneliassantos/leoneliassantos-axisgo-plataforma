import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { supabase, fetchAllRows } from '../../lib/supabase'
import { useAuth } from '../../auth/AuthContext'
import { InfoHint } from '../../components/InfoHint'
import { FiltrosToggle } from '../../components/FiltrosToggle'
import { CLIENT } from '../../config/client'
import { resolveColor } from '../../lib/chartPalette'

/* ================================================================== *
 *  Fluxo de Caixa — módulo do Financeiro (títulos a pagar/receber)
 *  Alimentado por 2 bases Foodpro (Vendas e Distribuidora). Só os
 *  títulos EFETIVAMENTE PAGOS entram no fluxo (pela Data de Pagamento).
 *  Dados no Supabase (public.fin_titulos). Leitura: autenticado ·
 *  Escrita (upload/config/categorias): admin.
 * ================================================================== */

interface Titulo {
  origem: string
  participante: string
  tipo: 'entrada' | 'saida'
  doc: string
  item: string
  emissao: string      // 'YYYY-MM-DD' | ''
  vencimento: string   // 'YYYY-MM-DD' | ''
  valorDoc: number
  formaPgto: string
  dataPgto: string     // 'YYYY-MM-DD' | '' (vazio = não pago)
  valorPago: number
  obs: string
  categoria: string    // vem do de-para por participante ('' = Sem categoria)
}
type Gran = 'dia' | 'semana' | 'mes'
type Situacao = 'pago' | 'agendado' | 'aberto'
type View = 'fluxo' | 'titulos' | 'painel'
type Modo = 'realizado' | 'projetado'

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const SEM_CAT = 'Sem categoria'
const COR_IN = '#15803d'   // entradas (verde)
const COR_OUT = '#b91c1c'  // saídas (vermelho)
const COR_PROJECAO = resolveColor('VITE_CHART_POSITIVO', 'rgb(var(--brand))')

/* ------------------------------- utils ------------------------------- */
const pad2 = (n: number) => `${n < 10 ? '0' : ''}${n}`
function fmt2(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmt0(v: number): string {
  return Math.round(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
}
function reais(v: number): string {
  return `R$ ${fmt2(v)}`
}
function fmtCompacto(v: number): string {
  const s = v < 0 ? '-' : ''
  const a = Math.abs(v)
  if (a >= 1_000_000) return `${s}R$ ${(a / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
  if (a >= 1_000) return `${s}R$ ${(a / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
  return `${s}R$ ${a.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
}
function parseBR(s: string | number): number {
  if (typeof s === 'number') return s
  let t = (s || '').toString().trim().replace(/\s|R\$/g, '')
  if (t === '') return 0
  t = t.replace(/\./g, '').replace(',', '.')
  const n = parseFloat(t)
  return isNaN(n) ? 0 : n
}
function toISO(v: unknown): string {
  if (v instanceof Date && !isNaN(v.getTime())) return `${v.getFullYear()}-${pad2(v.getMonth() + 1)}-${pad2(v.getDate())}`
  if (typeof v === 'number' && v > 0) {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000))
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
  }
  const s = (v ?? '').toString().trim()
  let m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/)
  if (m) { const y = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${y}-${pad2(+m[2])}-${pad2(+m[1])}` }
  m = s.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/)
  if (m) return `${m[1]}-${pad2(+m[2])}-${pad2(+m[3])}`
  return ''
}
const br = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '—')
const normHeader = (h: unknown) => (h ?? '').toString().toUpperCase().replace(/\s+/g, ' ').trim()
function hojeISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
function situacaoDe(t: Titulo, hoje: string): Situacao {
  if (t.dataPgto) return 'pago'
  return t.vencimento && t.vencimento >= hoje ? 'agendado' : 'aberto'
}
function bucket(iso: string, g: Gran): { key: string; label: string } {
  const [y, mo, d] = iso.split('-').map(Number)
  if (g === 'mes') return { key: `${y}-${pad2(mo)}`, label: `${MESES[mo - 1]}/${String(y).slice(2)}` }
  if (g === 'dia') return { key: iso, label: `${pad2(d)}/${pad2(mo)}` }
  const dt = new Date(y, mo - 1, d)
  const dow = (dt.getDay() + 6) % 7
  const st = new Date(y, mo - 1, d - dow)
  return { key: `${st.getFullYear()}-${pad2(st.getMonth() + 1)}-${pad2(st.getDate())}`, label: `${pad2(st.getDate())}/${pad2(st.getMonth() + 1)}` }
}
function origemDoNome(nome: string): string {
  const n = nome.toLowerCase()
  if (n.includes('distribuidora')) return 'Foodpro Distribuidora'
  if (n.includes('vend')) return 'Foodpro Vendas'
  return ''
}

/* --------------------- parser das planilhas Foodpro --------------------- */
interface TituloRaw extends Omit<Titulo, 'categoria'> {}
async function parseFinFile(file: File): Promise<TituloRaw[]> {
  const origem = origemDoNome(file.name)
  if (!origem) throw new Error('não identifiquei o canal pelo nome do arquivo. Inclua "Vendas" ou "Distribuidora" no nome (ex.: "Lancamentos Financeiros Foodpro vendas.xls").')

  const XLSX = await import('xlsx')
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: '' })
  if (!aoa.length) throw new Error('planilha vazia')

  // acha a linha de cabeçalho e mapeia colunas por predicado (contém termos)
  const idx = (hs: string[], pred: (h: string) => boolean) => hs.findIndex(pred)
  const has = (...t: string[]) => (h: string) => t.every((x) => h.includes(x))
  let hi = -1
  let col: Record<string, number> = {}
  for (let i = 0; i < Math.min(aoa.length, 15); i++) {
    const hs = (aoa[i] as unknown[]).map(normHeader)
    if (idx(hs, has('TIPO')) >= 0 && idx(hs, has('VENC')) >= 0 && idx(hs, has('VALOR', 'PAGO')) >= 0) {
      hi = i
      col = {
        participante: idx(hs, (h) => h.includes('PARTICIPANTE') || h.includes('CNPJ') || h.includes('CPF')),
        tipo: idx(hs, has('TIPO')),
        doc: idx(hs, (h) => h.includes('DOCUMENTO') && !h.includes('VALOR')),
        item: idx(hs, (h) => h === 'ITEM'),
        emissao: idx(hs, has('EMISS')),
        vencimento: idx(hs, has('VENC')),
        valorDoc: idx(hs, has('VALOR', 'DOCUMENTO')),
        formaPgto: idx(hs, has('FORMA')),
        dataPgto: idx(hs, has('DATA', 'PAGAMENTO')),
        valorPago: idx(hs, has('VALOR', 'PAGO')),
        multa: idx(hs, has('MULTA')),
        juros: idx(hs, has('JUROS')),
        desconto: idx(hs, has('DESCONTO')),
        obs: idx(hs, has('OBSERV')),
      }
      break
    }
  }
  if (hi < 0) throw new Error('não encontrei o cabeçalho esperado (Tipo, Data Vencimento, Valor Pago…). Confira se é o "Lançamentos Financeiros" do Foodpro.')

  const get = (row: unknown[], i: number) => (i >= 0 ? row[i] : '')
  const num = (row: unknown[], i: number) => { const c = get(row, i); return typeof c === 'number' ? c : parseBR(c as string) }
  const out: TituloRaw[] = []
  for (let r = hi + 1; r < aoa.length; r++) {
    const row = aoa[r] as unknown[]
    if (!row) continue
    const tRaw = (get(row, col.tipo) ?? '').toString().trim().toUpperCase()
    const emissao = toISO(get(row, col.emissao))
    const vencimento = toISO(get(row, col.vencimento))
    if (tRaw !== 'C' && tRaw !== 'D') continue
    if (!emissao && !vencimento) continue
    out.push({
      origem,
      participante: (get(row, col.participante) ?? '').toString().trim(),
      tipo: tRaw === 'C' ? 'entrada' : 'saida',
      doc: (get(row, col.doc) ?? '').toString().trim(),
      item: (get(row, col.item) ?? '').toString().trim(),
      emissao, vencimento,
      valorDoc: num(row, col.valorDoc),
      formaPgto: (get(row, col.formaPgto) ?? '').toString().trim(),
      dataPgto: toISO(get(row, col.dataPgto)),
      valorPago: num(row, col.valorPago),
      obs: (get(row, col.obs) ?? '').toString().trim(),
    })
  }
  if (!out.length) throw new Error('nenhum título válido encontrado na planilha.')
  return out
}

/* ---------------- parser da planilha "Fluxo de Caixa Orçado" (Projetado) ---------------- *
 * Formato diferente do Realizado: já vem com o canal na coluna Origem e o
 * Participante é o nome legível (não CNPJ/CPF). Tudo na base está em aberto
 * (a planilha já é um recorte "em aberto" do Foodpro). */
interface TituloProj {
  origem: string
  numero: string
  item: string
  tipo: 'entrada' | 'saida'
  docTipo: string
  movimento: string     // 'YYYY-MM-DD' | ''
  vencimento: string    // 'YYYY-MM-DD' | ''
  participante: string
  valor: number
  jurosMulta: number
  situacaoOrigem: string
  categoria: string      // vem do de-para próprio do Projetado ('' = Sem categoria)
}
interface TituloProjRaw extends Omit<TituloProj, 'categoria'> {}

async function parseProjetadoFile(file: File): Promise<TituloProjRaw[]> {
  const XLSX = await import('xlsx')
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: '' })
  if (!aoa.length) throw new Error('planilha vazia')

  const idx = (hs: string[], pred: (h: string) => boolean) => hs.findIndex(pred)
  const has = (...t: string[]) => (h: string) => t.every((x) => h.includes(x))
  let hi = -1
  let col: Record<string, number> = {}
  for (let i = 0; i < Math.min(aoa.length, 15); i++) {
    const hs = (aoa[i] as unknown[]).map(normHeader)
    if (idx(hs, has('TIPO')) >= 0 && idx(hs, has('VENC')) >= 0 && idx(hs, (h) => h === 'ORIGEM') >= 0 && idx(hs, (h) => h.includes('PARTICIPANTE')) >= 0) {
      hi = i
      col = {
        numero: idx(hs, (h) => h.includes('MERO')),
        item: idx(hs, (h) => h === 'ITEM'),
        tipo: idx(hs, has('TIPO')),
        docTipo: idx(hs, (h) => h.startsWith('DOC')),
        movimento: idx(hs, (h) => h.includes('MOVIMENTO')),
        vencimento: idx(hs, has('VENC')),
        participante: idx(hs, (h) => h.includes('PARTICIPANTE')),
        valor: idx(hs, (h) => h === 'VALOR'),
        jurosMulta: idx(hs, (h) => h.includes('JUROS')),
        situacao: idx(hs, (h) => h.includes('SITUA')),
        origem: idx(hs, (h) => h === 'ORIGEM'),
      }
      break
    }
  }
  if (hi < 0) throw new Error('não encontrei o cabeçalho esperado (Tipo, Vencimento, Participante, Origem…). Confira se é o "Fluxo de Caixa Orçado" do Foodpro.')

  const get = (row: unknown[], i: number) => (i >= 0 ? row[i] : '')
  const num = (row: unknown[], i: number) => { const c = get(row, i); return typeof c === 'number' ? c : parseBR(c as string) }
  const out: TituloProjRaw[] = []
  for (let r = hi + 1; r < aoa.length; r++) {
    const row = aoa[r] as unknown[]
    if (!row) continue
    const tRaw = (get(row, col.tipo) ?? '').toString().trim().toUpperCase()
    if (tRaw !== 'C' && tRaw !== 'D') continue
    const vencimento = toISO(get(row, col.vencimento))
    const origem = (get(row, col.origem) ?? '').toString().trim()
    if (!vencimento || !origem) continue
    out.push({
      origem,
      numero: (get(row, col.numero) ?? '').toString().trim(),
      item: (get(row, col.item) ?? '').toString().trim(),
      tipo: tRaw === 'C' ? 'entrada' : 'saida',
      docTipo: (get(row, col.docTipo) ?? '').toString().trim(),
      movimento: toISO(get(row, col.movimento)),
      vencimento,
      participante: (get(row, col.participante) ?? '').toString().trim(),
      valor: num(row, col.valor),
      jurosMulta: num(row, col.jurosMulta),
      situacaoOrigem: (get(row, col.situacao) ?? '').toString().trim(),
    })
  }
  if (!out.length) throw new Error('nenhum título válido encontrado na planilha.')
  return out
}

/* ------------------- lançamentos fixos (cadastro recorrente) ------------------- */
interface LancamentoFixo {
  id: number
  nome: string
  tipo: 'entrada' | 'saida'
  categoria: string
  valor: number
  diaMes: number
  dataInicio: string   // 'YYYY-MM-DD'
  dataFim: string       // 'YYYY-MM-DD' | '' (sem fim)
  ativo: boolean
}
function addMesesISO(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1 + n, 1)
  const dias = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate()
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(Math.min(d || 1, dias))}`
}
// gera uma ocorrência por mês (a partir do mês atual, nunca retroagindo além dele) até o horizonte
function ocorrenciasFixo(f: LancamentoFixo, hoje: string, horizonte: string): string[] {
  const out: string[] = []
  const hojeYM = hoje.slice(0, 7)
  const iniYM = f.dataInicio.slice(0, 7)
  const fimYM = f.dataFim ? f.dataFim.slice(0, 7) : null
  const endYM = horizonte.slice(0, 7)
  let ym = iniYM > hojeYM ? iniYM : hojeYM
  while (ym <= endYM) {
    if (!fimYM || ym <= fimYM) {
      const [y, m] = ym.split('-').map(Number)
      const dias = new Date(y, m, 0).getDate()
      out.push(`${ym}-${pad2(Math.min(f.diaMes, dias))}`)
    }
    const [y, m] = ym.split('-').map(Number)
    const nx = new Date(y, m, 1)
    ym = `${nx.getFullYear()}-${pad2(nx.getMonth() + 1)}`
  }
  return out
}

/* ============================ Componente ============================ */
export function Caixa() {
  const [modo, setModo] = useState<Modo>('realizado')
  return (
    <div className="flex flex-col gap-3">
      <Toggle valor={modo} set={setModo} ops={[['realizado', 'Realizado'], ['projetado', 'Projetado']]} />
      {modo === 'realizado' ? <RealizadoView /> : <ProjetadoView />}
    </div>
  )
}

function RealizadoView() {
  const { user, mode } = useAuth()
  const isAdmin = user?.role === 'admin'
  const hoje = useMemo(() => hojeISO(), [])

  const [rows, setRows] = useState<Titulo[]>([])
  const [catMap, setCatMap] = useState<Record<string, string>>({})
  const [aberturaData, setAberturaData] = useState('')
  const [aberturaValor, setAberturaValor] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [view, setView] = useState<View>('fluxo')
  const [gran, setGran] = useState<Gran>('mes')
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const [selOrigem, setSelOrigem] = useState<Set<string> | null>(null)
  const [selSit, setSelSit] = useState<Set<Situacao>>(new Set(['pago', 'agendado', 'aberto']))
  const [selCat, setSelCat] = useState<Set<string> | null>(null)
  const [filtrosAbertos, setFiltrosAbertos] = useState(true)
  const [editCat, setEditCat] = useState(false)
  const [editAbertura, setEditAbertura] = useState(false)

  /* ---------- carregar do Supabase ---------- */
  const carregar = useCallback(async () => {
    setLoading(true); setErro(null)
    if (mode !== 'supabase' || !supabase) { setLoading(false); return }
    type L = {
      origem: string | null; participante: string | null; tipo: string | null; doc: string | null; item: string | null
      emissao: string | null; vencimento: string | null; valor_doc: number | string | null; forma_pgto: string | null
      data_pgto: string | null; valor_pago: number | string | null; obs: string | null
    }
    const COLS = 'origem, participante, tipo, doc, item, emissao, vencimento, valor_doc, forma_pgto, data_pgto, valor_pago, obs'
    const res = await fetchAllRows<L>((from, to) =>
      supabase!.from('fin_titulos').select(COLS).order('vencimento').order('id').range(from, to))
    if (res.error) {
      setErro('Não foi possível carregar os títulos. Verifique se a tabela "fin_titulos" foi criada no Supabase (fin-caixa.sql).')
      setLoading(false); return
    }
    // de-para de categorias
    const cm: Record<string, string> = {}
    const rcat = await supabase.from('fin_categoria_map').select('participante, categoria')
    if (!rcat.error && rcat.data) for (const c of rcat.data as { participante: string; categoria: string }[]) {
      if (c.participante) cm[c.participante] = (c.categoria ?? '').trim()
    }
    setCatMap(cm)
    // config (saldo de abertura)
    const rcfg = await supabase.from('fin_config').select('chave, valor')
    if (!rcfg.error && rcfg.data) for (const c of rcfg.data as { chave: string; valor: string }[]) {
      if (c.chave === 'abertura_data') setAberturaData((c.valor ?? '').slice(0, 10))
      if (c.chave === 'abertura_valor') setAberturaValor(parseBR(c.valor ?? '0'))
    }
    const mapped: Titulo[] = (res.data).map((r) => {
      const participante = (r.participante ?? '').toString().trim()
      return {
        origem: (r.origem ?? '').toString().trim() || '(sem canal)',
        participante,
        tipo: (r.tipo ?? '') === 'entrada' ? 'entrada' : 'saida',
        doc: (r.doc ?? '').toString().trim(),
        item: (r.item ?? '').toString().trim(),
        emissao: (r.emissao ?? '').toString().slice(0, 10),
        vencimento: (r.vencimento ?? '').toString().slice(0, 10),
        valorDoc: Number(r.valor_doc) || 0,
        formaPgto: (r.forma_pgto ?? '').toString().trim(),
        dataPgto: (r.data_pgto ?? '').toString().slice(0, 10),
        valorPago: Number(r.valor_pago) || 0,
        obs: (r.obs ?? '').toString().trim(),
        categoria: cm[participante] || '',
      }
    })
    setRows(mapped)
    if (mapped.length) {
      const ds = mapped.map((r) => r.vencimento || r.emissao).filter(Boolean).sort()
      setDe(ds[0] ?? '')
      setAte(ds[ds.length - 1] ?? '')
    }
    setLoading(false)
  }, [mode])

  useEffect(() => { carregar() }, [carregar])

  const origens = useMemo(() => Array.from(new Set(rows.map((r) => r.origem))).sort(), [rows])
  const categorias = useMemo(
    () => Array.from(new Set(rows.filter((r) => r.tipo === 'saida').map((r) => r.categoria || SEM_CAT))).sort(),
    [rows],
  )
  const origemOk = useCallback((o: string) => selOrigem === null || selOrigem.has(o), [selOrigem])

  /* ============ FLUXO estilo Fukuda: matriz (linhas = contas, colunas = períodos) ============ *
   * REALIZADO + PROJETADO. Cada título vira um "evento de caixa":
   *   • pago/recebido  → na Data de Pagamento, pelo Valor Pago (realizado);
   *   • a vencer (não pago, vencimento ≥ hoje) → no Vencimento, pelo Valor do Documento (projetado);
   *   • vencido não pago → NÃO entra no fluxo (aparece só na lista de Títulos).
   * Entradas quebradas por canal; despesas por categoria (com abertura por fornecedor). Saldo final
   * de um período = inicial do próximo; o primeiro parte do Saldo de abertura + tudo antes do período. */
  const fluxo = useMemo(() => {
    const d0 = de || '0000-01-01'
    const d1 = ate || '9999-12-31'
    type Ev = { r: Titulo; date: string; valor: number; proj: boolean }
    const eventos: Ev[] = []
    for (const r of rows) {
      if (!origemOk(r.origem)) continue
      if (r.dataPgto) {
        if (aberturaData && r.dataPgto < aberturaData) continue
        eventos.push({ r, date: r.dataPgto, valor: r.valorPago, proj: false })      // realizado
      } else if (r.vencimento && r.vencimento >= hoje) {
        eventos.push({ r, date: r.vencimento, valor: r.valorDoc, proj: true })        // projetado (a vencer)
      }
      // vencido não pago (vencimento < hoje) → fora do fluxo
    }
    const sinal = (e: Ev) => (e.r.tipo === 'entrada' ? e.valor : -e.valor)
    const base = aberturaValor + eventos.filter((e) => e.date < d0).reduce((s, e) => s + sinal(e), 0)
    const dentro = eventos.filter((e) => e.date >= d0 && e.date <= d1)

    // colunas (períodos) na ordem cronológica; colProj marca as que têm projeção
    const bset = new Map<string, string>()
    const colProj: Record<string, boolean> = {}
    for (const e of dentro) { const b = bucket(e.date, gran); bset.set(b.key, b.label); if (e.proj) colProj[b.key] = true }
    const cols = Array.from(bset.keys()).sort().map((key) => ({ key, label: bset.get(key)! }))
    const zero = () => { const o: Record<string, number> = {}; for (const c of cols) o[c.key] = 0; return o }

    // entradas por canal · despesas por categoria (com fornecedores)
    const entMap = new Map<string, Record<string, number>>()
    const catMap = new Map<string, { vals: Record<string, number>; forn: Map<string, { label: string; vals: Record<string, number> }> }>()
    for (const e of dentro) {
      const bk = bucket(e.date, gran).key
      const r = e.r
      if (r.tipo === 'entrada') {
        const k = r.origem || 'Recebimentos'
        let m = entMap.get(k); if (!m) { m = zero(); entMap.set(k, m) }
        m[bk] += e.valor
      } else {
        const c = r.categoria || SEM_CAT
        let ce = catMap.get(c); if (!ce) { ce = { vals: zero(), forn: new Map() }; catMap.set(c, ce) }
        ce.vals[bk] += e.valor
        const fk = r.participante || '(sem)'
        let f = ce.forn.get(fk); if (!f) { f = { label: r.obs || r.participante || '—', vals: zero() }; ce.forn.set(fk, f) }
        f.vals[bk] += e.valor
      }
    }
    const soma = (v: Record<string, number>) => cols.reduce((s, c) => s + v[c.key], 0)
    const entradaRows = Array.from(entMap.entries()).map(([nome, vals]) => ({ nome, vals, total: soma(vals) })).sort((a, b) => b.total - a.total)
    const despesaRows = Array.from(catMap.entries()).map(([nome, e]) => ({
      nome, vals: e.vals, total: soma(e.vals),
      fornecedores: Array.from(e.forn.values()).map((f) => ({ nome: f.label, vals: f.vals, total: soma(f.vals) })).sort((a, b) => b.total - a.total),
    })).sort((a, b) => b.total - a.total)

    // totais e saldos por coluna (encadeados)
    const totalEntradas = zero(), totalSaidas = zero(), fluxoOp = zero(), saldoInicial = zero(), saldoFinal = zero()
    let prev = base
    for (const c of cols) {
      const te = entradaRows.reduce((s, r) => s + r.vals[c.key], 0)
      const ts = despesaRows.reduce((s, r) => s + r.vals[c.key], 0)
      totalEntradas[c.key] = te; totalSaidas[c.key] = ts; fluxoOp[c.key] = te - ts
      saldoInicial[c.key] = prev; saldoFinal[c.key] = prev + te - ts; prev = saldoFinal[c.key]
    }
    return { cols, colProj, entradaRows, despesaRows, totalEntradas, totalSaidas, fluxoOp, saldoInicial, saldoFinal }
  }, [rows, de, ate, gran, origemOk, aberturaData, aberturaValor, hoje])

  /* ================= TÍTULOS (tabela filtrável) ================= */
  const titulosFiltrados = useMemo(() => {
    const d0 = de || '0000-01-01'
    const d1 = ate || '9999-12-31'
    const catOk = (c: string) => selCat === null || selCat.has(c || SEM_CAT)
    return rows
      .filter((r) => origemOk(r.origem))
      .filter((r) => selSit.has(situacaoDe(r, hoje)))
      .filter((r) => catOk(r.categoria))
      .filter((r) => { const dt = r.vencimento || r.emissao; return dt >= d0 && dt <= d1 })
      .sort((a, b) => (b.vencimento || b.emissao).localeCompare(a.vencimento || a.emissao))
  }, [rows, de, ate, selSit, selCat, origemOk, hoje])

  /* ================= PAINEL / PROJEÇÃO ================= */
  const painel = useMemo(() => {
    const d0 = de || '0000-01-01'
    const d1 = ate || '9999-12-31'
    const base = rows.filter((r) => origemOk(r.origem))
    // realizados no período (por data de pagamento)
    const pagosPer = base.filter((r) => r.dataPgto && r.dataPgto >= d0 && r.dataPgto <= d1)
    const recebido = pagosPer.filter((r) => r.tipo === 'entrada').reduce((s, r) => s + r.valorPago, 0)
    const pago = pagosPer.filter((r) => r.tipo === 'saida').reduce((s, r) => s + r.valorPago, 0)
    // em aberto no período (por vencimento)
    const abertos = base.filter((r) => !r.dataPgto && (r.vencimento || r.emissao) >= d0 && (r.vencimento || r.emissao) <= d1)
    const aReceber = abertos.filter((r) => r.tipo === 'entrada' && r.vencimento >= hoje).reduce((s, r) => s + r.valorDoc, 0)
    const aPagar = abertos.filter((r) => r.tipo === 'saida' && r.vencimento >= hoje).reduce((s, r) => s + r.valorDoc, 0)
    const vencidoReceber = abertos.filter((r) => r.tipo === 'entrada' && r.vencimento < hoje).reduce((s, r) => s + r.valorDoc, 0)
    const vencidoPagar = abertos.filter((r) => r.tipo === 'saida' && r.vencimento < hoje).reduce((s, r) => s + r.valorDoc, 0)

    // saldo de caixa realizado até hoje (abertura + pagos até hoje)
    const saldoHoje = aberturaValor + base
      .filter((r) => r.dataPgto && (!aberturaData || r.dataPgto >= aberturaData) && r.dataPgto <= hoje)
      .reduce((s, r) => s + (r.tipo === 'entrada' ? r.valorPago : -r.valorPago), 0)

    // projeção: de hoje até o fim do filtro, títulos NÃO pagos por vencimento
    const ini = hoje > d0 ? hoje : d0
    const fut = base.filter((r) => !r.dataPgto && r.vencimento >= ini && r.vencimento <= d1)
    const bmap = new Map<string, { receber: number; pagar: number }>()
    for (const r of fut) {
      const b = bucket(r.vencimento, gran)
      let e = bmap.get(b.key)
      if (!e) { e = { receber: 0, pagar: 0 }; bmap.set(b.key, e) }
      if (r.tipo === 'entrada') e.receber += r.valorDoc; else e.pagar += r.valorDoc
    }
    const keys = Array.from(bmap.keys()).sort()
    let saldo = saldoHoje
    const proj: { label: string; receber: number; pagar: number; saldo: number }[] = [
      { label: 'Hoje', receber: 0, pagar: 0, saldo: saldoHoje },
    ]
    for (const k of keys) {
      const e = bmap.get(k)!
      saldo = saldo + e.receber - e.pagar
      proj.push({ label: bucket(`${k.length === 7 ? `${k}-01` : k}`, gran).label, receber: e.receber, pagar: e.pagar, saldo })
    }
    return { recebido, pago, aReceber, aPagar, vencidoReceber, vencidoPagar, saldoHoje, proj, saldoProjFim: saldo }
  }, [rows, de, ate, gran, origemOk, aberturaData, aberturaValor, hoje])

  /* ---------- ações admin ---------- */
  async function handleFile(file: File) {
    setErro(null); setAviso(null); setBusy(true)
    try {
      const novo = await parseFinFile(file)
      const origem = novo[0].origem
      const pagos = novo.filter((r) => r.dataPgto).length
      const ok = window.confirm(
        `ATUALIZAR CANAL "${origem}"\n\n` +
        `Isto substitui TODOS os títulos de "${origem}" pelos ${novo.length} deste arquivo ` +
        `(${pagos} pagos). Os outros canais não são afetados.\n\nDeseja continuar?`,
      )
      if (!ok) { setAviso('Atualização cancelada — a base atual foi mantida.'); setBusy(false); return }

      if (mode === 'supabase' && supabase) {
        const payload = novo.map((r) => ({
          origem: r.origem, participante: r.participante, tipo: r.tipo, doc: r.doc, item: r.item,
          emissao: r.emissao || null, vencimento: r.vencimento || null, valor_doc: r.valorDoc,
          forma_pgto: r.formaPgto, data_pgto: r.dataPgto || null, valor_pago: r.valorPago,
          multa: 0, juros: 0, desconto: 0, obs: r.obs,
        }))
        const { error } = await supabase.rpc('fin_titulos_replace_origem', { p_rows: payload })
        if (error) throw new Error(error.message)
        await carregar()
      } else {
        setRows((prev) => [
          ...prev.filter((r) => r.origem !== origem),
          ...novo.map((r) => ({ ...r, categoria: catMap[r.participante] || '' })),
        ])
      }
      setAviso(`Canal "${origem}" atualizado: ${novo.length} títulos (${pagos} pagos).`)
    } catch (e) {
      setErro(`Não consegui ler o arquivo: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  async function baixarBase() {
    try {
      setBusy(true)
      const XLSX = await import('xlsx')
      const aoa: unknown[][] = [['Origem', 'CNPJ/CPF Participante', 'Tipo', 'Nº Documento', 'Item', 'Data emissão', 'Data Vencimento', 'Valor Documento', 'Forma Pgto', 'Data Pagamento', 'Valor Pago', 'Situação', 'Categoria', 'Observação']]
      for (const r of titulosFiltrados) {
        const toDt = (iso: string) => { const p = iso.split('-'); return p.length === 3 ? new Date(+p[0], +p[1] - 1, +p[2]) : null }
        aoa.push([r.origem, r.participante, r.tipo === 'entrada' ? 'C' : 'D', r.doc, r.item, toDt(r.emissao), toDt(r.vencimento), r.valorDoc, r.formaPgto, r.dataPgto ? toDt(r.dataPgto) : '', r.valorPago, rotSit(situacaoDe(r, hoje)), r.categoria || SEM_CAT, r.obs])
      }
      const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true })
      ws['!cols'] = [{ wch: 20 }, { wch: 20 }, { wch: 6 }, { wch: 14 }, { wch: 6 }, { wch: 12 }, { wch: 12 }, { wch: 13 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 18 }, { wch: 40 }]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Títulos')
      const h = new Date()
      XLSX.writeFile(wb, `Fluxo de Caixa - ${CLIENT.nome} - ${h.getFullYear()}${pad2(h.getMonth() + 1)}${pad2(h.getDate())}.xlsx`)
    } catch (e) {
      setErro(`Erro ao baixar: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  async function salvarAbertura(data: string, valor: number) {
    if (mode === 'supabase' && supabase) {
      const { error } = await supabase.from('fin_config').upsert([
        { chave: 'abertura_data', valor: data },
        { chave: 'abertura_valor', valor: String(valor) },
      ], { onConflict: 'chave' })
      if (error) { setErro(`Não consegui salvar o saldo de abertura: ${error.message}`); return }
    }
    setAberturaData(data); setAberturaValor(valor); setEditAbertura(false)
    setAviso('Saldo de abertura salvo.')
  }

  async function salvarCategorias(mapa: Record<string, string>) {
    const linhas = Object.entries(mapa).map(([participante, categoria]) => ({ participante, categoria: categoria.trim() }))
    if (mode === 'supabase' && supabase && linhas.length) {
      const { error } = await supabase.from('fin_categoria_map').upsert(linhas, { onConflict: 'participante' })
      if (error) { setErro(`Não consegui salvar as categorias: ${error.message}`); return }
    }
    const cm = { ...catMap }
    for (const l of linhas) cm[l.participante] = l.categoria
    setCatMap(cm)
    setRows((prev) => prev.map((r) => ({ ...r, categoria: cm[r.participante] || '' })))
    setEditCat(false)
    setAviso('Categorias salvas.')
  }

  const vazio = !loading && rows.length === 0

  if (loading) return <div className="grid place-items-center py-24 text-sm text-muted">Carregando títulos…</div>

  return (
    <div className="flex flex-col gap-3">
      {/* cabeçalho — recolhe junto com os filtros (só o rótulo e o botão de filtros ficam) */}
      <div className="flex flex-wrap items-center gap-2">
        {filtrosAbertos ? (
          <Toggle valor={view} set={setView} ops={[['fluxo', 'Fluxo de Caixa'], ['titulos', 'Títulos'], ['painel', 'Painel & Projeção']]} />
        ) : (
          <span className="text-sm font-semibold text-ink">Fluxo de Caixa</span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {filtrosAbertos && (
            <>
              {isAdmin && (
                <button onClick={() => setEditAbertura(true)} className="rounded-lg border border-line bg-surface px-3 py-2 text-[12px] font-bold text-ink transition hover:bg-paper" title="Definir o saldo de caixa de abertura (ponto de partida do fluxo).">
                  Saldo de abertura
                </button>
              )}
              {isAdmin && (
                <button onClick={() => setEditCat(true)} className="rounded-lg border border-line bg-surface px-3 py-2 text-[12px] font-bold text-ink transition hover:bg-paper" title="Associar cada fornecedor a uma categoria de despesa.">
                  Categorias
                </button>
              )}
              <button onClick={baixarBase} disabled={busy || vazio} className="rounded-lg border border-line bg-surface px-3 py-2 text-[12px] font-bold text-ink transition hover:bg-paper disabled:opacity-50" title="Baixar em Excel os títulos filtrados">
                Baixar
              </button>
              {isAdmin && (
                <button onClick={() => fileRef.current?.click()} disabled={busy} className="rounded-lg bg-ink px-3 py-2 text-[12px] font-bold text-white shadow-brand transition hover:brightness-125 disabled:opacity-50" title="Enviar o Excel de Lançamentos Financeiros do Foodpro (Vendas ou Distribuidora). Substitui todo o canal do arquivo.">
                  {busy ? 'Processando…' : 'Atualizar base'}
                </button>
              )}
              {isAdmin && (
                <InfoHint
                  title="Como atualizar os Títulos (Caixa)"
                  steps={[
                    'No Foodpro, exporte o Excel de "Lançamentos Financeiros".',
                    'Você tem dois canais: Vendas e Distribuidora — envie um de cada vez.',
                    'Clique em "Atualizar base" e selecione o arquivo (.xlsx ou .xls).',
                    'Repita para o outro canal.',
                  ]}
                  warn="Cada envio substitui todo o canal daquele arquivo. Só entram no fluxo os títulos com pagamento efetivado."
                />
              )}
            </>
          )}
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} />
          {!vazio && <FiltrosToggle aberto={filtrosAbertos} onToggle={() => setFiltrosAbertos((v) => !v)} />}
        </div>
      </div>

      {/* filtros comuns */}
      {!vazio && filtrosAbertos && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Período</span>
          <DateIn value={de} onChange={setDe} />
          <span className="text-muted">até</span>
          <DateIn value={ate} onChange={setAte} />
          {origens.length > 1 && <MultiSelect label="Canal" opcoes={origens} value={selOrigem} onChange={setSelOrigem} />}
          {view !== 'titulos' && (
            <div className="ml-1 flex items-center gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Ver por</span>
              <Toggle valor={gran} set={setGran} ops={[['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês']]} />
            </div>
          )}
        </div>
      )}

      {erro && <Alerta tipo="erro" texto={erro} onClose={() => setErro(null)} />}
      {aviso && <Alerta tipo="ok" texto={aviso} onClose={() => setAviso(null)} />}

      {vazio ? (
        <div className="grid place-items-center gap-2 rounded-2xl border border-dashed border-line bg-surface/60 px-6 py-16 text-center">
          <p className="font-serif text-lg text-ink">O fluxo de caixa ainda não foi carregado.</p>
          <p className="max-w-md text-sm text-muted">
            {isAdmin
              ? 'Clique em "Atualizar base" e envie os Excel de Lançamentos Financeiros do Foodpro (um de Vendas e um de Distribuidora). Só os títulos com pagamento efetivado entram no fluxo.'
              : 'Assim que um administrador enviar as bases, o fluxo de caixa aparecerá aqui.'}
          </p>
        </div>
      ) : view === 'fluxo' ? (
        <FluxoView f={fluxo} />
      ) : view === 'titulos' ? (
        <TitulosView rows={titulosFiltrados} hoje={hoje} selSit={selSit} setSelSit={setSelSit} categorias={categorias} selCat={selCat} setSelCat={setSelCat} />
      ) : (
        <PainelView p={painel} />
      )}

      {editAbertura && <ModalAbertura data={aberturaData} valor={aberturaValor} onSalvar={salvarAbertura} onClose={() => setEditAbertura(false)} />}
      {editCat && <ModalCategorias rows={rows} catMap={catMap} categorias={categorias.filter((c) => c !== SEM_CAT)} onSalvar={salvarCategorias} onClose={() => setEditCat(false)} />}
    </div>
  )
}

function rotSit(s: Situacao): string {
  return s === 'pago' ? 'Pago' : s === 'agendado' ? 'Agendado' : 'Em aberto'
}

/* ============================ FLUXO tradicional ============================ */
const HDR = '#f1f0ec', WHITE = '#ffffff', BG_IN = '#e9f7ef', BG_OUT = '#fdecec', BG_SLD = '#eef1f6'
function ValCell({ v, bold, color }: { v: number; bold?: boolean; color?: string }) {
  const zerado = Math.abs(v) < 0.005
  return <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums" style={{ fontWeight: bold ? 700 : 400, color: zerado ? '#c3c0bb' : color }}>{`R$ ${fmt2(v)}`}</td>
}
function LinhaFluxo({ label, children, bg, bold, indent, sub, chevron, open, onToggle }: {
  label: string; children: ReactNode; bg?: string; bold?: boolean; indent?: 1 | 2; sub?: boolean; chevron?: boolean; open?: boolean; onToggle?: () => void
}) {
  const bgc = bg ?? WHITE
  const padLeft = indent === 2 ? 40 : indent === 1 ? 26 : 14
  return (
    <tr style={{ background: bgc }} className="border-b border-line/60">
      <td className="sticky left-0 z-10 whitespace-nowrap py-2 pr-4 text-left"
        style={{ background: bgc, paddingLeft: padLeft, fontWeight: bold ? 700 : sub ? 400 : 500, color: sub ? '#8a8078' : '#241f1a', fontSize: sub ? 11.5 : undefined }}>
        {chevron && <button onClick={onToggle} className="mr-1.5 inline-block w-2.5 text-muted">{open ? '▾' : '▸'}</button>}
        {label}
      </td>
      {children}
    </tr>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function FluxoView({ f }: { f: any }) {
  const [aberto, setAberto] = useState<Set<string>>(new Set())
  const cols = f.cols as { key: string; label: string }[]
  const toggle = (c: string) => setAberto((p) => { const n = new Set(p); n.has(c) ? n.delete(c) : n.add(c); return n })
  const entradaRows = f.entradaRows as { nome: string; vals: Record<string, number>; total: number }[]
  const despesaRows = f.despesaRows as { nome: string; vals: Record<string, number>; total: number; fornecedores: { nome: string; vals: Record<string, number>; total: number }[] }[]

  if (!cols.length) return <div className="rounded-xl border border-line bg-surface p-12 text-center text-muted">Sem lançamentos no período selecionado.</div>
  const colProj = f.colProj as Record<string, boolean>

  return (
    <div className="rounded-xl border border-line bg-surface shadow-card">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-line px-4 py-2 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: '#fff', border: '1px solid #d9cfc4' }} /><b className="text-ink">Realizado</b> — pagamentos e recebimentos efetivados (até hoje).</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: '#eef4fb', border: '1px solid #cfe0f5' }} /><b style={{ color: '#1e5fa8' }}>Projeção</b> — contas a vencer, ainda não pagas/recebidas.</span>
      </div>
      <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-[12.5px]">
        <thead>
          <tr>
            <th className="sticky left-0 z-20 px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-muted" style={{ background: HDR }}>Descrição</th>
            {cols.map((c) => {
              const proj = colProj[c.key]
              return (
                <th key={c.key} className="whitespace-nowrap px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wide" style={{ background: proj ? '#eef4fb' : HDR, color: proj ? '#1e5fa8' : undefined }}>
                  <span className={proj ? '' : 'text-muted'}>{c.label}</span>
                  {proj && <div className="text-[9px] font-semibold normal-case tracking-normal" style={{ color: '#1e5fa8' }}>projeção</div>}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          <LinhaFluxo label="Saldo Inicial de Caixa" bold>
            {cols.map((c) => <ValCell key={c.key} v={f.saldoInicial[c.key]} bold />)}
          </LinhaFluxo>

          {entradaRows.map((r) => (
            <LinhaFluxo key={r.nome} label={`(+) ${r.nome}`} indent={1}>
              {cols.map((c) => <ValCell key={c.key} v={r.vals[c.key]} color={COR_IN} />)}
            </LinhaFluxo>
          ))}
          <LinhaFluxo label="Total de Entradas" bold bg={BG_IN}>
            {cols.map((c) => <ValCell key={c.key} v={f.totalEntradas[c.key]} bold color={COR_IN} />)}
          </LinhaFluxo>

          {despesaRows.map((r) => (
            <Fragment key={r.nome}>
              <LinhaFluxo label={`(-) ${r.nome}`} indent={1} chevron={r.fornecedores.length > 0} open={aberto.has(r.nome)} onToggle={() => toggle(r.nome)}>
                {cols.map((c) => <ValCell key={c.key} v={r.vals[c.key]} color={COR_OUT} />)}
              </LinhaFluxo>
              {aberto.has(r.nome) && r.fornecedores.map((fo, i) => (
                <LinhaFluxo key={i} label={fo.nome.length > 42 ? `${fo.nome.slice(0, 42)}…` : fo.nome} indent={2} sub>
                  {cols.map((c) => <ValCell key={c.key} v={fo.vals[c.key]} />)}
                </LinhaFluxo>
              ))}
            </Fragment>
          ))}
          <LinhaFluxo label="Total de Saídas" bold bg={BG_OUT}>
            {cols.map((c) => <ValCell key={c.key} v={f.totalSaidas[c.key]} bold color={COR_OUT} />)}
          </LinhaFluxo>

          <LinhaFluxo label="Fluxo de Caixa Operacional" bold>
            {cols.map((c) => <ValCell key={c.key} v={f.fluxoOp[c.key]} bold color={f.fluxoOp[c.key] >= 0 ? COR_IN : COR_OUT} />)}
          </LinhaFluxo>
          <LinhaFluxo label="Saldo Final de Caixa" bold bg={BG_SLD}>
            {cols.map((c) => <ValCell key={c.key} v={f.saldoFinal[c.key]} bold />)}
          </LinhaFluxo>
        </tbody>
      </table>
      </div>
    </div>
  )
}

/* ============================ TÍTULOS ============================ */
const SIT_COR: Record<Situacao, { bg: string; fg: string }> = {
  pago: { bg: '#dcfce7', fg: '#166534' },
  agendado: { bg: '#dbeafe', fg: '#1e40af' },
  aberto: { bg: '#fee2e2', fg: '#991b1b' },
}
const SIT_TIP: Record<Situacao, string> = {
  pago: 'Pago/recebido: título com pagamento efetivado (tem Data de Pagamento). Entra no Fluxo de Caixa como realizado.',
  agendado: 'Agendado (a vencer): ainda não pago/recebido, com vencimento de hoje em diante. Entra no Fluxo de Caixa como projeção.',
  aberto: 'Em aberto (vencido): ainda não pago/recebido e com o vencimento já passado. Aparece só nesta lista — fica fora do Fluxo de Caixa até a data ser reprogramada para o futuro.',
}
function TitulosView({ rows, hoje, selSit, setSelSit, categorias, selCat, setSelCat }: {
  rows: Titulo[]; hoje: string; selSit: Set<Situacao>; setSelSit: (s: Set<Situacao>) => void
  categorias: string[]; selCat: Set<string> | null; setSelCat: (s: Set<string> | null) => void
}) {
  const LIM = 800
  const totais = useMemo(() => {
    let ent = 0, sai = 0
    for (const r of rows) { if (r.tipo === 'entrada') ent += r.valorDoc; else sai += r.valorDoc }
    return { ent, sai, n: rows.length }
  }, [rows])
  const sitBtn = (s: Situacao) => {
    const on = selSit.has(s)
    return (
      <button key={s} title={SIT_TIP[s]} onClick={() => { const n = new Set(selSit); if (on) n.delete(s); else n.add(s); setSelSit(n) }}
        className={`rounded-full px-3 py-1 text-[12px] font-semibold transition ${on ? '' : 'opacity-40'}`}
        style={{ background: SIT_COR[s].bg, color: SIT_COR[s].fg }}>
        {rotSit(s)}
      </button>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Situação</span>
        {(['pago', 'agendado', 'aberto'] as Situacao[]).map(sitBtn)}
        {categorias.length > 1 && <MultiSelect label="Categoria" opcoes={categorias} value={selCat} onChange={setSelCat} />}
        <div className="ml-auto flex gap-4 text-[12px]">
          <span className="text-muted">Títulos: <b className="text-ink">{fmt0(totais.n)}</b></span>
          <span style={{ color: COR_IN }}>Entradas: <b>{reais(totais.ent)}</b></span>
          <span style={{ color: COR_OUT }}>Saídas: <b>{reais(totais.sai)}</b></span>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-card">
        <table className="w-full text-left text-[12px]">
          <thead>
            <tr className="border-b border-line text-[11px] uppercase tracking-wide text-muted">
              <th className="px-3 py-2 font-semibold">Canal</th>
              <th className="px-3 py-2 font-semibold">Participante</th>
              <th className="px-3 py-2 font-semibold">Documento</th>
              <th className="px-3 py-2 font-semibold">Categoria</th>
              <th className="px-3 py-2 text-right font-semibold">Vencimento</th>
              <th className="px-3 py-2 text-right font-semibold">Pagamento</th>
              <th className="px-3 py-2 text-right font-semibold">Valor</th>
              <th className="px-3 py-2 text-center font-semibold">Situação</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rows.slice(0, LIM).map((r, i) => {
              const s = situacaoDe(r, hoje)
              const ent = r.tipo === 'entrada'
              return (
                <tr key={i} className="border-b border-line/60 last:border-0 hover:bg-paper/50">
                  <td className="px-3 py-1.5 text-muted">{r.origem.replace('Foodpro ', '')}</td>
                  <td className="px-3 py-1.5 max-w-[220px] truncate text-ink" title={r.obs || r.participante}>{r.obs ? r.obs.slice(0, 40) : r.participante}</td>
                  <td className="px-3 py-1.5 text-muted">{r.doc}{r.item && r.item !== '1' ? `/${r.item}` : ''}</td>
                  <td className="px-3 py-1.5"><span className={r.categoria ? 'text-ink' : 'text-muted'}>{r.categoria || SEM_CAT}</span></td>
                  <td className="px-3 py-1.5 text-right text-ink">{br(r.vencimento)}</td>
                  <td className="px-3 py-1.5 text-right text-muted">{br(r.dataPgto)}</td>
                  <td className="px-3 py-1.5 text-right font-semibold" style={{ color: ent ? COR_IN : COR_OUT }}>{ent ? '' : '−'}{fmt2(r.valorPago || r.valorDoc)}</td>
                  <td className="px-3 py-1.5 text-center">
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: SIT_COR[s].bg, color: SIT_COR[s].fg }}>{rotSit(s)}</span>
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center text-muted">Nenhum título com esses filtros.</td></tr>}
          </tbody>
        </table>
      </div>
      {rows.length > LIM && (
        <p className="text-center text-[12px] text-muted">Mostrando os primeiros {LIM} de {fmt0(rows.length)} títulos. Refine os filtros ou use "Baixar" para o Excel completo.</p>
      )}
    </div>
  )
}

/* ============================ PAINEL / PROJEÇÃO ============================ */
function PainelView({ p }: { p: any }) {
  const proj = p.proj as { label: string; receber: number; pagar: number; saldo: number }[]
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi lbl="Recebido no período" valor={reais(p.recebido)} cor={COR_IN} tip="Entradas com pagamento efetivado no período (Data de Pagamento)." />
        <Kpi lbl="Pago no período" valor={reais(p.pago)} cor={COR_OUT} tip="Despesas efetivamente pagas no período." />
        <Kpi lbl="Saldo de caixa hoje" valor={reais(p.saldoHoje)} tip="Saldo de abertura + tudo que foi pago (entradas − saídas) até hoje." />
        <Kpi lbl="A receber (a vencer)" valor={reais(p.aReceber)} cor={COR_IN} tip="Títulos de entrada em aberto, com vencimento de hoje em diante, dentro do período." />
        <Kpi lbl="A pagar (a vencer)" valor={reais(p.aPagar)} cor={COR_OUT} tip="Títulos de saída em aberto, com vencimento de hoje em diante, dentro do período." />
        <Kpi lbl="Vencido em aberto" valor={reais(p.vencidoPagar)} foot={p.vencidoReceber ? `A receber vencido: ${reais(p.vencidoReceber)}` : undefined} cor={COR_OUT} tip="Saídas já vencidas e ainda não pagas." />
      </div>
      <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
        <div className="mb-1 flex items-center gap-2">
          <h3 className="text-[13px] font-bold text-ink">Projeção de caixa</h3>
          <Info tip="Parte do Saldo de caixa de hoje e projeta, período a período (pela granularidade), somando o que há a receber e subtraindo o que há a pagar (títulos em aberto por vencimento) até o fim do filtro." />
        </div>
        <p className="mb-3 text-[12px] text-muted">Partindo do saldo de hoje e considerando os títulos em aberto por vencimento — saldo projetado ao fim do período: <b className="text-ink">{reais(p.saldoProjFim)}</b></p>
        <ProjChart proj={proj} />
      </div>
    </div>
  )
}

function ProjChart({ proj }: { proj: { label: string; receber: number; pagar: number; saldo: number }[] }) {
  const W = 720, H = 260, PADL = 64, PADR = 16, PADT = 16, PADB = 42
  if (proj.length < 2) return <p className="py-8 text-center text-sm text-muted">Sem títulos a vencer no período para projetar.</p>
  const saldos = proj.map((p) => p.saldo)
  const min = Math.min(0, ...saldos), max = Math.max(...saldos, 0)
  const span = max - min || 1
  const x = (i: number) => PADL + (i * (W - PADL - PADR)) / (proj.length - 1)
  const y = (v: number) => PADT + (1 - (v - min) / span) * (H - PADT - PADB)
  const linePts = proj.map((p, i) => `${x(i)},${y(p.saldo)}`).join(' ')
  const areaPts = `${PADL},${y(min)} ${linePts} ${x(proj.length - 1)},${y(min)}`
  const y0 = y(0)
  const ticks = 4
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 520 }}>
        {Array.from({ length: ticks + 1 }, (_, i) => {
          const v = min + (span * i) / ticks
          return (
            <g key={i}>
              <line x1={PADL} x2={W - PADR} y1={y(v)} y2={y(v)} stroke="#ececec" strokeWidth={1} />
              <text x={PADL - 8} y={y(v) + 3} textAnchor="end" fontSize={10} fill="#888">{fmtCompacto(v)}</text>
            </g>
          )
        })}
        {min < 0 && <line x1={PADL} x2={W - PADR} y1={y0} y2={y0} stroke="#bbb" strokeWidth={1} strokeDasharray="3 3" />}
        <polygon points={areaPts} fill={COR_PROJECAO} opacity={0.1} />
        <polyline points={linePts} fill="none" stroke={COR_PROJECAO} strokeWidth={2.2} strokeLinejoin="round" />
        {proj.map((p, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(p.saldo)} r={i === 0 ? 4 : 3} fill={COR_PROJECAO}>
              <title>{`${p.label}\nSaldo: ${reais(p.saldo)}${p.receber ? `\nA receber: ${reais(p.receber)}` : ''}${p.pagar ? `\nA pagar: ${reais(p.pagar)}` : ''}`}</title>
            </circle>
            {(i === 0 || i === proj.length - 1 || i % Math.ceil(proj.length / 8) === 0) && (
              <text x={x(i)} y={H - PADB + 16} textAnchor="middle" fontSize={10} fill="#666">{p.label}</text>
            )}
          </g>
        ))}
      </svg>
    </div>
  )
}

/* ============================ modais ============================ */
function ModalAbertura({ data, valor, onSalvar, onClose }: { data: string; valor: number; onSalvar: (d: string, v: number) => void; onClose: () => void }) {
  const [d, setD] = useState(data)
  const [v, setV] = useState(valor ? fmt2(valor) : '')
  return (
    <Overlay onClose={onClose}>
      <h3 className="text-[15px] font-bold text-ink">Saldo de abertura</h3>
      <p className="mt-1 text-[12px] text-muted">O caixa parte deste valor na data informada; os pagamentos posteriores acumulam a partir daí. Deixe em branco para começar do zero.</p>
      <label className="mt-4 block text-[12px] font-semibold text-ink">Data de abertura
        <input type="date" value={d} onChange={(e) => setD(e.target.value)} className="mt-1 w-full rounded-md border border-line bg-white px-2 py-1.5 text-[13px] text-ink outline-none focus:border-ink/40" />
      </label>
      <label className="mt-3 block text-[12px] font-semibold text-ink">Saldo (R$)
        <input value={v} onChange={(e) => setV(e.target.value)} placeholder="0,00" inputMode="decimal" className="mt-1 w-full rounded-md border border-line bg-white px-2 py-1.5 text-[13px] text-ink outline-none focus:border-ink/40" />
      </label>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-semibold text-muted hover:bg-paper">Cancelar</button>
        <button onClick={() => onSalvar(d, parseBR(v))} className="rounded-lg bg-ink px-4 py-1.5 text-[12px] font-bold text-white hover:brightness-125">Salvar</button>
      </div>
    </Overlay>
  )
}

function ModalCategorias({ rows, catMap, categorias, onSalvar, onClose }: {
  rows: Titulo[]; catMap: Record<string, string>; categorias: string[]
  onSalvar: (m: Record<string, string>) => void; onClose: () => void
}) {
  // participantes do lado das DESPESAS (D), ordenados por valor pago desc
  const fornecedores = useMemo(() => {
    const acc = new Map<string, { total: number; obs: string }>()
    for (const r of rows) if (r.tipo === 'saida' && r.participante) {
      const e = acc.get(r.participante) || { total: 0, obs: '' }
      e.total += r.valorPago || r.valorDoc
      if (!e.obs && r.obs) e.obs = r.obs
      acc.set(r.participante, e)
    }
    return Array.from(acc.entries()).map(([cnpj, v]) => ({ cnpj, ...v })).sort((a, b) => b.total - a.total)
  }, [rows])
  const [busca, setBusca] = useState('')
  const [local, setLocal] = useState<Record<string, string>>(() => ({ ...catMap }))
  const visiveis = fornecedores.filter((f) => {
    if (!busca) return true
    const q = busca.toLowerCase()
    return f.cnpj.includes(q) || (f.obs || '').toLowerCase().includes(q) || (local[f.cnpj] || '').toLowerCase().includes(q)
  })
  const preenchidos = fornecedores.filter((f) => (local[f.cnpj] || '').trim()).length
  return (
    <Overlay onClose={onClose} wide>
      <div className="flex items-center gap-2">
        <h3 className="text-[15px] font-bold text-ink">Categorias de despesa</h3>
        <span className="text-[12px] text-muted">{preenchidos}/{fornecedores.length} fornecedores classificados</span>
      </div>
      <p className="mt-1 text-[12px] text-muted">Associe cada fornecedor a uma categoria. A base não traz o nome — mostramos a descrição do pagamento (Observação) e o CNPJ para você identificar. Os maiores gastos vêm primeiro.</p>
      <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar fornecedor, CNPJ ou categoria…" className="mt-3 w-full rounded-md border border-line bg-white px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-ink/40" />
      <datalist id="cats-existentes">{categorias.map((c) => <option key={c} value={c} />)}</datalist>
      <div className="mt-3 max-h-[46vh] overflow-y-auto rounded-lg border border-line">
        <table className="w-full text-left text-[12px]">
          <thead className="sticky top-0 bg-paper">
            <tr className="text-[11px] uppercase tracking-wide text-muted">
              <th className="px-3 py-2 font-semibold">Fornecedor (descrição / CNPJ)</th>
              <th className="px-3 py-2 text-right font-semibold">Gasto</th>
              <th className="px-3 py-2 font-semibold">Categoria</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((f) => (
              <tr key={f.cnpj} className="border-t border-line/60">
                <td className="px-3 py-1.5">
                  <div className="max-w-[280px] truncate text-ink" title={f.obs}>{f.obs || '—'}</div>
                  <div className="text-[10px] text-muted">{f.cnpj}</div>
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-muted">{reais(f.total)}</td>
                <td className="px-3 py-1.5">
                  <input list="cats-existentes" value={local[f.cnpj] || ''} onChange={(e) => setLocal((p) => ({ ...p, [f.cnpj]: e.target.value }))}
                    placeholder="Sem categoria" className="w-full rounded border border-line bg-white px-2 py-1 text-[12px] text-ink outline-none focus:border-ink/40" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-semibold text-muted hover:bg-paper">Cancelar</button>
        <button onClick={() => onSalvar(local)} className="rounded-lg bg-ink px-4 py-1.5 text-[12px] font-bold text-white hover:brightness-125">Salvar categorias</button>
      </div>
    </Overlay>
  )
}

function Overlay({ children, onClose, wide }: { children: ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className={`w-full ${wide ? 'max-w-2xl' : 'max-w-sm'} rounded-2xl bg-white p-5 shadow-2xl`} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

/* ============================ controles base ============================ */
function Toggle<T extends string>({ valor, set, ops }: { valor: T; set: (v: T) => void; ops: [T, string][] }) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-line">
      {ops.map(([v, txt]) => (
        <button key={v} onClick={() => set(v)} className={`px-2.5 py-1 text-[11px] font-semibold transition ${valor === v ? 'bg-ink text-white' : 'bg-white text-muted hover:bg-paper'}`}>{txt}</button>
      ))}
    </div>
  )
}
function DateIn({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className="rounded-md border border-line bg-white px-2 py-1 text-[12px] font-semibold text-ink outline-none focus:border-ink/40" />
}
function MultiSelect({ label, opcoes, value, onChange }: { label: string; opcoes: string[]; value: Set<string> | null; onChange: (s: Set<string> | null) => void }) {
  const [open, setOpen] = useState(false)
  const isAll = value === null
  const has = (c: string) => isAll || value!.has(c)
  const count = isAll ? opcoes.length : value!.size
  function toggle(c: string) {
    const base = isAll ? new Set(opcoes) : new Set(value!)
    if (base.has(c)) base.delete(c); else base.add(c)
    onChange(base.size === opcoes.length ? null : base)
  }
  return (
    <div className="relative text-[12px]">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 rounded-md border border-line bg-white px-2.5 py-1 font-medium text-ink transition hover:bg-paper">
        <span className="text-muted">{label}</span><b>{isAll ? 'Todos' : `${count}/${opcoes.length}`}</b><span className="text-[9px] text-muted">▼</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-8 z-50 max-h-[340px] w-60 overflow-auto rounded-lg border border-line bg-white p-2 shadow-xl">
            <div className="mb-1 flex gap-2 border-b border-line pb-1.5">
              <button className="rounded px-2 py-0.5 text-[11px] font-semibold text-ink hover:bg-paper" onClick={() => onChange(null)}>Todos</button>
              <button className="rounded px-2 py-0.5 text-[11px] font-semibold text-muted hover:bg-paper" onClick={() => onChange(new Set())}>Nenhum</button>
            </div>
            {opcoes.map((c) => (
              <label key={c} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-paper">
                <input type="checkbox" checked={has(c)} onChange={() => toggle(c)} className="accent-ink" />
                <span className="truncate">{c}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
function Kpi({ lbl, valor, foot, tip, cor }: { lbl: string; valor: string; foot?: string; tip: string; cor?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3.5 shadow-card">
      <div className="flex items-center gap-1"><span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{lbl}</span><Info tip={tip} /></div>
      <div className="mt-1 text-[20px] font-bold tabular-nums" style={{ color: cor ?? '#1b1815' }}>{valor}</div>
      {foot && <div className="mt-0.5 text-[11px] text-muted">{foot}</div>}
    </div>
  )
}
function Alerta({ tipo, texto, onClose }: { tipo: 'erro' | 'ok'; texto: string; onClose: () => void }) {
  const ok = tipo === 'ok'
  return (
    <div className="flex items-start gap-2 rounded-lg border px-3 py-2 text-[13px]" style={{ background: ok ? '#ecfdf5' : '#fef2f2', borderColor: ok ? '#a7f3d0' : '#fecaca', color: ok ? '#065f46' : '#991b1b' }}>
      <span className="flex-1">{texto}</span>
      <button onClick={onClose} className="font-bold opacity-60 hover:opacity-100">×</button>
    </div>
  )
}
function Info({ tip }: { tip: string }) {
  return (
    <span title={tip} className="ml-0.5 inline-grid h-3.5 w-3.5 cursor-help place-items-center rounded-full border border-ink/30 align-middle text-[9px] font-bold text-muted">i</span>
  )
}

/* ================================================================== *
 *  PROJETADO — contas a pagar/receber em aberto (Foodpro) + lançamentos
 *  fixos cadastrados. 100% isolado do Realizado: tabelas, upload, saldo
 *  de abertura e categorias próprios. Vencimento < hoje vira "Atrasado".
 * ================================================================== */
type ViewProj = 'fluxo' | 'titulos'

function ProjetadoView() {
  const { user, mode } = useAuth()
  const isAdmin = user?.role === 'admin'
  const hoje = useMemo(() => hojeISO(), [])
  const horizontePadrao = useMemo(() => addMesesISO(hoje, 6), [hoje])

  const [rows, setRows] = useState<TituloProj[]>([])
  const [fixos, setFixos] = useState<LancamentoFixo[]>([])
  const [catMap, setCatMap] = useState<Record<string, string>>({})
  const [aberturaValor, setAberturaValor] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [view, setView] = useState<ViewProj>('fluxo')
  const [gran, setGran] = useState<Gran>('mes')
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const [selOrigem, setSelOrigem] = useState<Set<string> | null>(null)
  const [selCat, setSelCat] = useState<Set<string> | null>(null)
  const [editCat, setEditCat] = useState(false)
  const [editAbertura, setEditAbertura] = useState(false)
  const [editFixos, setEditFixos] = useState(false)
  const [filtrosAbertos, setFiltrosAbertos] = useState(true)

  useEffect(() => { setDe((prev) => prev || hoje) }, [hoje])
  useEffect(() => { setAte((prev) => prev || horizontePadrao) }, [horizontePadrao])

  const carregar = useCallback(async () => {
    setLoading(true); setErro(null)
    if (mode !== 'supabase' || !supabase) { setLoading(false); return }
    type L = {
      origem: string | null; numero: string | null; item: string | null; tipo: string | null; doc_tipo: string | null
      movimento: string | null; vencimento: string | null; participante: string | null
      valor: number | string | null; juros_multa: number | string | null; situacao_origem: string | null
    }
    const COLS = 'origem, numero, item, tipo, doc_tipo, movimento, vencimento, participante, valor, juros_multa, situacao_origem'
    const res = await fetchAllRows<L>((from, to) =>
      supabase!.from('fin_titulos_projetados').select(COLS).order('vencimento').order('id').range(from, to))
    if (res.error) {
      setErro('Não foi possível carregar o Projetado. Verifique se as tabelas foram criadas (fin-caixa-projetado.sql).')
      setLoading(false); return
    }

    const cm: Record<string, string> = {}
    const rcat = await supabase.from('fin_projetado_categoria_map').select('participante, categoria')
    if (!rcat.error && rcat.data) for (const c of rcat.data as { participante: string; categoria: string }[]) {
      if (c.participante) cm[c.participante] = (c.categoria ?? '').trim()
    }
    setCatMap(cm)

    const rcfg = await supabase.from('fin_config').select('chave, valor').eq('chave', 'projetado_abertura_valor')
    if (!rcfg.error && rcfg.data) for (const c of rcfg.data as { chave: string; valor: string }[]) {
      if (c.chave === 'projetado_abertura_valor') setAberturaValor(parseBR(c.valor ?? '0'))
    }

    const rfix = await supabase.from('fin_lancamentos_fixos').select('id, nome, tipo, categoria, valor, dia_mes, data_inicio, data_fim, ativo').order('nome')
    if (!rfix.error && rfix.data) {
      type F = { id: number; nome: string; tipo: string; categoria: string | null; valor: number | string; dia_mes: number; data_inicio: string; data_fim: string | null; ativo: boolean }
      setFixos((rfix.data as F[]).map((f) => ({
        id: f.id, nome: f.nome, tipo: f.tipo === 'entrada' ? 'entrada' : 'saida', categoria: f.categoria ?? '',
        valor: Number(f.valor) || 0, diaMes: Number(f.dia_mes) || 1, dataInicio: (f.data_inicio ?? '').slice(0, 10),
        dataFim: (f.data_fim ?? '').slice(0, 10), ativo: !!f.ativo,
      })))
    }

    const mapped: TituloProj[] = (res.data).map((r) => {
      const participante = (r.participante ?? '').toString().trim()
      return {
        origem: (r.origem ?? '').toString().trim() || '(sem canal)',
        numero: (r.numero ?? '').toString().trim(),
        item: (r.item ?? '').toString().trim(),
        tipo: (r.tipo ?? '') === 'entrada' ? 'entrada' : 'saida',
        docTipo: (r.doc_tipo ?? '').toString().trim(),
        movimento: (r.movimento ?? '').toString().slice(0, 10),
        vencimento: (r.vencimento ?? '').toString().slice(0, 10),
        participante,
        valor: Number(r.valor) || 0,
        jurosMulta: Number(r.juros_multa) || 0,
        situacaoOrigem: (r.situacao_origem ?? '').toString().trim(),
        categoria: cm[participante] || '',
      }
    })
    setRows(mapped)
    setLoading(false)
  }, [mode])

  useEffect(() => { carregar() }, [carregar])

  const origensBase = useMemo(() => Array.from(new Set(rows.map((r) => r.origem))).sort(), [rows])
  const temFixosAtivos = useMemo(() => fixos.some((f) => f.ativo), [fixos])
  const origens = useMemo(() => (temFixosAtivos ? [...origensBase, 'Lançamentos fixos'] : origensBase), [origensBase, temFixosAtivos])
  const origemOk = useCallback((o: string) => selOrigem === null || selOrigem.has(o), [selOrigem])
  const categorias = useMemo(() => {
    const s = new Set<string>()
    for (const r of rows) if (r.tipo === 'saida') s.add(r.categoria || SEM_CAT)
    for (const f of fixos) if (f.tipo === 'saida' && f.ativo) s.add(f.categoria || SEM_CAT)
    return Array.from(s).sort()
  }, [rows, fixos])

  /* ============ FLUXO PROJETADO: matriz (linhas = contas, colunas = Atrasado + períodos) ============ *
   * Eventos = títulos em aberto (data=vencimento) + ocorrências mensais dos lançamentos fixos ativos
   * (a partir do mês atual, nunca retroagindo). vencimento/ocorrência < hoje entra no bucket "Atrasado". */
  const fluxo = useMemo(() => {
    const horizonte = ate || horizontePadrao
    const deFiltro = de || hoje
    type Ev = { date: string; valor: number; tipo: 'entrada' | 'saida'; canal: string; quem: string; categoria: string; atrasado: boolean }
    const eventos: Ev[] = []
    for (const r of rows) {
      if (!origemOk(r.origem)) continue
      eventos.push({
        date: r.vencimento, valor: r.valor, tipo: r.tipo, canal: r.origem, quem: r.participante || '(sem nome)',
        categoria: r.tipo === 'saida' ? (r.categoria || SEM_CAT) : '', atrasado: r.vencimento < hoje,
      })
    }
    if (origemOk('Lançamentos fixos')) {
      for (const f of fixos) {
        if (!f.ativo) continue
        for (const date of ocorrenciasFixo(f, hoje, horizonte)) {
          eventos.push({ date, valor: f.valor, tipo: f.tipo, canal: 'Lançamentos fixos', quem: f.nome, categoria: f.tipo === 'saida' ? (f.categoria || SEM_CAT) : '', atrasado: date < hoje })
        }
      }
    }
    const catOk = (c: string) => selCat === null || selCat.has(c || SEM_CAT)
    // Atrasado sempre aparece (é um alerta, não faz parte da janela escolhida); os demais respeitam De/Até.
    const dentro = eventos.filter((e) => (e.atrasado || (e.date >= deFiltro && e.date <= horizonte)) && (e.tipo === 'entrada' || catOk(e.categoria)))

    const bset = new Map<string, string>()
    for (const e of dentro) {
      if (e.atrasado) { bset.set('__atrasado__', 'Atrasado'); continue }
      const b = bucket(e.date, gran); bset.set(b.key, b.label)
    }
    const cronologicas = Array.from(bset.keys()).filter((k) => k !== '__atrasado__').sort()
    const cols = [
      ...(bset.has('__atrasado__') ? [{ key: '__atrasado__', label: 'Atrasado' }] : []),
      ...cronologicas.map((key) => ({ key, label: bset.get(key)! })),
    ]
    const zero = () => { const o: Record<string, number> = {}; for (const c of cols) o[c.key] = 0; return o }
    const bucketKey = (e: Ev) => (e.atrasado ? '__atrasado__' : bucket(e.date, gran).key)

    const entMap = new Map<string, Record<string, number>>()
    const catAgg = new Map<string, { vals: Record<string, number>; forn: Map<string, { label: string; vals: Record<string, number> }> }>()
    for (const e of dentro) {
      const bk = bucketKey(e)
      if (e.tipo === 'entrada') {
        let m = entMap.get(e.canal); if (!m) { m = zero(); entMap.set(e.canal, m) }
        m[bk] += e.valor
      } else {
        const c = e.categoria || SEM_CAT
        let ce = catAgg.get(c); if (!ce) { ce = { vals: zero(), forn: new Map() }; catAgg.set(c, ce) }
        ce.vals[bk] += e.valor
        let f = ce.forn.get(e.quem); if (!f) { f = { label: e.quem, vals: zero() }; ce.forn.set(e.quem, f) }
        f.vals[bk] += e.valor
      }
    }
    const soma = (v: Record<string, number>) => cols.reduce((s, c) => s + v[c.key], 0)
    const entradaRows = Array.from(entMap.entries()).map(([nome, vals]) => ({ nome, vals, total: soma(vals) })).sort((a, b) => b.total - a.total)
    const despesaRows = Array.from(catAgg.entries()).map(([nome, e]) => ({
      nome, vals: e.vals, total: soma(e.vals),
      fornecedores: Array.from(e.forn.values()).map((f) => ({ nome: f.label, vals: f.vals, total: soma(f.vals) })).sort((a, b) => b.total - a.total),
    })).sort((a, b) => b.total - a.total)

    const totalEntradas = zero(), totalSaidas = zero(), fluxoOp = zero(), saldoInicial = zero(), saldoFinal = zero()
    let prev = aberturaValor
    for (const c of cols) {
      const te = entradaRows.reduce((s, r) => s + r.vals[c.key], 0)
      const ts = despesaRows.reduce((s, r) => s + r.vals[c.key], 0)
      totalEntradas[c.key] = te; totalSaidas[c.key] = ts; fluxoOp[c.key] = te - ts
      saldoInicial[c.key] = prev; saldoFinal[c.key] = prev + te - ts; prev = saldoFinal[c.key]
    }
    return { cols, entradaRows, despesaRows, totalEntradas, totalSaidas, fluxoOp, saldoInicial, saldoFinal }
  }, [rows, fixos, de, ate, horizontePadrao, gran, origemOk, selCat, aberturaValor, hoje])

  const kpis = useMemo(() => {
    const atrasadoRec = fluxo.entradaRows.reduce((s, r) => s + (r.vals['__atrasado__'] || 0), 0)
    const atrasadoPag = fluxo.despesaRows.reduce((s, r) => s + (r.vals['__atrasado__'] || 0), 0)
    const futCols = fluxo.cols.filter((c) => c.key !== '__atrasado__')
    const futEntradas = futCols.reduce((s, c) => s + fluxo.totalEntradas[c.key], 0)
    const futSaidas = futCols.reduce((s, c) => s + fluxo.totalSaidas[c.key], 0)
    return { atrasadoRec, atrasadoPag, futEntradas, futSaidas }
  }, [fluxo])

  /* ================= TÍTULOS (lista) ================= */
  const titulosFiltrados = useMemo(() => {
    const horizonte = ate || horizontePadrao
    const deFiltro = de || hoje
    const catOk = (c: string) => selCat === null || selCat.has(c || SEM_CAT)
    return rows
      .filter((r) => origemOk(r.origem))
      .filter((r) => r.tipo === 'entrada' || catOk(r.categoria))
      .filter((r) => r.vencimento < hoje || (r.vencimento >= deFiltro && r.vencimento <= horizonte))
      .sort((a, b) => a.vencimento.localeCompare(b.vencimento))
  }, [rows, selCat, origemOk, de, ate, horizontePadrao, hoje])

  /* ---------- ações admin ---------- */
  async function handleFile(file: File) {
    setErro(null); setAviso(null); setBusy(true)
    try {
      const novo = await parseProjetadoFile(file)
      const porOrigem = new Map<string, number>()
      for (const r of novo) porOrigem.set(r.origem, (porOrigem.get(r.origem) || 0) + 1)
      const resumo = Array.from(porOrigem.entries()).map(([o, n]) => `${o}: ${n}`).join(' · ')
      const ok = window.confirm(
        `ATUALIZAR BASE PROJETADA\n\nIsto substitui TODA a base atual do Projetado pelos ${novo.length} títulos deste arquivo ` +
        `(${resumo}). Não afeta o Realizado.\n\nDeseja continuar?`,
      )
      if (!ok) { setAviso('Atualização cancelada — a base atual foi mantida.'); setBusy(false); return }

      if (mode === 'supabase' && supabase) {
        const payload = novo.map((r) => ({
          origem: r.origem, numero: r.numero, item: r.item, tipo: r.tipo, doc_tipo: r.docTipo,
          movimento: r.movimento || null, vencimento: r.vencimento || null, participante: r.participante,
          valor: r.valor, juros_multa: r.jurosMulta, situacao_origem: r.situacaoOrigem,
        }))
        const { error } = await supabase.rpc('fin_projetado_replace', { p_rows: payload })
        if (error) throw new Error(error.message)
        await carregar()
      } else {
        setRows(novo.map((r) => ({ ...r, categoria: catMap[r.participante] || '' })))
      }
      setAviso(`Base projetada atualizada: ${novo.length} títulos (${resumo}).`)
    } catch (e) {
      setErro(`Não consegui ler o arquivo: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  async function salvarAbertura(valor: number) {
    if (mode === 'supabase' && supabase) {
      const { error } = await supabase.from('fin_config').upsert([{ chave: 'projetado_abertura_valor', valor: String(valor) }], { onConflict: 'chave' })
      if (error) { setErro(`Não consegui salvar o saldo de abertura: ${error.message}`); return }
    }
    setAberturaValor(valor); setEditAbertura(false)
    setAviso('Saldo de abertura salvo.')
  }

  async function salvarCategorias(mapa: Record<string, string>) {
    const linhas = Object.entries(mapa).map(([participante, categoria]) => ({ participante, categoria: categoria.trim() }))
    if (mode === 'supabase' && supabase && linhas.length) {
      const { error } = await supabase.from('fin_projetado_categoria_map').upsert(linhas, { onConflict: 'participante' })
      if (error) { setErro(`Não consegui salvar as categorias: ${error.message}`); return }
    }
    const cm = { ...catMap }
    for (const l of linhas) cm[l.participante] = l.categoria
    setCatMap(cm)
    setRows((prev) => prev.map((r) => ({ ...r, categoria: cm[r.participante] || '' })))
    setEditCat(false)
    setAviso('Categorias salvas.')
  }

  async function salvarFixo(f: LancamentoFixo) {
    if (mode === 'supabase' && supabase) {
      const payload = { nome: f.nome, tipo: f.tipo, categoria: f.categoria || null, valor: f.valor, dia_mes: f.diaMes, data_inicio: f.dataInicio, data_fim: f.dataFim || null, ativo: f.ativo }
      if (f.id) {
        const { error } = await supabase.from('fin_lancamentos_fixos').update(payload).eq('id', f.id)
        if (error) { setErro(`Não consegui salvar: ${error.message}`); return }
      } else {
        const { error } = await supabase.from('fin_lancamentos_fixos').insert([payload])
        if (error) { setErro(`Não consegui salvar: ${error.message}`); return }
      }
      await carregar()
    } else {
      setFixos((prev) => (f.id ? prev.map((x) => (x.id === f.id ? f : x)) : [...prev, { ...f, id: Math.max(0, ...prev.map((x) => x.id)) + 1 }]))
    }
    setAviso('Lançamento fixo salvo.')
  }

  async function excluirFixo(id: number) {
    if (!window.confirm('Excluir este lançamento fixo?')) return
    if (mode === 'supabase' && supabase) {
      const { error } = await supabase.from('fin_lancamentos_fixos').delete().eq('id', id)
      if (error) { setErro(`Não consegui excluir: ${error.message}`); return }
      await carregar()
    } else {
      setFixos((prev) => prev.filter((x) => x.id !== id))
    }
    setAviso('Lançamento fixo excluído.')
  }

  const vazio = !loading && rows.length === 0 && fixos.length === 0

  if (loading) return <div className="grid place-items-center py-24 text-sm text-muted">Carregando projeção…</div>

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {filtrosAbertos ? (
          <Toggle valor={view} set={setView} ops={[['fluxo', 'Fluxo Projetado'], ['titulos', 'Títulos']]} />
        ) : (
          <span className="text-sm font-semibold text-ink">Fluxo de Caixa Projetado</span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {filtrosAbertos && (
            <>
              {isAdmin && (
                <button onClick={() => setEditAbertura(true)} className="rounded-lg border border-line bg-surface px-3 py-2 text-[12px] font-bold text-ink transition hover:bg-paper" title="Definir o saldo de caixa de partida da projeção (independente do Realizado).">
                  Saldo de abertura
                </button>
              )}
              {isAdmin && (
                <button onClick={() => setEditFixos(true)} className="rounded-lg border border-line bg-surface px-3 py-2 text-[12px] font-bold text-ink transition hover:bg-paper" title="Cadastrar entradas e saídas fixas que se repetem todo mês.">
                  Lançamentos fixos
                </button>
              )}
              {isAdmin && (
                <button onClick={() => setEditCat(true)} className="rounded-lg border border-line bg-surface px-3 py-2 text-[12px] font-bold text-ink transition hover:bg-paper" title="Associar cada participante a uma categoria de despesa (de-para próprio do Projetado).">
                  Categorias
                </button>
              )}
              {isAdmin && (
                <button onClick={() => fileRef.current?.click()} disabled={busy} className="rounded-lg bg-ink px-3 py-2 text-[12px] font-bold text-white shadow-brand transition hover:brightness-125 disabled:opacity-50" title="Enviar o Excel 'Fluxo de Caixa Orçado' do Foodpro (títulos em aberto). Substitui toda a base projetada.">
                  {busy ? 'Processando…' : 'Atualizar base'}
                </button>
              )}
              {isAdmin && (
                <InfoHint
                  title="Como atualizar o Projetado"
                  steps={[
                    'No Foodpro, exporte o "Fluxo de Caixa Orçado" (títulos em aberto).',
                    'Clique em "Atualizar base" e selecione o arquivo (.xlsx ou .xls).',
                    'O arquivo já traz os dois canais (Vendas e Distribuidora) juntos — é um upload só.',
                  ]}
                  warn="Cada envio substitui TODA a base projetada. Não afeta o Realizado nem o saldo de abertura."
                />
              )}
            </>
          )}
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} />
          {!vazio && <FiltrosToggle aberto={filtrosAbertos} onToggle={() => setFiltrosAbertos((v) => !v)} />}
        </div>
      </div>

      {!vazio && filtrosAbertos && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted" title='O que já está "Atrasado" sempre aparece, independente do período escolhido.'>Período</span>
          <DateIn value={de || hoje} onChange={setDe} />
          <span className="text-muted">até</span>
          <DateIn value={ate || horizontePadrao} onChange={setAte} />
          {origens.length > 1 && <MultiSelect label="Canal" opcoes={origens} value={selOrigem} onChange={setSelOrigem} />}
          {view === 'fluxo' && (
            <div className="ml-1 flex items-center gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Ver por</span>
              <Toggle valor={gran} set={setGran} ops={[['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês']]} />
            </div>
          )}
        </div>
      )}

      {erro && <Alerta tipo="erro" texto={erro} onClose={() => setErro(null)} />}
      {aviso && <Alerta tipo="ok" texto={aviso} onClose={() => setAviso(null)} />}

      {vazio ? (
        <div className="grid place-items-center gap-2 rounded-2xl border border-dashed border-line bg-surface/60 px-6 py-16 text-center">
          <p className="font-serif text-lg text-ink">O fluxo projetado ainda não foi carregado.</p>
          <p className="max-w-md text-sm text-muted">
            {isAdmin
              ? 'Clique em "Atualizar base" e envie o Excel "Fluxo de Caixa Orçado" do Foodpro, ou cadastre Lançamentos fixos.'
              : 'Assim que um administrador enviar a base ou cadastrar lançamentos fixos, a projeção aparecerá aqui.'}
          </p>
        </div>
      ) : view === 'fluxo' ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi lbl="Atrasado a receber" valor={reais(kpis.atrasadoRec)} cor={COR_IN} tip="Títulos ou lançamentos fixos com vencimento antes de hoje, ainda não recebidos." />
            <Kpi lbl="Atrasado a pagar" valor={reais(kpis.atrasadoPag)} cor={COR_OUT} tip="Títulos ou lançamentos fixos com vencimento antes de hoje, ainda não pagos." />
            <Kpi lbl="A receber (até o horizonte)" valor={reais(kpis.futEntradas)} cor={COR_IN} tip="Soma de entradas futuras (a partir de hoje) até a data do horizonte." />
            <Kpi lbl="A pagar (até o horizonte)" valor={reais(kpis.futSaidas)} cor={COR_OUT} tip="Soma de saídas futuras (a partir de hoje) até a data do horizonte." />
          </div>
          <FluxoViewProjetado f={fluxo} />
        </>
      ) : (
        <TitulosViewProjetado rows={titulosFiltrados} hoje={hoje} categorias={categorias} selCat={selCat} setSelCat={setSelCat} />
      )}

      {editAbertura && <ModalAberturaProjetado valor={aberturaValor} onSalvar={salvarAbertura} onClose={() => setEditAbertura(false)} />}
      {editCat && <ModalCategoriasProjetado rows={rows} catMap={catMap} categorias={categorias.filter((c) => c !== SEM_CAT)} onSalvar={salvarCategorias} onClose={() => setEditCat(false)} />}
      {editFixos && <ModalLancamentosFixos fixos={fixos} categorias={categorias.filter((c) => c !== SEM_CAT)} onSalvar={salvarFixo} onExcluir={excluirFixo} onClose={() => setEditFixos(false)} />}
    </div>
  )
}

/* ============================ FLUXO Projetado (matriz) ============================ */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function FluxoViewProjetado({ f }: { f: any }) {
  const [aberto, setAberto] = useState<Set<string>>(new Set())
  const cols = f.cols as { key: string; label: string }[]
  const toggle = (c: string) => setAberto((p) => { const n = new Set(p); n.has(c) ? n.delete(c) : n.add(c); return n })
  const entradaRows = f.entradaRows as { nome: string; vals: Record<string, number>; total: number }[]
  const despesaRows = f.despesaRows as { nome: string; vals: Record<string, number>; total: number; fornecedores: { nome: string; vals: Record<string, number>; total: number }[] }[]

  if (!cols.length) return <div className="rounded-xl border border-line bg-surface p-12 text-center text-muted">Nenhum título em aberto ou lançamento fixo dentro do horizonte selecionado.</div>

  return (
    <div className="rounded-xl border border-line bg-surface shadow-card">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-line px-4 py-2 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: '#fef3c7', border: '1px solid #fcd34d' }} /><b style={{ color: '#92400e' }}>Atrasado</b> — vencimento antes de hoje, ainda não pago/recebido.</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: '#fff', border: '1px solid #d9cfc4' }} /><b className="text-ink">Demais colunas</b> — projeção pelo vencimento (títulos em aberto + lançamentos fixos).</span>
      </div>
      <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-[12.5px]">
        <thead>
          <tr>
            <th className="sticky left-0 z-20 px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-muted" style={{ background: HDR }}>Descrição</th>
            {cols.map((c) => {
              const atrasado = c.key === '__atrasado__'
              return (
                <th key={c.key} className="whitespace-nowrap px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wide" style={{ background: atrasado ? '#fef3c7' : HDR, color: atrasado ? '#92400e' : undefined }}>
                  {c.label}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          <LinhaFluxo label="Saldo Inicial" bold>
            {cols.map((c) => <ValCell key={c.key} v={f.saldoInicial[c.key]} bold />)}
          </LinhaFluxo>

          {entradaRows.map((r) => (
            <LinhaFluxo key={r.nome} label={`(+) ${r.nome}`} indent={1}>
              {cols.map((c) => <ValCell key={c.key} v={r.vals[c.key]} color={COR_IN} />)}
            </LinhaFluxo>
          ))}
          <LinhaFluxo label="Total de Entradas" bold bg={BG_IN}>
            {cols.map((c) => <ValCell key={c.key} v={f.totalEntradas[c.key]} bold color={COR_IN} />)}
          </LinhaFluxo>

          {despesaRows.map((r) => (
            <Fragment key={r.nome}>
              <LinhaFluxo label={`(-) ${r.nome}`} indent={1} chevron={r.fornecedores.length > 0} open={aberto.has(r.nome)} onToggle={() => toggle(r.nome)}>
                {cols.map((c) => <ValCell key={c.key} v={r.vals[c.key]} color={COR_OUT} />)}
              </LinhaFluxo>
              {aberto.has(r.nome) && r.fornecedores.map((fo, i) => (
                <LinhaFluxo key={i} label={fo.nome.length > 42 ? `${fo.nome.slice(0, 42)}…` : fo.nome} indent={2} sub>
                  {cols.map((c) => <ValCell key={c.key} v={fo.vals[c.key]} />)}
                </LinhaFluxo>
              ))}
            </Fragment>
          ))}
          <LinhaFluxo label="Total de Saídas" bold bg={BG_OUT}>
            {cols.map((c) => <ValCell key={c.key} v={f.totalSaidas[c.key]} bold color={COR_OUT} />)}
          </LinhaFluxo>

          <LinhaFluxo label="Fluxo Projetado" bold>
            {cols.map((c) => <ValCell key={c.key} v={f.fluxoOp[c.key]} bold color={f.fluxoOp[c.key] >= 0 ? COR_IN : COR_OUT} />)}
          </LinhaFluxo>
          <LinhaFluxo label="Saldo Final Projetado" bold bg={BG_SLD}>
            {cols.map((c) => <ValCell key={c.key} v={f.saldoFinal[c.key]} bold />)}
          </LinhaFluxo>
        </tbody>
      </table>
      </div>
    </div>
  )
}

/* ============================ TÍTULOS Projetado (lista) ============================ */
function TitulosViewProjetado({ rows, hoje, categorias, selCat, setSelCat }: {
  rows: TituloProj[]; hoje: string; categorias: string[]; selCat: Set<string> | null; setSelCat: (s: Set<string> | null) => void
}) {
  const LIM = 800
  const totais = useMemo(() => {
    let ent = 0, sai = 0
    for (const r of rows) { if (r.tipo === 'entrada') ent += r.valor; else sai += r.valor }
    return { ent, sai, n: rows.length }
  }, [rows])
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {categorias.length > 1 && <MultiSelect label="Categoria" opcoes={categorias} value={selCat} onChange={setSelCat} />}
        <div className="ml-auto flex gap-4 text-[12px]">
          <span className="text-muted">Títulos: <b className="text-ink">{fmt0(totais.n)}</b></span>
          <span style={{ color: COR_IN }}>A receber: <b>{reais(totais.ent)}</b></span>
          <span style={{ color: COR_OUT }}>A pagar: <b>{reais(totais.sai)}</b></span>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-card">
        <table className="w-full text-left text-[12px]">
          <thead>
            <tr className="border-b border-line text-[11px] uppercase tracking-wide text-muted">
              <th className="px-3 py-2 font-semibold">Canal</th>
              <th className="px-3 py-2 font-semibold">Participante</th>
              <th className="px-3 py-2 font-semibold">Documento</th>
              <th className="px-3 py-2 font-semibold">Categoria</th>
              <th className="px-3 py-2 text-right font-semibold">Vencimento</th>
              <th className="px-3 py-2 text-right font-semibold">Valor</th>
              <th className="px-3 py-2 text-center font-semibold">Situação</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rows.slice(0, LIM).map((r, i) => {
              const ent = r.tipo === 'entrada'
              const atrasado = r.vencimento < hoje
              return (
                <tr key={i} className="border-b border-line/60 last:border-0 hover:bg-paper/50">
                  <td className="px-3 py-1.5 text-muted">{r.origem.replace('Foodpro ', '')}</td>
                  <td className="px-3 py-1.5 max-w-[220px] truncate text-ink" title={r.participante}>{r.participante || '—'}</td>
                  <td className="px-3 py-1.5 text-muted">{r.numero}{r.item && r.item !== '1' ? `/${r.item}` : ''}</td>
                  <td className="px-3 py-1.5"><span className={r.categoria ? 'text-ink' : 'text-muted'}>{r.categoria || SEM_CAT}</span></td>
                  <td className="px-3 py-1.5 text-right text-ink">{br(r.vencimento)}</td>
                  <td className="px-3 py-1.5 text-right font-semibold" style={{ color: ent ? COR_IN : COR_OUT }}>{ent ? '' : '−'}{fmt2(r.valor)}</td>
                  <td className="px-3 py-1.5 text-center">
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={atrasado ? { background: '#fef3c7', color: '#92400e' } : { background: '#dbeafe', color: '#1e40af' }}>{atrasado ? 'Atrasado' : 'A vencer'}</span>
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted">Nenhum título com esses filtros.</td></tr>}
          </tbody>
        </table>
      </div>
      {rows.length > LIM && (
        <p className="text-center text-[12px] text-muted">Mostrando os primeiros {LIM} de {fmt0(rows.length)} títulos.</p>
      )}
    </div>
  )
}

/* ============================ modais do Projetado ============================ */
function ModalAberturaProjetado({ valor, onSalvar, onClose }: { valor: number; onSalvar: (v: number) => void; onClose: () => void }) {
  const [v, setV] = useState(valor ? fmt2(valor) : '')
  return (
    <Overlay onClose={onClose}>
      <h3 className="text-[15px] font-bold text-ink">Saldo de abertura (Projetado)</h3>
      <p className="mt-1 text-[12px] text-muted">Ponto de partida da projeção — normalmente o seu saldo de caixa atual. Independente do saldo de abertura do Realizado.</p>
      <label className="mt-4 block text-[12px] font-semibold text-ink">Saldo (R$)
        <input value={v} onChange={(e) => setV(e.target.value)} placeholder="0,00" inputMode="decimal" className="mt-1 w-full rounded-md border border-line bg-white px-2 py-1.5 text-[13px] text-ink outline-none focus:border-ink/40" />
      </label>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-semibold text-muted hover:bg-paper">Cancelar</button>
        <button onClick={() => onSalvar(parseBR(v))} className="rounded-lg bg-ink px-4 py-1.5 text-[12px] font-bold text-white hover:brightness-125">Salvar</button>
      </div>
    </Overlay>
  )
}

function ModalCategoriasProjetado({ rows, catMap, categorias, onSalvar, onClose }: {
  rows: TituloProj[]; catMap: Record<string, string>; categorias: string[]
  onSalvar: (m: Record<string, string>) => void; onClose: () => void
}) {
  const participantes = useMemo(() => {
    const acc = new Map<string, number>()
    for (const r of rows) if (r.tipo === 'saida' && r.participante) acc.set(r.participante, (acc.get(r.participante) || 0) + r.valor)
    return Array.from(acc.entries()).map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total)
  }, [rows])
  const [busca, setBusca] = useState('')
  const [local, setLocal] = useState<Record<string, string>>(() => ({ ...catMap }))
  const visiveis = participantes.filter((p) => {
    if (!busca) return true
    const q = busca.toLowerCase()
    return p.nome.toLowerCase().includes(q) || (local[p.nome] || '').toLowerCase().includes(q)
  })
  const preenchidos = participantes.filter((p) => (local[p.nome] || '').trim()).length
  return (
    <Overlay onClose={onClose} wide>
      <div className="flex items-center gap-2">
        <h3 className="text-[15px] font-bold text-ink">Categorias de despesa (Projetado)</h3>
        <span className="text-[12px] text-muted">{preenchidos}/{participantes.length} classificados</span>
      </div>
      <p className="mt-1 text-[12px] text-muted">Associe cada participante a uma categoria. De-para próprio do Projetado, independente do Realizado. Os maiores valores vêm primeiro.</p>
      <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar participante ou categoria…" className="mt-3 w-full rounded-md border border-line bg-white px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-ink/40" />
      <datalist id="cats-existentes-proj">{categorias.map((c) => <option key={c} value={c} />)}</datalist>
      <div className="mt-3 max-h-[46vh] overflow-y-auto rounded-lg border border-line">
        <table className="w-full text-left text-[12px]">
          <thead className="sticky top-0 bg-paper">
            <tr className="text-[11px] uppercase tracking-wide text-muted">
              <th className="px-3 py-2 font-semibold">Participante</th>
              <th className="px-3 py-2 text-right font-semibold">Valor em aberto</th>
              <th className="px-3 py-2 font-semibold">Categoria</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((p) => (
              <tr key={p.nome} className="border-t border-line/60">
                <td className="px-3 py-1.5 max-w-[280px] truncate text-ink" title={p.nome}>{p.nome}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-muted">{reais(p.total)}</td>
                <td className="px-3 py-1.5">
                  <input list="cats-existentes-proj" value={local[p.nome] || ''} onChange={(e) => setLocal((s) => ({ ...s, [p.nome]: e.target.value }))}
                    placeholder="Sem categoria" className="w-full rounded border border-line bg-white px-2 py-1 text-[12px] text-ink outline-none focus:border-ink/40" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-semibold text-muted hover:bg-paper">Cancelar</button>
        <button onClick={() => onSalvar(local)} className="rounded-lg bg-ink px-4 py-1.5 text-[12px] font-bold text-white hover:brightness-125">Salvar categorias</button>
      </div>
    </Overlay>
  )
}

function ModalLancamentosFixos({ fixos, categorias, onSalvar, onExcluir, onClose }: {
  fixos: LancamentoFixo[]; categorias: string[]
  onSalvar: (f: LancamentoFixo) => void; onExcluir: (id: number) => void; onClose: () => void
}) {
  const vazio: LancamentoFixo = { id: 0, nome: '', tipo: 'saida', categoria: '', valor: 0, diaMes: 10, dataInicio: hojeISO(), dataFim: '', ativo: true }
  const [editando, setEditando] = useState<LancamentoFixo | null>(null)
  const [valorTxt, setValorTxt] = useState('')

  function abrirNovo() { setEditando(vazio); setValorTxt('') }
  function abrirEdicao(f: LancamentoFixo) { setEditando(f); setValorTxt(fmt2(f.valor)) }
  function salvar() {
    if (!editando) return
    if (!editando.nome.trim()) { window.alert('Informe um nome.'); return }
    onSalvar({ ...editando, valor: parseBR(valorTxt) })
    setEditando(null)
  }

  return (
    <Overlay onClose={onClose} wide>
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-bold text-ink">Lançamentos fixos</h3>
        {!editando && <button onClick={abrirNovo} className="rounded-lg bg-ink px-3 py-1.5 text-[12px] font-bold text-white hover:brightness-125">+ Novo</button>}
      </div>
      <p className="mt-1 text-[12px] text-muted">Entradas ou saídas com valor fixo que se repetem todo mês (ex.: aluguel, folha). Projetam automaticamente no Fluxo, a partir do mês atual.</p>

      {editando ? (
        <div className="mt-4 flex flex-col gap-3 rounded-lg border border-line bg-paper/40 p-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-[12px] font-semibold text-ink">Nome
              <input value={editando.nome} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} className="mt-1 w-full rounded-md border border-line bg-white px-2 py-1.5 text-[13px] text-ink outline-none focus:border-ink/40" />
            </label>
            <label className="text-[12px] font-semibold text-ink">Tipo
              <div className="mt-1"><Toggle valor={editando.tipo} set={(v) => setEditando({ ...editando, tipo: v })} ops={[['entrada', 'Entrada'], ['saida', 'Saída']]} /></div>
            </label>
            <label className="text-[12px] font-semibold text-ink">Categoria
              <input list="cats-fixos" value={editando.categoria} onChange={(e) => setEditando({ ...editando, categoria: e.target.value })} placeholder="Sem categoria" className="mt-1 w-full rounded-md border border-line bg-white px-2 py-1.5 text-[13px] text-ink outline-none focus:border-ink/40" />
              <datalist id="cats-fixos">{categorias.map((c) => <option key={c} value={c} />)}</datalist>
            </label>
            <label className="text-[12px] font-semibold text-ink">Valor (R$)
              <input value={valorTxt} onChange={(e) => setValorTxt(e.target.value)} placeholder="0,00" inputMode="decimal" className="mt-1 w-full rounded-md border border-line bg-white px-2 py-1.5 text-[13px] text-ink outline-none focus:border-ink/40" />
            </label>
            <label className="text-[12px] font-semibold text-ink">Dia do mês
              <input type="number" min={1} max={31} value={editando.diaMes} onChange={(e) => setEditando({ ...editando, diaMes: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })} className="mt-1 w-full rounded-md border border-line bg-white px-2 py-1.5 text-[13px] text-ink outline-none focus:border-ink/40" />
            </label>
            <label className="text-[12px] font-semibold text-ink">Início
              <input type="date" value={editando.dataInicio} onChange={(e) => setEditando({ ...editando, dataInicio: e.target.value })} className="mt-1 w-full rounded-md border border-line bg-white px-2 py-1.5 text-[13px] text-ink outline-none focus:border-ink/40" />
            </label>
            <label className="text-[12px] font-semibold text-ink">Fim (opcional)
              <input type="date" value={editando.dataFim} onChange={(e) => setEditando({ ...editando, dataFim: e.target.value })} className="mt-1 w-full rounded-md border border-line bg-white px-2 py-1.5 text-[13px] text-ink outline-none focus:border-ink/40" />
            </label>
            <label className="flex items-center gap-2 text-[12px] font-semibold text-ink">
              <input type="checkbox" checked={editando.ativo} onChange={(e) => setEditando({ ...editando, ativo: e.target.checked })} className="accent-ink" /> Ativo
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditando(null)} className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-semibold text-muted hover:bg-paper">Cancelar</button>
            <button onClick={salvar} className="rounded-lg bg-ink px-4 py-1.5 text-[12px] font-bold text-white hover:brightness-125">Salvar</button>
          </div>
        </div>
      ) : (
        <div className="mt-3 max-h-[46vh] overflow-y-auto rounded-lg border border-line">
          <table className="w-full text-left text-[12px]">
            <thead className="sticky top-0 bg-paper">
              <tr className="text-[11px] uppercase tracking-wide text-muted">
                <th className="px-3 py-2 font-semibold">Nome</th>
                <th className="px-3 py-2 font-semibold">Tipo</th>
                <th className="px-3 py-2 font-semibold">Categoria</th>
                <th className="px-3 py-2 text-right font-semibold">Valor</th>
                <th className="px-3 py-2 text-center font-semibold">Dia</th>
                <th className="px-3 py-2 text-center font-semibold">Ativo</th>
                <th className="px-3 py-2 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {fixos.map((f) => (
                <tr key={f.id} className="border-t border-line/60">
                  <td className="px-3 py-1.5 text-ink">{f.nome}</td>
                  <td className="px-3 py-1.5" style={{ color: f.tipo === 'entrada' ? COR_IN : COR_OUT }}>{f.tipo === 'entrada' ? 'Entrada' : 'Saída'}</td>
                  <td className="px-3 py-1.5 text-muted">{f.categoria || SEM_CAT}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-ink">{reais(f.valor)}</td>
                  <td className="px-3 py-1.5 text-center text-muted">{f.diaMes}</td>
                  <td className="px-3 py-1.5 text-center">{f.ativo ? '✓' : '—'}</td>
                  <td className="px-3 py-1.5 text-right">
                    <button onClick={() => abrirEdicao(f)} className="mr-2 text-[11px] font-semibold text-ink underline hover:opacity-70">editar</button>
                    <button onClick={() => onExcluir(f.id)} className="text-[11px] font-semibold text-red-700 underline hover:opacity-70">excluir</button>
                  </td>
                </tr>
              ))}
              {fixos.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted">Nenhum lançamento fixo cadastrado.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <button onClick={onClose} className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-semibold text-muted hover:bg-paper">Fechar</button>
      </div>
    </Overlay>
  )
}
