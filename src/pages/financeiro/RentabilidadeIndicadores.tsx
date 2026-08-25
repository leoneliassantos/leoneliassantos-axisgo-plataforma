import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { supabase, fetchAllRows } from '../../lib/supabase'
import { useAuth } from '../../auth/AuthContext'
import {
  buildIndicadoresMargem, TAXA_GANHO_TRIB_PADRAO,
  type MargemJob, type FatiaMargem,
} from './margemJob'

/* ================================================================== *
 *  Rentabilidade de Projetos — Indicadores · painel estilo Power BI
 *  Mesmo padrão dos demais (Faturamento/Fluxo): altura medida que
 *  preenche a tela sem rolagem — filtros + KPIs (flex-none) e um grid
 *  de tiles (flex-1). Cada tile abre um modal com a tabela + Excel.
 *  Filtros: empresa · período (de/até) · cliente · unidade de negócio.
 *  Lê a MESMA base (margem_job) da Lista; margens respeitam a receita
 *  editável e a taxa do ganho tributário.
 * ================================================================== */

const CONSOLIDADO = '__consolidado__'
const GRAD_KPI = 'linear-gradient(180deg, #FE9F2E 0%, #FB5403 55%, #F5390A 100%)'
const PAL = ['#F5390A', '#FB5403', '#FD7E14', '#FE9F2E', '#FFBF4D', '#FFD466', '#FFE38C']
const COR_FAT = '#FB5403'
const COR_REC = '#2F4A73'
const COR_TOTAL = '#B0451F'
const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

