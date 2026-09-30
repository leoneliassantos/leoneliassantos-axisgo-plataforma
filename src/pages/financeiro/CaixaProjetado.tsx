import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { supabase, fetchAllRows } from '../../lib/supabase'
import { useAuth } from '../../auth/AuthContext'
import { GuiaUpload } from '../../components/GuiaUpload'
import { GUIA_CAIXA_PROJETADO_BLING } from '../../components/guiasUpload'
import { FiltrosToggle } from '../../components/FiltrosToggle'
import { resolveColor, resolvePalette } from '../../lib/chartPalette'

/* ==================================================================== *
 *  Fluxo de Caixa PROJETADO — MM Company
 *  Portado do módulo da MC (Caixa.tsx), SÓ a parte Projetada, alimentado
 *  pelo export do Bling (abas "Contas a Pagar" e "Contas a Receber").
 *  Tabelas no Supabase da MM: fin_titulos_projetados, fin_lancamentos_fixos,
 *  fin_projetado_categoria_map, fin_config. Leitura: autenticado;
 *  escrita (upload/config): só admin (checado na tela).
 * ==================================================================== */

type Gran = 'dia' | 'semana' | 'mes'

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
function bucket(iso: string, g: Gran): { key: string; label: string } {
  const [y, mo, d] = iso.split('-').map(Number)
  if (g === 'mes') return { key: `${y}-${pad2(mo)}`, label: `${MESES[mo - 1]}/${String(y).slice(2)}` }
  if (g === 'dia') return { key: iso, label: `${pad2(d)}/${pad2(mo)}` }
  const dt = new Date(y, mo - 1, d)
  const dow = (dt.getDay() + 6) % 7
  const st = new Date(y, mo - 1, d - dow)
  return { key: `${st.getFullYear()}-${pad2(st.getMonth() + 1)}-${pad2(st.getDate())}`, label: `${pad2(st.getDate())}/${pad2(st.getMonth() + 1)}` }
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


/* ---------------- leitor da planilha do Bling (MM Company) ----------------
 * Duas abas: "Contas a Pagar" (saídas) e "Contas a Receber" (entradas).
 * Colunas: Fornecedor/Cliente · Histórico · [Forma de pagamento] · Nro.
 * documento · Vencimento · Situação · Saldo. Cada aba é classificada pelo
 * cabeçalho (tem "Fornecedor" = saída; tem "Cliente" = entrada). */
async function parseProjetadoFile(file: File): Promise<TituloProjRaw[]> {
  const XLSX = await import('xlsx')
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true })

  const idx = (hs: string[], pred: (h: string) => boolean) => hs.findIndex(pred)
  const has = (...t: string[]) => (h: string) => t.every((x) => h.includes(x))
  const out: TituloProjRaw[] = []

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: '' })
    if (!aoa.length) continue

    let hi = -1
    let col: Record<string, number> = {}
    let tipo: 'entrada' | 'saida' = 'saida'
    for (let i = 0; i < Math.min(aoa.length, 15); i++) {
      const hs = (aoa[i] as unknown[]).map(normHeader)
      const iForn = idx(hs, (h) => h.includes('FORNECEDOR'))
      const iCli = idx(hs, (h) => h.includes('CLIENTE'))
      const iVenc = idx(hs, has('VENC'))
      const iSaldo = idx(hs, (h) => h.includes('SALDO') || h === 'VALOR')
      if (iVenc >= 0 && iSaldo >= 0 && (iForn >= 0 || iCli >= 0)) {
        hi = i
        tipo = iForn >= 0 ? 'saida' : 'entrada'
        col = {
          participante: iForn >= 0 ? iForn : iCli,
          historico: idx(hs, (h) => h.includes('HIST')),
          forma: idx(hs, has('FORMA')),
          documento: idx(hs, (h) => h.includes('DOCUMENTO')),
          vencimento: iVenc,
          situacao: idx(hs, (h) => h.includes('SITUA')),
          saldo: iSaldo,
        }
        break
      }
    }
    if (hi < 0) continue

    const get = (row: unknown[], i: number) => (i >= 0 ? row[i] : '')
    const num = (row: unknown[], i: number) => { const c = get(row, i); return typeof c === 'number' ? c : parseBR(c as string) }
    const origem = tipo === 'saida' ? 'Contas a Pagar' : 'Contas a Receber'
    for (let r = hi + 1; r < aoa.length; r++) {
      const row = aoa[r] as unknown[]
      if (!row) continue
      const participante = (get(row, col.participante) ?? '').toString().trim()
      const vencimento = toISO(get(row, col.vencimento))
      const valor = num(row, col.saldo)
      if (!participante || !vencimento) continue
      out.push({
        origem,
        numero: (get(row, col.documento) ?? '').toString().trim(),
        item: (get(row, col.historico) ?? '').toString().trim(),
        tipo,
        docTipo: (get(row, col.forma) ?? '').toString().trim(),
        movimento: '',
        vencimento,
        participante,
        valor,
        jurosMulta: 0,
        situacaoOrigem: (get(row, col.situacao) ?? '').toString().trim(),
      })
    }
  }
  if (!out.length) throw new Error('nenhum título válido encontrado. Confira se o arquivo tem as abas "Contas a Pagar" e "Contas a Receber" do Bling (colunas Fornecedor/Cliente, Vencimento e Saldo).')
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

