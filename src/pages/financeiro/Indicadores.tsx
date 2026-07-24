import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../auth/AuthContext'
import { MESES, z12, fmt0, fmtCompacto, build, loadFluxo, type Lancamento, type Pivot } from './fluxoData'

// Paleta do logotipo Batux (laranja + navy escuro) — visual moderno
const COR_REC = '#E9622E' // Receitas / entradas — laranja Batux
const COR_DESP = '#2B2D42' // Despesas / pagamentos — navy escuro do logo
// Cores exclusivas do gráfico "Evolução do Saldo" (mantido como já estava)
const SALDO_POS = '#15805A'
const SALDO_NEG = '#C0392B'
const sumArr = (a: number[]) => a.reduce((s, v) => s + v, 0)

export function Indicadores() {
  const { mode } = useAuth()
  const [rows, setRows] = useState<Lancamento[]>([])
  const [saldoInicial, setSaldoInicial] = useState(0)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  // filtros
  const [mesDe, setMesDe] = useState(0)
  const [mesAte, setMesAte] = useState(11)
  const [selRec, setSelRec] = useState<Set<string> | null>(null) // null = todas
  const [selDesp, setSelDesp] = useState<Set<string> | null>(null)

  // altura disponível (para caber 100% na tela, sem scroll)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [altura, setAltura] = useState<number | undefined>(undefined)
  useLayoutEffect(() => {
    function calc() {
      const el = wrapRef.current
      if (!el) return
      const top = el.getBoundingClientRect().top
      setAltura(Math.max(430, window.innerHeight - top - 80))
    }
    calc()
    window.addEventListener('resize', calc)
    return () => window.removeEventListener('resize', calc)
  }, [loading, erro])

  useEffect(() => {
    let ativo = true
    ;(async () => {
      if (mode !== 'supabase' || !supabase) {
        setLoading(false)
        return
      }
      const res = await loadFluxo(supabase)
      if (!ativo) return
      if (res.error) {
        setErro('Não foi possível carregar a base. Verifique se o Fluxo de Caixa já foi carregado.')
        setLoading(false)
        return
      }
      setRows(res.rows)
      setSaldoInicial(res.saldoInicial)
      setLoading(false)
    })()
    return () => {
      ativo = false
    }
  }, [mode])

  const pivot: Pivot = useMemo(() => build(rows), [rows])
  const catsRec = useMemo(() => Object.keys(pivot.ent).sort((a, b) => sumArr(pivot.ent[b]) - sumArr(pivot.ent[a])), [pivot])
  const catsDesp = useMemo(() => Object.keys(pivot.sai).sort((a, b) => sumArr(pivot.sai[b]) - sumArr(pivot.sai[a])), [pivot])

  const m = useMemo(() => {
    const recSel = (c: string) => selRec === null || selRec.has(c)
    const despSel = (c: string) => selDesp === null || selDesp.has(c)
    const de = Math.min(mesDe, mesAte)
    const ate = Math.max(mesDe, mesAte)

    // fluxos mensais (12) com as categorias selecionadas
    const recebFull = z12()
    const pagFull = z12()
    for (const c of Object.keys(pivot.ent)) if (recSel(c)) for (let i = 0; i < 12; i++) recebFull[i] += pivot.ent[c][i]
    for (const c of Object.keys(pivot.sai)) if (despSel(c)) for (let i = 0; i < 12; i++) pagFull[i] += pivot.sai[c][i]

    // saldo encadeado a partir do saldo inicial
    const saldoFull = z12()
    const saldoAntFull = z12()
    let p = saldoInicial
    for (let i = 0; i < 12; i++) {
      saldoAntFull[i] = p
      p += recebFull[i] - pagFull[i]
      saldoFull[i] = p
    }

    // janela do período
    const idx: number[] = []
    for (let i = de; i <= ate; i++) idx.push(i)
    const receb = idx.map((i) => recebFull[i])
    const pag = idx.map((i) => pagFull[i])
    const saldo = idx.map((i) => saldoFull[i])
    const labels = idx.map((i) => MESES[i])
    const resultado = receb.map((r, i) => r - pag[i])

    // composição por categoria (janela)
    const compRec = catsRec
      .filter(recSel)
      .map((c) => ({ nome: c, valor: idx.reduce((a, i) => a + pivot.ent[c][i], 0) }))
      .filter((x) => x.valor > 0.5)
      .sort((a, b) => b.valor - a.valor)
    const compDesp = catsDesp
      .filter(despSel)
      .map((c) => ({ nome: c, valor: idx.reduce((a, i) => a + pivot.sai[c][i], 0) }))
      .filter((x) => x.valor > 0.5)
      .sort((a, b) => b.valor - a.valor)

    // tops por descrição (janela + categorias selecionadas)
    const tops = (bagD: Record<string, Record<string, number[]>>, sel: (c: string) => boolean) => {
      const acc: Record<string, number> = {}
      for (const cat of Object.keys(bagD)) {
        if (!sel(cat)) continue
        for (const desc of Object.keys(bagD[cat])) acc[desc] = (acc[desc] || 0) + idx.reduce((a, i) => a + bagD[cat][desc][i], 0)
      }
      return Object.keys(acc)
        .map((nome) => ({ nome, valor: acc[nome] }))
        .filter((x) => x.valor > 0.5)
        .sort((a, b) => b.valor - a.valor)
        .slice(0, 5)
    }

    const totR = sumArr(receb)
    const totP = sumArr(pag)
    const minSaldo = saldo.length ? Math.min(...saldo) : 0
    const minIdx = saldo.indexOf(minSaldo)
    const queimas = resultado.filter((r) => r < 0).map((r) => -r)
    const queimaMedia = queimas.length ? queimas.reduce((a, b) => a + b, 0) / queimas.length : 0
    const saldoAtual = idx.length ? saldoAntFull[idx[0]] : saldoInicial
    const runway = queimaMedia > 0 ? saldoAtual / queimaMedia : null

    return {
      receb, pag, saldo, labels, compRec, compDesp,
      topCli: tops(pivot.entD, recSel), topPag: tops(pivot.saiD, despSel),
      totR, totP, minSaldo, minIdx, queimaMedia, runway, saldoFinal: saldo.length ? saldo[saldo.length - 1] : saldoInicial,
      anos: pivot.years.join(' / '),
    }
  }, [pivot, catsRec, catsDesp, selRec, selDesp, mesDe, mesAte, saldoInicial])

  const vazio = rows.length === 0

  if (loading) return <div className="grid place-items-center rounded-2xl border border-line bg-surface py-20 text-sm text-muted">Carregando indicadores…</div>
  if (erro) return <div className="rounded-lg border border-neg/30 bg-red-50 px-4 py-3 text-sm font-medium text-neg">{erro}</div>
  if (vazio)
    return (
      <div className="grid place-items-center gap-2 rounded-2xl border border-dashed border-line bg-surface/60 px-6 py-16 text-center">
        <p className="font-serif text-lg text-ink">Sem dados para indicadores ainda.</p>
        <p className="max-w-md text-sm text-muted">Carregue a base no módulo <b>Fluxo de Caixa</b> e os indicadores aparecerão aqui.</p>
      </div>
    )

  return (
    <div
      ref={wrapRef}
      style={{ width: 'min(1600px, 96vw)', height: altura, position: 'relative', left: '50%', transform: 'translateX(-50%)', overflow: 'hidden' }}
      className="flex flex-col gap-2"
    >
      {/* Filtros */}
      <div className="flex flex-none flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Filtros</span>
        <div className="flex items-center gap-1.5 text-[12px]">
          <span className="text-muted">Período</span>
          <SelectMes value={mesDe} onChange={setMesDe} />
          <span className="text-muted">até</span>
          <SelectMes value={mesAte} onChange={setMesAte} />
        </div>
        <MultiSelect label="Receitas" opcoes={catsRec} value={selRec} onChange={setSelRec} />
        <MultiSelect label="Despesas" opcoes={catsDesp} value={selDesp} onChange={setSelDesp} />
        <button
          className="ml-auto rounded-md border border-line px-2.5 py-1 text-[12px] font-medium text-muted transition hover:bg-paper"
          onClick={() => { setMesDe(0); setMesAte(11); setSelRec(null); setSelDesp(null) }}
        >
          Limpar filtros
        </button>
      </div>

      {/* KPIs */}
      <div className="grid flex-none grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi lbl="Saldo Final" val={m.saldoFinal} cor={m.saldoFinal < 0 ? COR_DESP : undefined} foot="Ao fim do período" tip="Saldo de caixa projetado ao fim do período filtrado = saldo no início + recebimentos − pagamentos acumulados." />
        <Kpi lbl="Resultado de Caixa" val={m.totR - m.totP} cor={m.totR - m.totP < 0 ? COR_DESP : COR_REC} foot="Recebimentos − Pagamentos" tip="Diferença entre tudo que entrou e tudo que saiu no período. Positivo = geração de caixa; negativo = consumo." />
        <Kpi lbl="Menor Saldo" val={m.minSaldo} cor={m.minSaldo < 0 ? COR_DESP : undefined} foot={`Mês mais apertado: ${m.labels[m.minIdx] ?? '—'}`} tip="O menor saldo de caixa alcançado no período — aponta o mês de maior aperto financeiro." />
        <Kpi lbl="Queima Média / mês" val={m.queimaMedia} cor={m.queimaMedia > 0 ? COR_DESP : undefined} foot="Média dos meses no negativo" tip="Média mensal de quanto o caixa ficou negativo, considerando só os meses em que saiu mais do que entrou." />
        <KpiTexto lbl="Meses de Caixa" valor={m.runway === null ? '—' : m.runway.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} foot={m.runway === null ? 'Sem queima média' : 'Saldo ÷ queima média'} tip="Por quantos meses o caixa se sustenta na queima média atual (saldo no início do período ÷ queima média mensal)." />
      </div>

      {/* Grid de gráficos — 2 linhas que preenchem a altura */}
      <div className="grid min-h-0 flex-1 grid-cols-12 grid-rows-2 gap-2">
        <Tile className="col-span-12 lg:col-span-5 lg:row-span-2" titulo="Evolução do Saldo de Caixa" tip="Trajetória do saldo de caixa mês a mês. A linha tracejada marca o zero; pontos em vermelho indicam saldo negativo.">
          <AreaSaldo saldo={m.saldo} labels={m.labels} minIdx={m.minIdx} />
        </Tile>
        <Tile className="col-span-12 lg:col-span-3" titulo="Concentração das Despesas" tip="Distribuição percentual das despesas por categoria no período (donut).">
          <DonutDespesas itens={cap(m.compDesp, 6)} total={m.totP} />
        </Tile>
        <Tile className="col-span-12 lg:col-span-4" titulo="Recebimentos × Pagamentos" tip="Compara, mês a mês, o total de entradas (laranja) e saídas (navy) de caixa.">
          <BarrasMensais receb={m.receb} pag={m.pag} labels={m.labels} />
        </Tile>
        <Tile className="col-span-6 lg:col-span-3" titulo="Top Clientes" tip="Maiores fontes de recebimento (por descrição) no período.">
          <BarrasHorizontais itens={m.topCli} cor={COR_REC} total={m.totR} />
        </Tile>
        <Tile className="col-span-6 lg:col-span-4" titulo="Maiores Pagamentos" tip="Maiores saídas de caixa (por descrição) no período.">
          <BarrasHorizontais itens={m.topPag} cor={COR_DESP} total={m.totP} />
        </Tile>
      </div>
    </div>
  )
}