const fmt0 = (v: number) => Math.round(v).toLocaleString('pt-BR')
const fmtBRL = (v: number) => `R$ ${fmt0(v)}`
const fmtCompacto = (v: number) => {
  const a = Math.abs(v)
  if (a >= 1e6) return `${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}M`
  if (a >= 1e3) return `${(v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}k`
  return fmt0(v)
}
const pct1 = (f: number) => `${(f * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const mesLabel = (ym: string) => {
  const [y, m] = ym.split('-')
  return `${MESES_ABREV[Number(m) - 1]}/${y.slice(2)}`
}
function mesesEntre(a: string, b: string): string[] {
  if (!a || !b) return []
  const out: string[] = []
  let [y, m] = a.split('-').map(Number)
  const [ey, em] = b.split('-').map(Number)
  let guard = 0
  while ((y < ey || (y === ey && m <= em)) && guard++ < 600) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m++; if (m > 12) { m = 1; y++ }
  }
  return out
}

type DbRow = {
  id?: number; empresa: string; cliente: string; data: string | null; competencia: string | null
  unidade_negocio: string | null; campanha: string | null
  valor_faturado: number; custo_total: number; encargos: number; receita: number | null
}
const fromDb = (r: DbRow): MargemJob => ({
  id: r.id, empresa: r.empresa ?? '', cliente: r.cliente ?? '', data: r.data ?? null,
  competencia: r.competencia ?? '', pit: '', ec: '', unidadeNegocio: r.unidade_negocio ?? '',
  campanha: r.campanha ?? '', valorFaturado: Number(r.valor_faturado) || 0,
  custoTotal: Number(r.custo_total) || 0, encargos: Number(r.encargos) || 0,
  receita: r.receita == null ? null : Number(r.receita),
})

interface SerieLocal { mes: string; label: string; faturado: number; receita: number; qtd: number }

export function RentabilidadeIndicadores() {
  const { mode } = useAuth()
  const demo = mode !== 'supabase'

  const [jobs, setJobs] = useState<MargemJob[]>([])
  const [taxa, setTaxa] = useState(TAXA_GANHO_TRIB_PADRAO)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [empresaSel, setEmpresaSel] = useState<string>(CONSOLIDADO)
  const [deSel, setDeSel] = useState('')
  const [ateSel, setAteSel] = useState('')
  const [selCli, setSelCli] = useState<Set<string> | null>(null)
  const [selUni, setSelUni] = useState<Set<string> | null>(null)
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null)

  // altura disponível (cabe 100% na tela, sem scroll)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [altura, setAltura] = useState<number | undefined>(undefined)
  useLayoutEffect(() => {
    function calc() {
      const el = wrapRef.current
      if (!el) return
      const top = el.getBoundingClientRect().top
      setAltura(Math.max(430, window.innerHeight - top - 24))
    }
    calc()
    window.addEventListener('resize', calc)
    return () => window.removeEventListener('resize', calc)
  }, [loading, erro])

  const carregar = useCallback(async () => {
    setLoading(true); setErro(null)
    if (demo || !supabase) { setLoading(false); return }
    const [{ data, error }, cfg] = await Promise.all([
      fetchAllRows<DbRow>((from, to) =>
        supabase!.from('margem_job')
          .select('id, empresa, cliente, data, competencia, unidade_negocio, campanha, valor_faturado, custo_total, encargos, receita')
          .order('data', { ascending: true }).range(from, to)),
      supabase!.from('margem_config').select('taxa_ganho_trib').eq('id', 1).maybeSingle(),
    ])
    if (error) { setErro('Não foi possível carregar a base.'); setLoading(false); return }
    setJobs((data ?? []).map(fromDb))
    if (cfg.data?.taxa_ganho_trib != null) setTaxa(Number(cfg.data.taxa_ganho_trib))
    setLoading(false)
  }, [demo])
  useEffect(() => { carregar() }, [carregar])

  /* ---------- derivações ---------- */
  const empresas = useMemo(() => [...new Set(jobs.map((j) => j.empresa))].filter(Boolean).sort(), [jobs])
  const jobsEmp = useMemo(() => empresaSel === CONSOLIDADO ? jobs : jobs.filter((j) => j.empresa === empresaSel), [jobs, empresaSel])
  const mesesAll = useMemo(() => [...new Set(jobsEmp.map((j) => (j.data ?? '').slice(0, 7)))].filter(Boolean).sort(), [jobsEmp])

  const deEff = mesesAll.includes(deSel) ? deSel : mesesAll[0] ?? ''
  const ateEff0 = mesesAll.includes(ateSel) ? ateSel : mesesAll[mesesAll.length - 1] ?? ''
  const de = deEff && ateEff0 && deEff <= ateEff0 ? deEff : (ateEff0 || deEff)
  const ate = deEff && ateEff0 && deEff <= ateEff0 ? ateEff0 : (deEff || ateEff0)

  const clientes = useMemo(() => [...new Set(jobsEmp.map((j) => j.cliente))].filter(Boolean).sort(), [jobsEmp])
  const unidades = useMemo(() => [...new Set(jobsEmp.map((j) => j.unidadeNegocio))].filter(Boolean).sort(), [jobsEmp])

  const filtrados = useMemo(() => {
    const cliOk = (c: string) => selCli === null || selCli.has(c)
    const uniOk = (u: string) => selUni === null || selUni.has(u)
    return jobsEmp.filter((j) => {
      const ym = (j.data ?? '').slice(0, 7)
      if (de && ym && ym < de) return false
      if (ate && ym && ym > ate) return false
      if (!cliOk(j.cliente)) return false
      if (!uniOk(j.unidadeNegocio)) return false
      return true
    })
  }, [jobsEmp, de, ate, selCli, selUni])

  const ind = useMemo(() => buildIndicadoresMargem(filtrados, taxa), [filtrados, taxa])

  // série mensal contínua (preenche meses vazios com zero)
  const serie = useMemo<SerieLocal[]>(() => {
    const map = new Map<string, { faturado: number; receita: number; qtd: number }>()
    for (const j of filtrados) {
      const ym = (j.data ?? '').slice(0, 7)
      if (!ym) continue
      const receita = j.receita != null ? j.receita : j.valorFaturado - j.custoTotal
      const s = map.get(ym) ?? { faturado: 0, receita: 0, qtd: 0 }
      s.faturado += j.valorFaturado; s.receita += receita; s.qtd += 1; map.set(ym, s)
    }
    return mesesEntre(de, ate).map((ym) => ({
      mes: ym, label: mesLabel(ym),
      faturado: map.get(ym)?.faturado ?? 0, receita: map.get(ym)?.receita ?? 0, qtd: map.get(ym)?.qtd ?? 0,
    }))
  }, [filtrados, de, ate])

  const donutCli = useMemo<FatiaMargem[]>(() => {
    const top = ind.porCliente.slice(0, 6)
    const resto = ind.porCliente.slice(6)
    const head = [...top]
    if (resto.length) head.push({
      nome: `Outros (${resto.length})`, faturado: resto.reduce((s, f) => s + f.faturado, 0), custo: 0,
      receita: resto.reduce((s, f) => s + f.receita, 0), encargos: 0, ganhoTrib: 0, margemEncargos: 0,
      qtd: resto.reduce((s, f) => s + f.qtd, 0), margem1: 0, margem2: 0,
      participacao: ind.totalReceita ? resto.reduce((s, f) => s + f.receita, 0) / ind.totalReceita : 0,
    })
    return head
  }, [ind.porCliente, ind.totalReceita])

  const vazio = jobs.length === 0
  const temFiltro = selCli !== null || selUni !== null || (mesesAll.length > 0 && (de !== mesesAll[0] || ate !== mesesAll[mesesAll.length - 1]))

  /* ---------- modais de detalhe ---------- */
  const detClientes = (): Detalhe => {
    const linhas: (string | number)[][] = ind.porCliente.map((c) => [c.nome, c.qtd, Math.round(c.faturado), Math.round(c.receita), Math.round(c.margem1 * 100), Math.round(c.participacao * 100)])
    if (ind.porCliente.length) linhas.push(['TOTAL', ind.qtd, Math.round(ind.totalFaturado), Math.round(ind.totalReceita), Math.round(ind.margem1 * 100), 100])
    return { titulo: `Rentabilidade por cliente (${ind.porCliente.length})`, arquivo: 'Rentabilidade por cliente.xlsx', colunas: [{ label: 'Cliente', tipo: 'texto' }, { label: 'Jobs', tipo: 'num' }, { label: 'Faturado (R$)', tipo: 'num' }, { label: 'Receita (R$)', tipo: 'num' }, { label: 'Margem', tipo: 'pct' }, { label: '% receita', tipo: 'pct' }], linhas }
  }
  const detUnidade = (): Detalhe => {
    const linhas: (string | number)[][] = ind.porUnidade.map((u) => [u.nome, u.qtd, Math.round(u.faturado), Math.round(u.receita), Math.round(u.margem1 * 100), ind.totalReceita ? Math.round((u.receita / ind.totalReceita) * 100) : 0])
    if (ind.porUnidade.length) linhas.push(['TOTAL', ind.qtd, Math.round(ind.totalFaturado), Math.round(ind.totalReceita), Math.round(ind.margem1 * 100), 100])
    return { titulo: 'Rentabilidade por unidade de negócio', arquivo: 'Rentabilidade por unidade.xlsx', colunas: [{ label: 'Unidade', tipo: 'texto' }, { label: 'Jobs', tipo: 'num' }, { label: 'Faturado (R$)', tipo: 'num' }, { label: 'Receita (R$)', tipo: 'num' }, { label: 'Margem', tipo: 'pct' }, { label: '% receita', tipo: 'pct' }], linhas }
  }
  const detEvolucao = (): Detalhe => {
    const linhas: (string | number)[][] = serie.map((s) => [s.label, s.qtd, Math.round(s.faturado), Math.round(s.receita), s.faturado ? Math.round((s.receita / s.faturado) * 100) : 0])
    linhas.push(['TOTAL', ind.qtd, Math.round(ind.totalFaturado), Math.round(ind.totalReceita), ind.totalFaturado ? Math.round(ind.margem1 * 100) : 0])
    return { titulo: 'Evolução mensal (faturado × receita)', arquivo: 'Evolucao rentabilidade.xlsx', colunas: [{ label: 'Mês', tipo: 'texto' }, { label: 'Jobs', tipo: 'num' }, { label: 'Faturado (R$)', tipo: 'num' }, { label: 'Receita (R$)', tipo: 'num' }, { label: 'Margem', tipo: 'pct' }], linhas }
  }

  if (loading) return <div className="grid place-items-center rounded-2xl border border-line bg-surface py-20 text-sm text-muted">Carregando indicadores…</div>
  if (erro) return <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{erro}</div>
  if (vazio)
    return (
      <div className="grid place-items-center gap-2 rounded-2xl border border-dashed border-line bg-surface/60 px-6 py-16 text-center">
        <p className="font-serif text-lg text-ink">Sem dados para exibir.</p>
        <p className="max-w-md text-sm text-muted">Cadastre jobs na aba <b>Lista analítica</b> e os indicadores aparecerão aqui.{demo && ' (modo demonstração)'}</p>
      </div>
    )

  return (
    <div ref={wrapRef} style={{ width: '100%', height: altura, overflow: 'hidden' }} className="rentind flex flex-col gap-2">
      <ScopedStyle />

      {/* Filtros */}
      <div className="flex flex-none flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
        <div className="seg">
          <button className={empresaSel === CONSOLIDADO ? 'on' : ''} onClick={() => setEmpresaSel(CONSOLIDADO)} title="Todas as empresas">Consolidado</button>
          {empresas.map((e) => <button key={e} className={empresaSel === e ? 'on' : ''} onClick={() => setEmpresaSel(e)} title={e}>{e}</button>)}
        </div>
        <div className="flex items-center gap-1.5 text-[12px]">
          <span className="text-muted">De</span>
          <SelectMesYM value={de} meses={mesesAll} onChange={setDeSel} />
          <span className="text-muted">até</span>
          <SelectMesYM value={ate} meses={mesesAll} onChange={setAteSel} />
        </div>
        <MultiSelect label="Cliente" opcoes={clientes} value={selCli} onChange={setSelCli} busca />
        <MultiSelect label="Unidade" opcoes={unidades} value={selUni} onChange={setSelUni} />
        {temFiltro && (
          <button
            className="ml-auto rounded-md border border-line px-2.5 py-1 text-[12px] font-medium text-muted transition hover:bg-paper"
            onClick={() => { setDeSel(''); setAteSel(''); setSelCli(null); setSelUni(null) }}
          >
            Limpar filtros
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid flex-none grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi lbl="Faturado" val={fmtBRL(ind.totalFaturado)} foot={`${ind.qtd} job${ind.qtd === 1 ? '' : 's'}`} />
        <Kpi lbl="Custo /impostos" val={fmtBRL(ind.totalCusto)} foot="total de custos" />
        <Kpi lbl="Receita" val={fmtBRL(ind.totalReceita)} foot="faturado − custo" />
        <Kpi lbl="Margem 1" val={pct1(ind.margem1)} foot="receita ÷ faturado" />
        <Kpi lbl="Ganho tributário" val={fmtBRL(ind.totalGanhoTrib)} foot={`${pct1(taxa)} dos encargos`} />
        <Kpi lbl="Margem 2" val={pct1(ind.margem2)} foot="c/ ganho tributário" />
      </div>

      {/* Grid de gráficos — 2 linhas que preenchem a altura */}
      <div className="grid min-h-0 flex-1 grid-cols-12 grid-rows-2 gap-2">
        <Tile className="col-span-12 lg:col-span-5 lg:row-span-2" titulo="Evolução mensal · faturado × receita" tip="Faturado (área) e receita (linha) por mês. A distância entre as duas é o custo/impostos." onDetalhes={() => setDetalhe(detEvolucao())}>
          <AreaFatReceita serie={serie} />
        </Tile>
        <Tile className="col-span-12 lg:col-span-4" titulo="Receita por unidade (waterfall)" tip="Cada unidade de negócio empilha a sua receita até a receita total do período. A última barra é o Total." onDetalhes={() => setDetalhe(detUnidade())}>
          <WaterfallUnidade itens={ind.porUnidade} total={ind.totalReceita} />
        </Tile>
        <Tile className="col-span-12 lg:col-span-3 lg:row-span-2" titulo="Concentração da receita" tip="Participação de cada cliente na receita. O donut resume os 6 maiores (o resto em “Outros”); veja Detalhes para todos." onDetalhes={() => setDetalhe(detClientes())}>
          <DonutClientes itens={donutCli} total={ind.totalReceita} />
        </Tile>
        <Tile className="col-span-12 lg:col-span-4" titulo="Margem por cliente" tip="Maiores clientes por receita, com a margem 1 de cada um. Detalhes traz a lista completa." onDetalhes={() => setDetalhe(detClientes())}>
          <BarrasCliente itens={ind.porCliente.slice(0, 6)} />
        </Tile>
      </div>

      {detalhe && <ModalDetalhe dados={detalhe} onClose={() => setDetalhe(null)} />}
    </div>
  )
}

/* ============================ filtros ============================ */
function SelectMesYM({ value, meses, onChange }: { value: string; meses: string[]; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-line bg-white px-2 py-1 text-[12px] font-semibold text-ink outline-none focus:border-brand">
      {meses.map((ym) => <option key={ym} value={ym}>{mesLabel(ym)}</option>)}
    </select>
  )
}

function MultiSelect({ label, opcoes, value, onChange, busca }: { label: string; opcoes: string[]; value: Set<string> | null; onChange: (s: Set<string> | null) => void; busca?: boolean }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const isAll = value === null
  const has = (c: string) => isAll || value!.has(c)
  const count = isAll ? opcoes.length : value!.size
  const vis = busca && q.trim() ? opcoes.filter((c) => c.toLowerCase().includes(q.trim().toLowerCase())) : opcoes
  function toggle(c: string) {
    const base = isAll ? new Set(opcoes) : new Set(value!)
    if (base.has(c)) base.delete(c); else base.add(c)
    onChange(base.size === opcoes.length ? null : base)
  }
  return (
    <div className="relative text-[12px]">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 rounded-md border border-line bg-white px-2.5 py-1 font-medium text-ink transition hover:bg-paper">
        <span className="text-muted">{label}</span>
        <b>{isAll ? 'Todos' : `${count}/${opcoes.length}`}</b>
        <span className="text-[9px] text-muted">▼</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-8 z-50 max-h-[360px] w-64 overflow-hidden rounded-lg border border-line bg-white p-2 shadow-xl">
            <div className="mb-1 flex gap-2 border-b border-line pb-1.5">
              <button className="rounded px-2 py-0.5 text-[11px] font-semibold text-brand hover:bg-brand/10" onClick={() => onChange(null)}>Todos</button>
              <button className="rounded px-2 py-0.5 text-[11px] font-semibold text-muted hover:bg-paper" onClick={() => onChange(new Set())}>Nenhum</button>
            </div>
            {busca && <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" className="mb-1 w-full rounded border border-line px-2 py-1 text-[12px] outline-none focus:border-brand" />}
            <div className="max-h-[264px] overflow-auto">
              {vis.map((c) => (
                <label key={c} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-paper">
                  <input type="checkbox" checked={has(c)} onChange={() => toggle(c)} className="accent-brand" />
                  <span className="truncate" title={c}>{c}</span>
                </label>
              ))}
              {!vis.length && <div className="px-1.5 py-2 text-[11px] text-muted">Nada encontrado.</div>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/* ============================== tiles ============================ */
function Tile({ titulo, tip, className, onDetalhes, children }: { titulo: string; tip: string; className?: string; onDetalhes?: () => void; children: ReactNode }) {
  return (
    <div className={`flex min-h-0 flex-col rounded-xl border border-line bg-surface p-2.5 shadow-card ${className ?? ''}`}>
      <div className="mb-1.5 flex flex-none items-center">
        <h3 className="text-[13px] font-bold text-ink">{titulo}</h3>
        <Info tip={tip} />
        {onDetalhes && (
          <button onClick={onDetalhes} className="ml-auto inline-flex items-center gap-1 rounded-md border border-brand/30 bg-brand/5 px-2 py-0.5 text-[10px] font-bold text-brand transition hover:bg-brand/15" title="Ver tabela detalhada">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18" /></svg>
            Detalhes
          </button>
        )}
      </div>
      <div className="relative min-h-0 flex-1">{children}</div>
    </div>
  )
}

function Info({ tip }: { tip: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number; below: boolean } | null>(null)
  const W = 236
  function show() {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const below = r.bottom < window.innerHeight * 0.62
    const left = Math.max(8, Math.min(r.left + r.width / 2 - W / 2, window.innerWidth - W - 8))
    const top = below ? r.bottom + 6 : r.top - 6
    setPos({ left, top, below })
  }
  return (
    <span ref={ref} onMouseEnter={show} onMouseLeave={() => setPos(null)} className="ml-1 inline-grid h-3.5 w-3.5 cursor-help place-items-center rounded-full border border-brand/50 align-middle text-[9px] font-bold text-brand">
      i
      {pos && createPortal(
        <span style={{ position: 'fixed', left: pos.left, top: pos.top, width: W, transform: pos.below ? undefined : 'translateY(-100%)', background: '#FFF3EA', color: '#8A3F1C', borderColor: 'rgb(var(--brand) / 0.30)' }} className="pointer-events-none z-[100] rounded-lg border px-3 py-2 text-[11px] font-normal leading-snug shadow-xl">{tip}</span>,
        document.body,
      )}
    </span>
  )
}

function Kpi({ lbl, val, foot }: { lbl: string; val: string; foot: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-surface px-3 py-2">
      <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: GRAD_KPI }} />
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted">{lbl}</div>
      <div className="mt-0.5 text-[17px] font-extrabold leading-tight tnum text-ink">{val}</div>
      <div className="text-[10px] text-muted">{foot}</div>
    </div>
  )
}

/* ============================ medida ============================ */
function useMedida() {
  const ref = useRef<HTMLDivElement>(null)
  const [dim, setDim] = useState({ w: 480, h: 260 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setDim({ w: Math.max(220, el.clientWidth), h: Math.max(150, el.clientHeight) })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { ref, ...dim }
}

/* ============ Evolução: faturado (área) × receita (linha) ============ */
function AreaFatReceita({ serie }: { serie: SerieLocal[] }) {
  const { ref, w: W, h: H } = useMedida()
  const padL = 12, padR = 14, padT = 26, padB = 40
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const n = serie.length
  const denom = Math.max(1, n - 1)
  const vmax = Math.max(1, ...serie.map((s) => Math.max(s.faturado, s.receita)))
  const xs = (i: number) => (n === 1 ? padL + innerW / 2 : padL + (innerW * i) / denom)
  const ys = (v: number) => padT + innerH * (1 - v / vmax)
  const baseY = padT + innerH
  const ptsFat = serie.map((s, i) => `${xs(i)},${ys(s.faturado)}`).join(' ')
  const ptsRec = serie.map((s, i) => `${xs(i)},${ys(s.receita)}`).join(' ')
  const area = n ? `M ${xs(0)},${baseY} L ${ptsFat} L ${xs(n - 1)},${baseY} Z` : ''
  const passo = n > 10 ? Math.ceil(n / 10) : 1

  return (
    <div ref={ref} className="h-full w-full">
      {n === 0 ? (
        <div className="flex h-full items-center text-[12px] text-muted">Sem dados no filtro.</div>
      ) : (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }} role="img" aria-label="Evolução de faturado e receita">
          {/* legenda */}
          <g>
            <rect x={padL} y={6} width={10} height={10} rx={2} fill={COR_FAT} fillOpacity={0.5} />
            <text x={padL + 14} y={15} fontSize={11} fill="#6B7280">Faturado</text>
            <line x1={padL + 74} y1={11} x2={padL + 90} y2={11} stroke={COR_REC} strokeWidth={2.5} />
            <text x={padL + 94} y={15} fontSize={11} fill="#6B7280">Receita</text>
          </g>
          <line x1={padL} y1={baseY} x2={W - padR} y2={baseY} stroke="#E2DACE" strokeWidth={1} />
          {area && <path d={area} style={{ fill: COR_FAT, fillOpacity: 0.13 }} />}
          <polyline points={ptsFat} fill="none" stroke={COR_FAT} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" strokeOpacity={0.85} />
          <polyline points={ptsRec} fill="none" stroke={COR_REC} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
          {serie.map((s, i) => {
            const mostra = i % passo === 0 || i === n - 1
            const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'
            const lx = i === 0 ? xs(i) + 2 : i === n - 1 ? xs(i) - 2 : xs(i)
            const m = s.faturado ? s.receita / s.faturado : 0
            return (
              <g key={s.mes}>
                <circle cx={xs(i)} cy={ys(s.receita)} r={3} fill="#fff" stroke={COR_REC} strokeWidth={2}>
                  <title>{`${s.label} · Faturado ${fmtBRL(s.faturado)} · Receita ${fmtBRL(s.receita)} · Margem ${pct1(m)}`}</title>
                </circle>
                {mostra && s.receita > 0 && <text x={lx} y={ys(s.receita) - 8} fontSize={10.5} fontWeight={600} textAnchor={anchor} fill={COR_REC}>{fmtCompacto(s.receita)}</text>}
                {mostra && (
                  <text x={xs(i)} y={H - 20} fontSize={10.5} textAnchor="middle" fill="#77706a">{s.label}</text>
                )}
                {mostra && <text x={xs(i)} y={H - 7} fontSize={10} fontWeight={700} textAnchor="middle" fill={COR_TOTAL}>{pct1(m)}</text>}
              </g>
            )
          })}
        </svg>
      )}
    </div>
  )
}

/* ============ Waterfall por unidade (receita) ============ */
function WaterfallUnidade({ itens, total }: { itens: FatiaMargem[]; total: number }) {
  const { ref, w: W, h: H } = useMedida()
  if (!itens.length || total <= 0) return <div ref={ref} className="flex h-full items-center text-[12px] text-muted">Sem dados no filtro.</div>
  const padL = 8, padR = 8, padT = 20, padB = 30
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const n = itens.length
  const slots = n + 1
  const slot = innerW / slots
  const bw = Math.min(48, slot * 0.6)
  const ys = (v: number) => padT + innerH * (1 - v / total)
  const baseY = padT + innerH
  const cx = (i: number) => padL + slot * i + slot / 2
  let cum = 0
  const steps = itens.map((it, i) => {
    const yTop = ys(cum + it.receita)
    const yBot = ys(cum)
    const seg = { it, i, x: cx(i) - bw / 2, yTop, h: Math.max(1, yBot - yTop), topDe: cum + it.receita }
    cum += it.receita
    return seg
  })
  return (
    <div ref={ref} className="h-full w-full">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }} role="img" aria-label="Receita por unidade (waterfall)">
        <line x1={padL} y1={baseY} x2={W - padR} y2={baseY} stroke="#E2DACE" strokeWidth={1} />
        {steps.map((s, i) => (
          <g key={s.it.nome}>
            {i < steps.length - 1 && <line x1={s.x + bw} y1={ys(s.topDe)} x2={cx(i + 1) - bw / 2} y2={ys(s.topDe)} stroke="#CFC6B8" strokeWidth={1} strokeDasharray="3 3" />}
            <rect x={s.x} y={s.yTop} width={bw} height={s.h} rx={2} fill={PAL[i % PAL.length]}>
              <title>{`${s.it.nome}: ${fmtBRL(s.it.receita)} (${total ? pct1(s.it.receita / total) : '—'}) · margem ${pct1(s.it.margem1)}`}</title>
            </rect>
            <text x={cx(i)} y={s.yTop - 4} fontSize={10.5} fontWeight={600} textAnchor="middle" fill="#6B7280">{fmtCompacto(s.it.receita)}</text>
            <text x={cx(i)} y={H - 9} fontSize={10} textAnchor="middle" fill="#77706a">{short(s.it.nome, Math.max(6, Math.floor(slot / 6)))}</text>
          </g>
        ))}
        <rect x={cx(n) - bw / 2} y={ys(total)} width={bw} height={baseY - ys(total)} rx={2} fill={COR_TOTAL}>
          <title>{`Total: ${fmtBRL(total)}`}</title>
        </rect>
        <text x={cx(n)} y={ys(total) - 4} fontSize={10.5} fontWeight={700} textAnchor="middle" fill={COR_TOTAL}>{fmtCompacto(total)}</text>
        <text x={cx(n)} y={H - 9} fontSize={10} fontWeight={700} textAnchor="middle" fill="#6B7280">Total</text>
      </svg>
    </div>
  )
}

/* ============ Concentração da receita (donut) ============ */
function DonutClientes({ itens, total }: { itens: FatiaMargem[]; total: number }) {
  if (!itens.length || total <= 0) return <div className="flex h-full items-center text-[12px] text-muted">Sem dados no filtro.</div>
  const size = 132, stroke = 26
  const r = (size - stroke) / 2
  const c = size / 2
  const C = 2 * Math.PI * r
  let off = 0
  const segs = itens.map((it, i) => {
    const len = (it.receita / total) * C
    const el = (
      <circle key={it.nome} cx={c} cy={c} r={r} fill="none" stroke={PAL[i % PAL.length]} strokeWidth={stroke} strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off} transform={`rotate(-90 ${c} ${c})`}>
        <title>{`${it.nome}: ${fmtBRL(it.receita)} (${pct1(it.receita / total)})`}</title>
      </circle>
    )
    off += len
    return el
  })
  return (
    <div className="flex h-full flex-col items-center gap-2">
      <div className="flex-none" style={{ height: 'min(50%, 200px)', aspectRatio: '1 / 1' }}>
        <svg viewBox={`0 0 ${size} ${size}`} width="100%" height="100%">
          {segs}
          <text x={c} y={c - 3} textAnchor="middle" fontSize={11} fill="#64748B">Receita</text>
          <text x={c} y={c + 13} textAnchor="middle" fontSize={15} fontWeight={700} fill={COR_TOTAL}>{fmtCompacto(total)}</text>
        </svg>
      </div>
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
        {itens.map((it, i) => (
          <div key={it.nome} className="flex min-h-0 flex-1 items-center gap-1.5 text-[11px]">
            <span className="inline-block h-2.5 w-2.5 flex-none rounded-sm" style={{ background: PAL[i % PAL.length] }} />
            <span className="min-w-0 flex-1 truncate text-ink" title={it.nome}>{it.nome}</span>
            <span className="flex-none font-semibold tnum text-ink">{pct1(it.receita / total)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ============ Margem por cliente (barras) ============ */
function BarrasCliente({ itens }: { itens: FatiaMargem[] }) {
  if (!itens.length) return <div className="flex h-full items-center text-[12px] text-muted">Sem dados no filtro.</div>
  const max = itens[0].receita || 1
  return (
    <div className="flex h-full flex-col">
      {itens.map((it, i) => (
        <div key={it.nome} className="flex min-h-0 flex-1 items-center gap-1.5 text-[11px]">
          <div className="w-[32%] shrink-0 truncate text-ink" title={it.nome}>{it.nome}</div>
          <div className="h-3.5 flex-1 overflow-hidden rounded bg-paper">
            <div className="h-full rounded" style={{ width: `${Math.max(2, (it.receita / max) * 100)}%`, background: PAL[i % PAL.length] }} title={`Receita ${fmtBRL(it.receita)} · ${it.qtd} job(s)`} />
          </div>
          <div className="w-[54px] shrink-0 text-right font-semibold tnum text-ink">{fmtCompacto(it.receita)}</div>
          <div className={`w-[46px] shrink-0 text-right font-bold tnum ${it.margem1 < 0 ? 'text-red-600' : ''}`} style={it.margem1 < 0 ? undefined : { color: COR_TOTAL }}>{pct1(it.margem1)}</div>
        </div>
      ))}
    </div>
  )
}

/* ========================= modal Detalhes ========================= */
type Detalhe = {
  titulo: string
  arquivo: string
  colunas: { label: string; tipo: 'texto' | 'num' | 'pct' }[]
  linhas: (string | number)[][]
}
function fmtCel(cel: string | number, tipo: 'texto' | 'num' | 'pct'): string {
  if (tipo === 'texto') return String(cel)
  if (tipo === 'pct') return `${cel}%`
  return Number(cel).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
}
function ModalDetalhe({ dados, onClose }: { dados: Detalhe; onClose: () => void }) {
  async function exportar() {
    const XLSX = await import('xlsx')
    const aoa: (string | number)[][] = [dados.colunas.map((c) => c.label), ...dados.linhas]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = dados.colunas.map((c) => ({ wch: c.tipo === 'texto' ? 40 : 15 }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Detalhes')
    XLSX.writeFile(wb, dados.arquivo)
  }
  return createPortal(
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-none items-center justify-between border-b border-line px-5 py-3">
          <h3 className="font-serif text-lg font-semibold text-ink">{dados.titulo}</h3>
          <button onClick={onClose} className="text-2xl leading-none text-muted transition hover:text-ink" aria-label="Fechar">×</button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-5 py-2">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b-2 border-line text-muted">
                {dados.colunas.map((c, i) => <th key={i} className={`py-2 font-semibold ${c.tipo === 'texto' ? 'text-left' : 'text-right'}`}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {dados.linhas.map((linha, ri) => {
                const total = linha[0] === 'TOTAL'
                return (
                  <tr key={ri} className={`border-b border-line/60 ${total ? 'font-bold text-ink' : 'text-ink/90'}`}>
                    {linha.map((cel, ci) => <td key={ci} className={`py-1.5 tnum ${dados.colunas[ci].tipo === 'texto' ? 'text-left' : 'text-right'}`}>{fmtCel(cel, dados.colunas[ci].tipo)}</td>)}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-none items-center justify-end gap-2 border-t border-line px-5 py-3">
          <button onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-muted transition hover:bg-paper">Fechar</button>
          <button onClick={exportar} className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white shadow-brand transition hover:opacity-90">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>
            Exportar Excel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/* ============================ estilos ============================ */
function ScopedStyle() {
  return (
    <style>{`
.rentind .seg{display:inline-flex;background:#EEEAE3;border-radius:9px;padding:3px;gap:2px}
.rentind .seg button{border:0;background:transparent;font:inherit;font-size:12px;font-weight:700;color:#7a756c;padding:5px 13px;border-radius:7px;cursor:pointer;white-space:nowrap}
.rentind .seg button.on{background:#fff;color:#1F2937;box-shadow:0 1px 2px rgba(0,0,0,.08)}
`}</style>
  )
}