/* ============================ FLUXO tradicional ============================ */
const HDR = '#f1f0ec', WHITE = '#ffffff', BG_IN = '#e9f7ef', BG_OUT = '#fdecec', BG_SLD = '#eef1f6'
function ValCell({ v, bold, color, onClick }: { v: number; bold?: boolean; color?: string; onClick?: () => void }) {
  // NaN = célula não aplicável (ex.: saldo na coluna "Atrasado", que é isolada) → mostra "—".
  if (Number.isNaN(v)) return <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums" style={{ color: '#c3c0bb' }} title="A coluna Atrasado é só para visualizar os vencidos; não entra no saldo.">—</td>
  const zerado = Math.abs(v) < 0.005
  const clicavel = !!onClick && !zerado
  return (
    <td
      className={`whitespace-nowrap px-4 py-2 text-right tabular-nums ${clicavel ? 'cursor-pointer underline decoration-dotted decoration-line underline-offset-2 hover:bg-paper hover:decoration-ink' : ''}`}
      style={{ fontWeight: bold ? 700 : 400, color: zerado ? '#c3c0bb' : color }}
      onClick={clicavel ? onClick : undefined}
      title={clicavel ? 'Clique para ver a composição deste valor' : undefined}
    >{`R$ ${fmt2(v)}`}</td>
  )
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

type ViewProj = 'fluxo' | 'indicadores' | 'titulos'

function ProjetadoView() {
  const { user, mode } = useAuth()
  const isAdmin = user?.role === 'admin'
  const hoje = useMemo(() => hojeISO(), [])
  const horizontePadrao = useMemo(() => addMesesISO(hoje, 6), [hoje])

  const [rows, setRows] = useState<TituloProj[]>([])
  const [fixos, setFixos] = useState<LancamentoFixo[]>([])
  const [catMap, setCatMap] = useState<Record<string, string>>({})
  const [aberturaValor, setAberturaValor] = useState(0)
  const [aberturaData, setAberturaData] = useState('')
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
  const [comp, setComp] = useState<CompProj | null>(null)

  useEffect(() => { setDe((prev) => prev || hoje) }, [hoje])
  useEffect(() => { setAte((prev) => prev || horizontePadrao) }, [horizontePadrao])
  useEffect(() => { setAberturaData((prev) => prev || hoje) }, [hoje])

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

    const rcfg = await supabase.from('fin_config').select('chave, valor').in('chave', ['projetado_abertura_valor', 'projetado_abertura_data'])
    if (!rcfg.error && rcfg.data) for (const c of rcfg.data as { chave: string; valor: string }[]) {
      // Ler com Number() (formato JS gravado por String(number)); parseBR aqui tratava
      // o ponto decimal como separador de milhar e multiplicava o saldo a cada recarga.
      if (c.chave === 'projetado_abertura_valor') setAberturaValor(Number(c.valor) || 0)
      if (c.chave === 'projetado_abertura_data' && c.valor) setAberturaData((c.valor ?? '').slice(0, 10))
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
    // Data de abertura = referência do saldo inicial. O que vence ANTES dela e não foi
    // pago fica em "Atrasado" (só visual, isolado do saldo). A projeção corre dela em diante.
    const abertura = aberturaData || hoje
    const deFiltro = de || abertura
    type Ev = { date: string; valor: number; tipo: 'entrada' | 'saida'; canal: string; quem: string; categoria: string; atrasado: boolean; numero: string; item: string; fonte: 'titulo' | 'fixo' }
    const eventos: Ev[] = []
    for (const r of rows) {
      if (!origemOk(r.origem)) continue
      eventos.push({
        date: r.vencimento, valor: r.valor, tipo: r.tipo, canal: r.origem, quem: r.participante || '(sem nome)',
        categoria: r.tipo === 'saida' ? (r.categoria || SEM_CAT) : '', atrasado: r.vencimento < abertura,
        numero: r.numero || '', item: r.item || '', fonte: 'titulo',
      })
    }
    if (origemOk('Lançamentos fixos')) {
      for (const f of fixos) {
        if (!f.ativo) continue
        for (const date of ocorrenciasFixo(f, hoje, horizonte)) {
          eventos.push({ date, valor: f.valor, tipo: f.tipo, canal: 'Lançamentos fixos', quem: f.nome, categoria: f.tipo === 'saida' ? (f.categoria || SEM_CAT) : '', atrasado: date < abertura, numero: '', item: '', fonte: 'fixo' })
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
    // O saldo corrente parte do saldo de abertura e corre SÓ pelas colunas cronológicas
    // (de hoje/abertura em diante). A coluna "Atrasado" mostra os vencidos mas fica
    // ISOLADA do saldo (saldoInicial/Final = NaN → célula mostra "—"), como pedido.
    let prev = aberturaValor
    for (const c of cols) {
      const te = entradaRows.reduce((s, r) => s + r.vals[c.key], 0)
      const ts = despesaRows.reduce((s, r) => s + r.vals[c.key], 0)
      totalEntradas[c.key] = te; totalSaidas[c.key] = ts; fluxoOp[c.key] = te - ts
      if (c.key === '__atrasado__') { saldoInicial[c.key] = NaN; saldoFinal[c.key] = NaN; continue }
      saldoInicial[c.key] = prev; saldoFinal[c.key] = prev + te - ts; prev = saldoFinal[c.key]
    }
    // Lista detalhada dos lançamentos (com a coluna a que cada um pertence) — usada para
    // abrir a "composição" ao clicar numa célula de valor na matriz.
    const eventosDet = dentro.map((e) => ({ colKey: bucketKey(e), tipo: e.tipo, canal: e.canal, categoria: e.categoria || SEM_CAT, quem: e.quem, date: e.date, valor: e.valor, numero: e.numero, item: e.item, fonte: e.fonte }))
    return { cols, entradaRows, despesaRows, totalEntradas, totalSaidas, fluxoOp, saldoInicial, saldoFinal, eventos: eventosDet }
  }, [rows, fixos, de, ate, horizontePadrao, gran, origemOk, selCat, aberturaValor, aberturaData, hoje])

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
        // Substitui TODA a base: apaga o que existe e insere o arquivo novo.
        const { error: eDel } = await supabase.from('fin_titulos_projetados').delete().not('id', 'is', null)
        if (eDel) throw new Error(eDel.message)
        if (payload.length) {
          const { error } = await supabase.from('fin_titulos_projetados').insert(payload)
          if (error) throw new Error(error.message)
        }
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

  async function salvarAbertura(data: string, valor: number) {
    const d = data || hoje
    if (mode === 'supabase' && supabase) {
      const { error } = await supabase.from('fin_config').upsert([
        { chave: 'projetado_abertura_valor', valor: String(valor) },
        { chave: 'projetado_abertura_data', valor: d },
      ], { onConflict: 'chave' })
      if (error) { setErro(`Não consegui salvar o saldo de abertura: ${error.message}`); return }
    }
    setAberturaValor(valor); setAberturaData(d); setEditAbertura(false)
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
          <Toggle valor={view} set={setView} ops={[['fluxo', 'Fluxo Projetado'], ['indicadores', 'Indicadores'], ['titulos', 'Títulos']]} />
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
                <button onClick={() => fileRef.current?.click()} disabled={busy} className="rounded-lg bg-ink px-3 py-2 text-[12px] font-bold text-white shadow-brand transition hover:brightness-125 disabled:opacity-50" title="Enviar o Excel do Bling (abas Contas a Pagar e a Receber, em aberto). Substitui toda a base projetada.">
                  {busy ? 'Processando…' : 'Atualizar base'}
                </button>
              )}
              {isAdmin && (
                <GuiaUpload compact {...GUIA_CAIXA_PROJETADO_BLING} />
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
          <p className="font-serif text-lg text-ink">O fluxo projetado ainda não foi carregado.</p>
          <p className="max-w-md text-sm text-muted">
            {isAdmin
              ? 'Clique em "Atualizar base" e envie o Excel do Bling (abas Contas a Pagar e a Receber), ou cadastre Lançamentos fixos.'
              : 'Assim que um administrador enviar a base ou cadastrar lançamentos fixos, a projeção aparecerá aqui.'}
          </p>
        </div>
      ) : view === 'fluxo' ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi lbl="Atrasado a receber" valor={reais(kpis.atrasadoRec)} cor={COR_IN} tip="Títulos ou lançamentos fixos vencidos antes da data do saldo de abertura, ainda não recebidos. Ficam isolados, não entram no saldo." />
            <Kpi lbl="Atrasado a pagar" valor={reais(kpis.atrasadoPag)} cor={COR_OUT} tip="Títulos ou lançamentos fixos vencidos antes da data do saldo de abertura, ainda não pagos. Ficam isolados, não entram no saldo." />
            <Kpi lbl="A receber (até o horizonte)" valor={reais(kpis.futEntradas)} cor={COR_IN} tip="Soma de entradas projetadas da data do saldo de abertura até o horizonte (não inclui o Atrasado)." />
            <Kpi lbl="A pagar (até o horizonte)" valor={reais(kpis.futSaidas)} cor={COR_OUT} tip="Soma de saídas projetadas da data do saldo de abertura até o horizonte (não inclui o Atrasado)." />
          </div>
          <FluxoViewProjetado f={fluxo} abertura={aberturaData || hoje} onAbrir={setComp} />
        </>
      ) : view === 'indicadores' ? (
        <IndicadoresProjetado f={fluxo} abertura={aberturaData || hoje} />
      ) : (
        <TitulosViewProjetado rows={titulosFiltrados} hoje={hoje} categorias={categorias} selCat={selCat} setSelCat={setSelCat} />
      )}

      {editAbertura && <ModalAberturaProjetado data={aberturaData || hoje} valor={aberturaValor} onSalvar={salvarAbertura} onClose={() => setEditAbertura(false)} />}
      {editCat && <ModalCategoriasProjetado rows={rows} catMap={catMap} categorias={categorias.filter((c) => c !== SEM_CAT)} onSalvar={salvarCategorias} onClose={() => setEditCat(false)} />}
      {editFixos && <ModalLancamentosFixos fixos={fixos} categorias={categorias.filter((c) => c !== SEM_CAT)} onSalvar={salvarFixo} onExcluir={excluirFixo} onClose={() => setEditFixos(false)} />}
      {comp && <ModalComposicao comp={comp} onClose={() => setComp(null)} />}
    </div>
  )
}