/* ------------------------------ util ------------------------------ */
function cap(items: { nome: string; valor: number }[], n: number) {
  if (items.length <= n) return items
  const head = items.slice(0, n)
  const rest = items.slice(n).reduce((a, b) => a + b.valor, 0)
  if (rest > 0.5) head.push({ nome: 'Outras', valor: rest })
  return head
}

/* ---------------------------- tooltip ---------------------------- */
function Info({ tip }: { tip: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number; below: boolean } | null>(null)
  const W = 236
  function show() {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const below = r.bottom < window.innerHeight * 0.62 // abre pra baixo se houver espaço, senão pra cima
    const left = Math.max(8, Math.min(r.left + r.width / 2 - W / 2, window.innerWidth - W - 8))
    const top = below ? r.bottom + 6 : r.top - 6
    setPos({ left, top, below })
  }
  return (
    <span
      ref={ref}
      onMouseEnter={show}
      onMouseLeave={() => setPos(null)}
      className="ml-1 inline-grid h-3.5 w-3.5 cursor-help place-items-center rounded-full border border-brand/50 align-middle text-[9px] font-bold text-brand"
    >
      i
      {pos &&
        createPortal(
          <span
            style={{
              position: 'fixed',
              left: pos.left,
              top: pos.top,
              width: W,
              transform: pos.below ? undefined : 'translateY(-100%)',
              background: '#FFF3EA',
              color: '#8A3F1C',
              borderColor: 'rgb(var(--brand) / 0.30)',
            }}
            className="pointer-events-none z-[100] rounded-lg border px-3 py-2 text-[11px] font-normal leading-snug shadow-xl"
          >
            {tip}
          </span>,
          document.body,
        )}
    </span>
  )
}