/* ============================ FLUXO Projetado (matriz) ============================ */
type EvDet = { colKey: string; tipo: 'entrada' | 'saida'; canal: string; categoria: string; quem: string; date: string; valor: number; numero: string; item: string; fonte: 'titulo' | 'fixo' }
type CompProj = { titulo: string; sub: string; total: number; itens: { nome: string; data: string; valor: number; canal: string; numero: string; fonte: string }[] }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function FluxoViewProjetado({ f, abertura, onAbrir }: { f: any; abertura: string; onAbrir: (c: CompProj) => void }) {
  const [aberto, setAberto] = useState<Set<string>>(new Set())
  const cols = f.cols as { key: string; label: string }[]
  const toggle = (c: string) => setAberto((p) => { const n = new Set(p); n.has(c) ? n.delete(c) : n.add(c); return n })
  const entradaRows = f.entradaRows as { nome: string; vals: Record<string, number>; total: number }[]
  const despesaRows = f.despesaRows as { nome: string; vals: Record<string, number>; total: number; fornecedores: { nome: string; vals: Record<string, number>; total: number }[] }[]

  // Abre a composição de uma célula: filtra os lançamentos daquela linha (entrada/canal,
  // categoria ou fornecedor) naquela coluna (período) e envia para o modal.
  const abrir = (filtro: (e: EvDet) => boolean, titulo: string, colLabel: string) => {
    const itens = (f.eventos as EvDet[]).filter(filtro)
      .map((e) => ({ nome: e.quem, data: e.date, valor: e.valor, canal: e.canal, numero: e.numero, fonte: e.fonte }))
      .sort((a, b) => a.data.localeCompare(b.data) || b.valor - a.valor)
    onAbrir({ titulo, sub: colLabel, itens, total: itens.reduce((s, i) => s + i.valor, 0) })
  }

  if (!cols.length) return <div className="rounded-xl border border-line bg-surface p-12 text-center text-muted">Nenhum título em aberto ou lançamento fixo dentro do horizonte selecionado.</div>

  return (
    <div className="rounded-xl border border-line bg-surface shadow-card">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-line px-4 py-2 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: '#fef3c7', border: '1px solid #fcd34d' }} /><b style={{ color: '#92400e' }}>Atrasado</b> — vencido antes de {br(abertura)}, ainda não pago/recebido. Só para visualizar; não entra no saldo.</span>
        <span className="inline-flex items-center gap-1.5">Saldo inicial em <b className="text-ink">{br(abertura)}</b>.</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: '#fff', border: '1px solid #d9cfc4' }} /><b className="text-ink">Demais colunas</b> — projeção pelo vencimento (títulos em aberto + lançamentos fixos).</span>
      </div>
      <div className="overflow-x-auto">
      <table className="w-auto border-collapse text-[12.5px]">
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
              {cols.map((c) => <ValCell key={c.key} v={r.vals[c.key]} color={COR_IN} onClick={() => abrir((e) => e.tipo === 'entrada' && e.canal === r.nome && e.colKey === c.key, `Entradas · ${r.nome}`, c.label)} />)}
            </LinhaFluxo>
          ))}
          <LinhaFluxo label="Total de Entradas" bold bg={BG_IN}>
            {cols.map((c) => <ValCell key={c.key} v={f.totalEntradas[c.key]} bold color={COR_IN} />)}
          </LinhaFluxo>

          {despesaRows.map((r) => (
            <Fragment key={r.nome}>
              <LinhaFluxo label={`(-) ${r.nome}`} indent={1} chevron={r.fornecedores.length > 0} open={aberto.has(r.nome)} onToggle={() => toggle(r.nome)}>
                {cols.map((c) => <ValCell key={c.key} v={r.vals[c.key]} color={COR_OUT} onClick={() => abrir((e) => e.tipo === 'saida' && e.categoria === r.nome && e.colKey === c.key, r.nome, c.label)} />)}
              </LinhaFluxo>
              {aberto.has(r.nome) && r.fornecedores.map((fo, i) => (
                <LinhaFluxo key={i} label={fo.nome.length > 42 ? `${fo.nome.slice(0, 42)}…` : fo.nome} indent={2} sub>
                  {cols.map((c) => <ValCell key={c.key} v={fo.vals[c.key]} onClick={() => abrir((e) => e.tipo === 'saida' && e.categoria === r.nome && e.quem === fo.nome && e.colKey === c.key, `${r.nome} · ${fo.nome}`, c.label)} />)}
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

function ModalComposicao({ comp, onClose }: { comp: CompProj; onClose: () => void }) {
  return (
    <Overlay onClose={onClose} wide>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-bold text-ink">{comp.titulo}</h3>
          <p className="mt-0.5 text-[12px] text-muted">Composição em <b className="text-ink">{comp.sub}</b> · {comp.itens.length} lançamento{comp.itens.length === 1 ? '' : 's'}</p>
        </div>
        <button onClick={onClose} className="text-muted transition hover:text-ink" aria-label="Fechar">✕</button>
      </div>
      {comp.itens.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">Sem lançamentos nesta célula.</p>
      ) : (
        <div className="mt-3 max-h-[62vh] overflow-auto rounded-lg border border-line">
          <table className="min-w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="sticky top-0 bg-paper text-[11px] uppercase tracking-wide text-muted">
                <th className="px-3 py-2 text-left font-bold">Participante</th>
                <th className="px-3 py-2 text-left font-bold">Vencimento</th>
                <th className="px-3 py-2 text-left font-bold">Canal</th>
                <th className="px-3 py-2 text-left font-bold">Nº doc.</th>
                <th className="px-3 py-2 text-right font-bold">Valor</th>
              </tr>
            </thead>
            <tbody>
              {comp.itens.map((it, i) => (
                <tr key={i} className="border-t border-line hover:bg-paper/60">
                  <td className="px-3 py-1.5 text-ink">{it.nome}{it.fonte === 'fixo' && <span className="ml-1 rounded bg-paper px-1 text-[10px] text-muted">fixo</span>}</td>
                  <td className="px-3 py-1.5 text-muted">{br(it.data)}</td>
                  <td className="px-3 py-1.5 text-muted">{it.canal}</td>
                  <td className="px-3 py-1.5 text-muted">{it.numero || '—'}</td>
                  <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-ink">{`R$ ${fmt2(it.valor)}`}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-line bg-paper font-bold text-ink">
                <td className="px-3 py-2" colSpan={4}>Total</td>
                <td className="px-3 py-2 text-right tabular-nums">{`R$ ${fmt2(comp.total)}`}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Overlay>
  )
}

/* ============================ INDICADORES Projetado (painel de gráficos) ============================ */
function IndicadoresProjetado({ f }: { f: any; abertura: string }) {
  const cols = f.cols as { key: string; label: string }[]
  const futCols = useMemo(() => cols.filter((c) => c.key !== '__atrasado__'), [cols])
  const serie = useMemo(() => futCols.map((c) => ({
    label: c.label, ent: f.totalEntradas[c.key] || 0, sai: f.totalSaidas[c.key] || 0, saldo: f.saldoFinal[c.key] || 0,
  })), [futCols, f])
  const despesas = useMemo(() => (f.despesaRows as { nome: string; vals: Record<string, number> }[])
    .map((r) => ({ nome: r.nome, valor: futCols.reduce((s, c) => s + (r.vals[c.key] || 0), 0) }))
    .filter((x) => x.valor > 0.005)
    .sort((a, b) => b.valor - a.valor), [f, futCols])

  const totEnt = useMemo(() => serie.reduce((s, p) => s + p.ent, 0), [serie])
  const totSai = useMemo(() => serie.reduce((s, p) => s + p.sai, 0), [serie])
  const saldoFim = serie.length ? serie[serie.length - 1].saldo : 0
  const menorSaldo = serie.length ? Math.min(...serie.map((p) => p.saldo)) : 0

  // Layout "Power BI": ocupa a altura da tela (sem rolagem). Mede o topo do painel e
  // fixa a altura = janela − topo. Recalcula a cada render (acompanha recolher filtros) e no resize.
  const wrapRef = useRef<HTMLDivElement>(null)
  const [altura, setAltura] = useState<number | undefined>(undefined)
  const calcAltura = useCallback(() => {
    const el = wrapRef.current; if (!el) return
    const top = el.getBoundingClientRect().top
    setAltura(Math.max(340, Math.min(window.innerHeight - top - 14, window.innerHeight)))
  }, [])
  useLayoutEffect(() => { calcAltura() })
  useEffect(() => { window.addEventListener('resize', calcAltura); return () => window.removeEventListener('resize', calcAltura) }, [calcAltura])

  if (!serie.length) return <div className="rounded-xl border border-line bg-surface p-12 text-center text-muted">Sem projeção no período selecionado. Ajuste o período/horizonte ou cadastre lançamentos.</div>

  return (
    <div ref={wrapRef} style={{ height: altura, overflow: 'hidden' }} className="flex flex-col gap-2">
      <div className="grid flex-none grid-cols-2 gap-2 lg:grid-cols-4">
        <Kpi lbl="Entradas projetadas" valor={reais(totEnt)} cor={COR_IN} tip="Soma das entradas projetadas da data de abertura até o horizonte (não inclui o Atrasado)." />
        <Kpi lbl="Saídas projetadas" valor={reais(totSai)} cor={COR_OUT} tip="Soma das saídas projetadas da data de abertura até o horizonte (não inclui o Atrasado)." />
        <Kpi lbl="Saldo final projetado" valor={reais(saldoFim)} cor={saldoFim >= 0 ? COR_IN : COR_OUT} tip="Saldo de caixa projetado ao fim do horizonte, partindo do saldo de abertura." />
        <Kpi lbl="Menor saldo no período" valor={reais(menorSaldo)} cor={menorSaldo >= 0 ? COR_IN : COR_OUT} tip="Ponto mais baixo da curva de caixa no período — alerta de risco. Negativo indica necessidade de caixa." />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-2 gap-2 lg:grid-cols-3">
        <TileC className="min-h-0 lg:col-span-2" titulo="Entradas × Saídas no tempo" tip="Entradas (verde) e saídas (vermelho) projetadas em cada período, pela granularidade escolhida. O Atrasado não entra.">
          <EntradasSaidasChart serie={serie} />
        </TileC>
        <TileC className="min-h-0 lg:col-span-1 lg:row-span-2" titulo="Concentração de despesas" tip="Participação de cada categoria de despesa projetada no total (rosca). As menores entram em “Outros”.">
          <DonutDespesas itens={despesas} />
        </TileC>
        <TileC className="min-h-0 lg:col-span-2" titulo="Curva do saldo de caixa" tip="Saldo de caixa projetado ao fim de cada período, partindo do saldo de abertura. Abaixo de zero indica falta de caixa.">
          <SaldoCurvaChart serie={serie} />
        </TileC>
      </div>
    </div>
  )
}

function TileC({ titulo, tip, className, children }: { titulo: string; tip: string; className?: string; children: ReactNode }) {
  return (
    <div className={`flex min-h-0 flex-col rounded-xl border border-line bg-surface p-3 shadow-card ${className ?? ''}`}>
      <div className="mb-1 flex flex-none items-center gap-1">
        <h3 className="text-[12px] font-bold text-ink">{titulo}</h3>
        <Info tip={tip} />
      </div>
      <div className="relative min-h-0 flex-1">{children}</div>
    </div>
  )
}

// Mede o próprio quadro (largura e altura reais) para o SVG preencher o tile em
// tamanho 1:1 (fonte nítida), como no padrão robusto do Vendas. Re-mede no 1º frame e no resize.
function useMedido() {
  const ref = useRef<HTMLDivElement>(null)
  const [dim, setDim] = useState({ w: 600, h: 220 })
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return
    const u = () => setDim({ w: Math.max(240, el.clientWidth), h: Math.max(120, el.clientHeight) })
    u()
    const raf = requestAnimationFrame(u)
    const ro = new ResizeObserver(u); ro.observe(el)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [])
  return { ref, dim }
}

function EntradasSaidasChart({ serie }: { serie: { label: string; ent: number; sai: number }[] }) {
  const { ref, dim } = useMedido()
  const { w: W, h: H } = dim
  const PADL = 48, PADR = 12, PADT = 8, PADB = 22
  const n = serie.length
  const max = Math.max(1, ...serie.map((p) => Math.max(p.ent, p.sai)))
  const x = (i: number) => (n <= 1 ? PADL + (W - PADL - PADR) / 2 : PADL + (i * (W - PADL - PADR)) / (n - 1))
  const y = (v: number) => PADT + (1 - v / max) * (H - PADT - PADB)
  const entLine = serie.map((p, i) => `${x(i)},${y(p.ent)}`).join(' ')
  const saiLine = serie.map((p, i) => `${x(i)},${y(p.sai)}`).join(' ')
  const entArea = `${x(0)},${y(0)} ${entLine} ${x(n - 1)},${y(0)}`
  const ticks = 3
  const step = Math.max(1, Math.ceil(n / 8))
  return (
    <div ref={ref} className="relative h-full w-full">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
        {Array.from({ length: ticks + 1 }, (_, i) => {
          const v = (max * i) / ticks
          return (
            <g key={i}>
              <line x1={PADL} x2={W - PADR} y1={y(v)} y2={y(v)} stroke="#ececec" strokeWidth={1} />
              <text x={PADL - 6} y={y(v) + 3} textAnchor="end" fontSize={10} fill="#888">{fmtCompacto(v)}</text>
            </g>
          )
        })}
        <polygon points={entArea} fill={COR_IN} opacity={0.1} />
        <polyline points={entLine} fill="none" stroke={COR_IN} strokeWidth={2.2} strokeLinejoin="round" />
        <polyline points={saiLine} fill="none" stroke={COR_OUT} strokeWidth={2.2} strokeLinejoin="round" />
        {serie.map((p, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(p.ent)} r={2.4} fill={COR_IN}><title>{`${p.label}\nEntradas: ${reais(p.ent)}`}</title></circle>
            <circle cx={x(i)} cy={y(p.sai)} r={2.4} fill={COR_OUT}><title>{`${p.label}\nSaídas: ${reais(p.sai)}`}</title></circle>
            {(i === 0 || i === n - 1 || i % step === 0) && <text x={x(i)} y={H - 6} textAnchor="middle" fontSize={10} fill="#666">{p.label}</text>}
          </g>
        ))}
      </svg>
      <div className="pointer-events-none absolute right-1 top-0 flex gap-3 text-[10px]">
        <span style={{ color: COR_IN }}>● Entradas</span>
        <span style={{ color: COR_OUT }}>● Saídas</span>
      </div>
    </div>
  )
}

function SaldoCurvaChart({ serie }: { serie: { label: string; saldo: number }[] }) {
  const { ref, dim } = useMedido()
  const { w: W, h: H } = dim
  const PADL = 48, PADR = 12, PADT = 8, PADB = 22
  const n = serie.length
  const saldos = serie.map((p) => p.saldo)
  const min = Math.min(0, ...saldos), max = Math.max(0, ...saldos)
  const span = max - min || 1
  const x = (i: number) => (n <= 1 ? PADL + (W - PADL - PADR) / 2 : PADL + (i * (W - PADL - PADR)) / (n - 1))
  const y = (v: number) => PADT + (1 - (v - min) / span) * (H - PADT - PADB)
  const line = serie.map((p, i) => `${x(i)},${y(p.saldo)}`).join(' ')
  const area = `${x(0)},${y(min)} ${line} ${x(n - 1)},${y(min)}`
  const y0 = y(0)
  const ticks = 3
  const step = Math.max(1, Math.ceil(n / 8))
  return (
    <div ref={ref} className="h-full w-full">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
        {Array.from({ length: ticks + 1 }, (_, i) => {
          const v = min + (span * i) / ticks
          return (
            <g key={i}>
              <line x1={PADL} x2={W - PADR} y1={y(v)} y2={y(v)} stroke="#ececec" strokeWidth={1} />
              <text x={PADL - 6} y={y(v) + 3} textAnchor="end" fontSize={10} fill="#888">{fmtCompacto(v)}</text>
            </g>
          )
        })}
        {min < 0 && <line x1={PADL} x2={W - PADR} y1={y0} y2={y0} stroke="#bbb" strokeWidth={1} strokeDasharray="3 3" />}
        <polygon points={area} fill={COR_PROJECAO} opacity={0.1} />
        <polyline points={line} fill="none" stroke={COR_PROJECAO} strokeWidth={2.2} strokeLinejoin="round" />
        {serie.map((p, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(p.saldo)} r={i === 0 ? 3.5 : 2.6} fill={p.saldo < 0 ? COR_OUT : COR_PROJECAO}><title>{`${p.label}\nSaldo: ${reais(p.saldo)}`}</title></circle>
            {(i === 0 || i === n - 1 || i % step === 0) && <text x={x(i)} y={H - 6} textAnchor="middle" fontSize={10} fill="#666">{p.label}</text>}
          </g>
        ))}
      </svg>
    </div>
  )
}

const PAL_DESP = resolvePalette(['#5a6be0', '#16b8a6', '#e5484d', '#e7a13a', '#7a6cf0', '#22a7c4', '#d65b98', '#64748b'])
function DonutDespesas({ itens }: { itens: { nome: string; valor: number }[] }) {
  const total = itens.reduce((s, i) => s + i.valor, 0)
  if (!total) return <p className="grid h-full place-items-center text-sm text-muted">Sem despesas projetadas no período.</p>
  // Top 6 categorias + "Outros" (as menores agrupadas) — rosca legível.
  const top = itens.slice(0, 6)
  const outros = itens.slice(6).reduce((s, i) => s + i.valor, 0)
  const dados = outros > 0.005 ? [...top, { nome: 'Outros', valor: outros }] : top
  const size = 200, cxy = 100, r = 66, sw = 26, C = 2 * Math.PI * r
  let off = 0
  const segs = dados.map((d, i) => {
    const len = (d.valor / total) * C
    const el = (
      <circle key={i} cx={cxy} cy={cxy} r={r} fill="none" stroke={PAL_DESP[i % PAL_DESP.length]} strokeWidth={sw}
        strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off} transform={`rotate(-90 ${cxy} ${cxy})`}>
        <title>{`${d.nome}\n${reais(d.valor)}\n${Math.round((d.valor / total) * 100)}%`}</title>
      </circle>
    )
    off += len
    return el
  })
  return (
    <div className="flex h-full flex-col items-center gap-2">
      <div className="flex-none" style={{ height: 'min(56%, 190px)', aspectRatio: '1 / 1' }}>
        <svg viewBox={`0 0 ${size} ${size}`} width="100%" height="100%">
          {segs}
          <text x={cxy} y={cxy - 3} textAnchor="middle" fontSize={11} fill="#64748B">Despesas</text>
          <text x={cxy} y={cxy + 14} textAnchor="middle" fontSize={15} fontWeight={700} fill={COR_OUT}>{fmtCompacto(total)}</text>
        </svg>
      </div>
      <div className="flex min-h-0 w-full flex-1 flex-col gap-0.5 overflow-auto">
        {dados.map((d, i) => (
          <div key={i} className="flex items-center gap-1.5 text-[11px]">
            <span className="inline-block h-2.5 w-2.5 flex-none rounded-sm" style={{ background: PAL_DESP[i % PAL_DESP.length] }} />
            <span className="min-w-0 flex-1 truncate text-ink" title={d.nome}>{d.nome}</span>
            <span className="flex-none font-semibold tabular-nums text-ink">{reais(d.valor)}</span>
            <span className="flex-none w-9 text-right tabular-nums text-muted">{Math.round((d.valor / total) * 100)}%</span>
          </div>
        ))}
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
function ModalAberturaProjetado({ data, valor, onSalvar, onClose }: { data: string; valor: number; onSalvar: (d: string, v: number) => void; onClose: () => void }) {
  const [d, setD] = useState(data)
  const [v, setV] = useState(valor ? fmt2(valor) : '')
  return (
    <Overlay onClose={onClose}>
      <h3 className="text-[15px] font-bold text-ink">Saldo de abertura (Projetado)</h3>
      <p className="mt-1 text-[12px] text-muted">Ponto de partida da projeção — normalmente o seu saldo de caixa na data informada. A projeção corre desta data em diante; o que venceu antes dela fica na coluna “Atrasado”, só para visualizar, sem entrar no saldo. Independente do Realizado.</p>
      <label className="mt-4 block text-[12px] font-semibold text-ink">Data do saldo
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

/* ------- entrada do módulo (registrada no registry como caixa-projetado) ------- */
export function CaixaProjetado() {
  return <ProjetadoView />
}