/* ---------------------------- filtros ---------------------------- */
function SelectMes({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="rounded-md border border-line bg-white px-2 py-1 text-[12px] font-semibold text-ink outline-none focus:border-brand"
    >
      {MESES.map((mes, i) => (
        <option key={mes} value={i}>{mes}</option>
      ))}
    </select>
  )
}
function MultiSelect({ label, opcoes, value, onChange }: { label: string; opcoes: string[]; value: Set<string> | null; onChange: (s: Set<string> | null) => void }) {
  const [open, setOpen] = useState(false)
  const isAll = value === null
  const has = (c: string) => isAll || value!.has(c)
  const count = isAll ? opcoes.length : value!.size
  function toggle(c: string) {
    const base = isAll ? new Set(opcoes) : new Set(value!)
    if (base.has(c)) base.delete(c)
    else base.add(c)
    onChange(base.size === opcoes.length ? null : base)
  }
  return (
    <div className="relative text-[12px]">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 rounded-md border border-line bg-white px-2.5 py-1 font-medium text-ink transition hover:bg-paper">
        <span className="text-muted">{label}</span>
        <b>{isAll ? 'Todas' : `${count}/${opcoes.length}`}</b>
        <span className="text-[9px] text-muted">▼</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-8 z-50 max-h-[340px] w-60 overflow-auto rounded-lg border border-line bg-white p-2 shadow-xl">
            <div className="mb-1 flex gap-2 border-b border-line pb-1.5">
              <button className="rounded px-2 py-0.5 text-[11px] font-semibold text-brand hover:bg-brand/10" onClick={() => onChange(null)}>Todas</button>
              <button className="rounded px-2 py-0.5 text-[11px] font-semibold text-muted hover:bg-paper" onClick={() => onChange(new Set())}>Nenhuma</button>
            </div>
            {opcoes.map((c) => (
              <label key={c} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-paper">
                <input type="checkbox" checked={has(c)} onChange={() => toggle(c)} className="accent-brand" />
                <span className="truncate">{c}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/* ---------------------------- tiles ------------------------------ */
function Tile({ titulo, tip, className, children }: { titulo: string; tip: string; className?: string; children: ReactNode }) {
  return (
    <div className={`flex min-h-0 flex-col rounded-xl border border-line bg-surface p-2.5 shadow-card ${className ?? ''}`}>
      <div className="mb-1.5 flex flex-none items-center">
        <h3 className="text-[13px] font-bold text-ink">{titulo}</h3>
        <Info tip={tip} />
      </div>
      <div className="relative min-h-0 flex-1">{children}</div>
    </div>
  )
}
function Kpi({ lbl, val, cor, foot, tip }: { lbl: string; val: number; cor?: string; foot: string; tip: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-surface px-3 py-2">
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: cor ?? 'rgb(var(--brand))' }} />
      <div className="flex items-center">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted">{lbl}</span>
        <Info tip={tip} />
      </div>
      <div className="mt-0.5 text-[18px] font-extrabold leading-tight tnum" style={{ color: cor ?? undefined }}>R$ {fmt0(val)}</div>
      <div className="text-[10px] text-muted">{foot}</div>
    </div>
  )
}
function KpiTexto({ lbl, valor, foot, tip }: { lbl: string; valor: string; foot: string; tip: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-surface px-3 py-2">
      <span className="absolute inset-y-0 left-0 w-1 bg-band" />
      <div className="flex items-center">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted">{lbl}</span>
        <Info tip={tip} />
      </div>
      <div className="mt-0.5 text-[18px] font-extrabold leading-tight tnum text-ink">{valor}</div>
      <div className="text-[10px] text-muted">{foot}</div>
    </div>
  )
}

/* ---------------------------- gráficos --------------------------- */
function AreaSaldo({ saldo, labels, minIdx }: { saldo: number[]; labels: string[]; minIdx: number }) {
  // Mede o próprio quadro para preencher 100% (ao ganhar altura, o gráfico cresce de verdade).
  const ref = useRef<HTMLDivElement>(null)
  const [dim, setDim] = useState({ w: 520, h: 320 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setDim({ w: Math.max(220, el.clientWidth), h: Math.max(160, el.clientHeight) })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const W = dim.w
  const H = dim.h
  const padL = 10, padR = 14, padT = 30, padB = 28
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const n = saldo.length
  const denom = Math.max(1, n - 1)
  const vmax = Math.max(0, ...saldo)
  const vmin = Math.min(0, ...saldo)
  const range = vmax - vmin || 1
  const xs = (i: number) => (n === 1 ? padL + innerW / 2 : padL + (innerW * i) / denom)
  const ys = (v: number) => padT + innerH * (1 - (v - vmin) / range)
  const zeroY = ys(0)
  const pts = saldo.map((v, i) => `${xs(i)},${ys(v)}`).join(' ')
  const area = `M ${xs(0)},${zeroY} L ${pts} L ${xs(n - 1)},${zeroY} Z`
  return (
    <div ref={ref} className="h-full w-full">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }} role="img" aria-label="Evolução do saldo">
        <line x1={padL} y1={zeroY} x2={W - padR} y2={zeroY} stroke="#CBD5E1" strokeWidth={1} strokeDasharray="4 4" />
        <text x={padL} y={zeroY - 5} fontSize={13} fill="#94A3B8">0</text>
        <path d={area} style={{ fill: 'rgb(var(--brand))', fillOpacity: 0.12 }} />
        <polyline points={pts} fill="none" style={{ stroke: 'rgb(var(--brand))' }} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {saldo.map((v, i) => {
          const neg = v < 0
          const destaque = i === minIdx || i === n - 1
          return (
            <g key={i}>
              <circle cx={xs(i)} cy={ys(v)} r={destaque ? 5 : 3.4} fill={neg ? SALDO_NEG : SALDO_POS} />
              {destaque && (
                <text x={xs(i)} y={ys(v) + (v >= 0 ? -12 : 22)} fontSize={18} fontWeight={700} textAnchor="middle" fill={neg ? SALDO_NEG : '#0B2545'}>
                  {fmtCompacto(v)}
                </text>
              )}
              <text x={xs(i)} y={H - 9} fontSize={14} textAnchor="middle" fill="#64748B">{labels[i]}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
function BarrasMensais({ receb, pag, labels }: { receb: number[]; pag: number[]; labels: string[] }) {
  const maxVal = Math.max(1, ...receb, ...pag)
  return (
    <div className="flex h-full flex-col">
      <div className="mb-1 flex flex-none gap-3">
        <Leg cor={COR_REC} txt="Recebimentos" />
        <Leg cor={COR_DESP} txt="Pagamentos" />
      </div>
      <div className="flex min-h-0 flex-1 items-end gap-1">
        {labels.map((mes, i) => (
          <div key={mes} className="flex h-full flex-1 items-end justify-center gap-[3px]">
            <div className="w-1/3 rounded-t-sm" style={{ height: `${(receb[i] / maxVal) * 100}%`, background: COR_REC }} title={`Recebimentos ${mes}: R$ ${fmt0(receb[i])}`} />
            <div className="w-1/3 rounded-t-sm" style={{ height: `${(pag[i] / maxVal) * 100}%`, background: COR_DESP }} title={`Pagamentos ${mes}: R$ ${fmt0(pag[i])}`} />
          </div>
        ))}
      </div>
      <div className="mt-0.5 flex flex-none gap-1">
        {labels.map((mes) => (
          <div key={mes} className="flex-1 text-center text-[9px] text-muted">{mes}</div>
        ))}
      </div>
    </div>
  )
}
// Tons de navy (paleta das despesas) para as fatias do donut
const PAL_DESP = ['#2B2D42', '#3C4063', '#4E5482', '#666C99', '#8791B4', '#AAB2CC', '#CDD3E2']

function DonutDespesas({ itens, total }: { itens: { nome: string; valor: number }[]; total: number }) {
  if (!itens.length || total <= 0) return <div className="flex h-full items-center text-[12px] text-muted">Sem dados no filtro.</div>
  const size = 132
  const stroke = 26
  const r = (size - stroke) / 2
  const c = size / 2
  const C = 2 * Math.PI * r
  let off = 0
  const segs = itens.map((it, i) => {
    const len = (it.valor / total) * C
    const el = (
      <circle
        key={it.nome}
        cx={c}
        cy={c}
        r={r}
        fill="none"
        stroke={PAL_DESP[i % PAL_DESP.length]}
        strokeWidth={stroke}
        strokeDasharray={`${len} ${C - len}`}
        strokeDashoffset={-off}
        transform={`rotate(-90 ${c} ${c})`}
      />
    )
    off += len
    return el
  })
  return (
    <div className="flex h-full items-center gap-2">
      <div className="flex-none" style={{ height: 'min(100%, 152px)', aspectRatio: '1 / 1' }}>
        <svg viewBox={`0 0 ${size} ${size}`} width="100%" height="100%">
          {segs}
          <text x={c} y={c - 3} textAnchor="middle" fontSize={11} fill="#64748B">Despesas</text>
          <text x={c} y={c + 13} textAnchor="middle" fontSize={15} fontWeight={700} fill="#2B2D42">{fmtCompacto(total)}</text>
        </svg>
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
        {itens.map((it, i) => (
          <div key={it.nome} className="flex items-center gap-1.5 text-[11px]">
            <span className="inline-block h-2.5 w-2.5 flex-none rounded-sm" style={{ background: PAL_DESP[i % PAL_DESP.length] }} />
            <span className="min-w-0 flex-1 truncate text-ink" title={it.nome}>{it.nome}</span>
            <span className="flex-none font-semibold tnum text-ink">{Math.round((it.valor / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function BarrasHorizontais({ itens, cor, total }: { itens: { nome: string; valor: number }[]; cor: string; total: number }) {
  if (!itens.length) return <div className="flex h-full items-center text-[12px] text-muted">Sem dados no filtro.</div>
  const max = itens[0].valor || 1
  return (
    // cada linha é flexível (flex-1) → todas dividem a altura e SEMPRE cabem, sem corte
    <div className="flex h-full flex-col">
      {itens.map((it) => (
        <div key={it.nome} className="flex min-h-0 flex-1 items-center gap-1.5 text-[11px]">
          <div className="w-[32%] shrink-0 truncate text-ink" title={it.nome}>{it.nome}</div>
          <div className="h-3.5 flex-1 overflow-hidden rounded bg-paper">
            <div className="h-full rounded" style={{ width: `${(it.valor / max) * 100}%`, background: cor, minWidth: 2 }} />
          </div>
          <div className="w-[58px] shrink-0 text-right font-semibold tnum text-ink">{fmtCompacto(it.valor)}</div>
          <div className="w-[34px] shrink-0 text-right tnum text-muted">{total ? Math.round((it.valor / total) * 100) : 0}%</div>
        </div>
      ))}
    </div>
  )
}
function Leg({ cor, txt }: { cor: string; txt: string }) {
  return (
    <span className="flex items-center gap-1 text-[11px] text-muted">
      <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: cor }} />
      {txt}
    </span>
  )
}
