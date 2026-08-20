import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, fetchAllRows } from '../../lib/supabase'
import { useAuth } from '../../auth/AuthContext'
import { ModuloTopo } from '../../components/ModuloTopo'
import {
  buildFaturamentoIndicadores,
  type FaturamentoRow,
  type Fatia,
  type SerieMes,
} from './publiFaturamento'

/* ================================================================== *
 *  Faturamento — Indicadores (base do Publi)
 *  Lê a mesma base do Supabase da Lista analítica e desenha o painel
 *  (estilo Power BI, paleta quente laranja): evolução mensal, faturado ×
 *  recebido × a receber, por unidade de negócio e top clientes/concentração.
 *  Toda a agregação vem de buildFaturamentoIndicadores (publiFaturamento.ts).
 *  Métrica = VALOR FATURADO (coluna K). Leitura: todo autenticado.
 * ================================================================== */

const CONSOLIDADO = '__consolidado__'
const GRAD_KPI = 'linear-gradient(180deg, #FE9F2E 0%, #FB5403 55%, #F5390A 100%)'
// Paleta QUENTE (laranja → amarelo) para fatias/barras — estilo MC/Indicadores.
const PAL = ['#F5390A', '#FB5403', '#FE7A1E', '#FE9F2E', '#FDBA3E', '#F6CE5B', '#E9D98A']
const COR_FAT = '#FB5403'
const COR_REC = '#159B5B'
const COR_AREC = '#FDBA3E'

const fmt0 = (v: number) => Math.round(v).toLocaleString('pt-BR')
const fmtBRL = (v: number) => `R$ ${fmt0(v)}`
const fmtCompacto = (v: number) => {
  const a = Math.abs(v)
  if (a >= 1e6) return `${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}M`
  if (a >= 1e3) return `${(v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}k`
  return fmt0(v)
}
const pct1 = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`

export function FaturamentoIndicadores() {
  const { mode } = useAuth()

  const [rows, setRows] = useState<FaturamentoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [empresaSel, setEmpresaSel] = useState<string>(CONSOLIDADO)
  const [anoSel, setAnoSel] = useState<string>('todos')

  /* ---------- carregar (mesma base da Lista) ---------- */
  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    if (mode !== 'supabase' || !supabase) {
      setLoading(false)
      return
    }
    const { data, error } = await fetchAllRows((from, to) =>
      supabase!
        .from('faturamento')
        .select('empresa, cliente, sacado, origem, descricao, documento, ecs, pit, emissao, vencimento, pagamento, valor')
        .order('emissao', { ascending: false })
        .order('id')
        .range(from, to),
    )
    if (error) {
      setErro('Não foi possível carregar a base. Verifique se a tabela faturamento foi criada no Supabase.')
      setLoading(false)
      return
    }
    setRows(
      (data ?? []).map((r) => ({
        empresa: (r.empresa ?? '').toString(),
        cliente: (r.cliente ?? '').toString(),
        sacado: (r.sacado ?? '').toString(),
        origem: (r.origem ?? '').toString(),
        descricao: (r.descricao ?? '').toString(),
        documento: (r.documento ?? '').toString(),
        ecs: (r.ecs ?? '').toString(),
        pit: (r.pit ?? '').toString(),
        emissao: r.emissao ?? null,
        vencimento: r.vencimento ?? null,
        pagamento: r.pagamento ?? null,
        valor: Number(r.valor) || 0,
      })),
    )
    setLoading(false)
  }, [mode])

  useEffect(() => {
    carregar()
  }, [carregar])

  /* ---------- derivações ---------- */
  const empresas = useMemo(() => [...new Set(rows.map((r) => r.empresa))].filter(Boolean).sort(), [rows])
  const rowsEmpresa = useMemo(
    () => (empresaSel === CONSOLIDADO ? rows : rows.filter((r) => r.empresa === empresaSel)),
    [rows, empresaSel],
  )
  const anos = useMemo(
    () => [...new Set(rowsEmpresa.map((r) => (r.emissao ?? '').slice(0, 4)))].filter(Boolean).sort().reverse(),
    [rowsEmpresa],
  )
  const rowsPeriodo = useMemo(
    () => (anoSel === 'todos' ? rowsEmpresa : rowsEmpresa.filter((r) => (r.emissao ?? '').startsWith(anoSel))),
    [rowsEmpresa, anoSel],
  )
  const ind = useMemo(() => buildFaturamentoIndicadores(rowsPeriodo), [rowsPeriodo])

  // Top clientes para o donut: 6 maiores + "Outras".
  const donut = useMemo<Fatia[]>(() => {
    const top = ind.porCliente.slice(0, 6)
    const resto = ind.porCliente.slice(6)
    if (resto.length) {
      top.push({
        nome: `Outras (${resto.length})`,
        valor: resto.reduce((s, f) => s + f.valor, 0),
        qtd: resto.reduce((s, f) => s + f.qtd, 0),
      })
    }
    return top
  }, [ind.porCliente])

  const concentracaoTop3 = useMemo(() => {
    if (!ind.totalFaturado) return null
    const top3 = ind.porCliente.slice(0, 3).reduce((s, f) => s + f.valor, 0)
    return (top3 / ind.totalFaturado) * 100
  }, [ind])

  const vazio = rows.length === 0
  const demo = mode !== 'supabase'

  return (
    <div className="fatind flex flex-col gap-3" style={{ width: '100%' }}>
      <ScopedStyle />

      <ModuloTopo>
        <div className="flex min-h-[64px] flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-serif text-lg font-semibold text-ink">Faturamento · Indicadores</h2>
            <p className="text-[13px] text-muted">
              Base do Publi · métrica: Valor Faturado
              {demo ? ' · modo demonstração (sem banco)' : ''}
            </p>
          </div>
          {!vazio && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="seg flex-wrap">
                <button className={empresaSel === CONSOLIDADO ? 'on' : ''} onClick={() => setEmpresaSel(CONSOLIDADO)} title="Todas as empresas">Consolidado</button>
                {empresas.map((e) => (
                  <button key={e} className={empresaSel === e ? 'on' : ''} onClick={() => setEmpresaSel(e)} title={e}>{e}</button>
                ))}
              </div>
              <select className="periodo-sel" value={anoSel} onChange={(e) => setAnoSel(e.target.value)} title="Ano de emissão">
                <option value="todos">Todos os anos</option>
                {anos.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          )}
        </div>
      </ModuloTopo>

      {erro && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] font-semibold text-red-700">{erro}</div>}

      {loading ? (
        <div className="rounded-xl border border-line bg-surface px-4 py-10 text-center text-[13px] text-muted">Carregando…</div>
      ) : vazio ? (
        <div className="rounded-xl border border-line bg-surface px-4 py-10 text-center text-[13px] text-muted">
          Sem faturamento para exibir. Suba o Mapa de Faturamento na aba <b>Lista analítica</b>.
          {demo && <div className="mt-1 text-[12px]">Modo demonstração: os dados ficam só nesta sessão.</div>}
        </div>
      ) : (
        <>
          {/* ---------------- KPIs ---------------- */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Kpi lbl="Faturado" val={fmtBRL(ind.totalFaturado)} foot={`${ind.qtdNotas} nota${ind.qtdNotas === 1 ? '' : 's'}`} />
            <Kpi lbl="Recebido" val={fmtBRL(ind.recebido)} foot={ind.pctRecebido != null ? `${pct1(ind.pctRecebido)} do faturado` : '—'} />
            <Kpi lbl="A receber" val={fmtBRL(ind.aReceber)} foot="notas em aberto" />
            <Kpi lbl="Ticket médio" val={fmtBRL(ind.ticketMedio)} foot="por nota" />
            <Kpi lbl="Prazo médio receb." val={ind.prazoMedioReceb != null ? `${Math.round(ind.prazoMedioReceb)} dias` : '—'} foot="emissão → pagamento" />
            <Kpi lbl="Clientes" val={fmt0(ind.porCliente.length)} foot={concentracaoTop3 != null ? `top 3 = ${pct1(concentracaoTop3)}` : '—'} />
          </div>

          {/* ---------------- Gráficos ---------------- */}
          <div className="grid grid-cols-12 gap-3">
            <Card className="col-span-12 xl:col-span-8" titulo="Evolução do faturamento" sub="Valor faturado por mês de emissão">
              <AreaFaturamento serie={ind.porMes} />
            </Card>

            <Card className="col-span-12 xl:col-span-4" titulo="Faturado × Recebido × A receber" sub={ind.pctRecebido != null ? `${pct1(ind.pctRecebido)} já recebido` : ''}>
              <ComposicaoRecebimento recebido={ind.recebido} aReceber={ind.aReceber} total={ind.totalFaturado} />
            </Card>

            <Card className="col-span-12 xl:col-span-7" titulo="Faturamento por unidade de negócio" sub="Participação de cada origem (Publi)">
              <BarrasUnidade itens={ind.porUnidade} total={ind.totalFaturado} />
            </Card>

            <Card className="col-span-12 xl:col-span-5" titulo="Top clientes e concentração" sub="6 maiores + demais agrupados">
              <TopClientes itens={donut} total={ind.totalFaturado} />
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

/* ============================== KPI ============================== */
function Kpi({ lbl, val, foot }: { lbl: string; val: string; foot: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-surface px-3 py-2">
      <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: GRAD_KPI }} />
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted">{lbl}</div>
      <div className="mt-0.5 text-[18px] font-extrabold leading-tight tnum text-ink">{val}</div>
      <div className="text-[10px] text-muted">{foot}</div>
    </div>
  )
}

/* ============================== Card ============================== */
function Card({ titulo, sub, className, children }: { titulo: string; sub?: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={`rounded-xl border border-line bg-surface p-4 ${className ?? ''}`}>
      <div className="mb-3">
        <div className="text-[13px] font-bold text-ink">{titulo}</div>
        {sub && <div className="text-[11px] text-muted">{sub}</div>}
      </div>
      {children}
    </section>
  )
}

/* ================= Evolução mensal (área) ================= */
function AreaFaturamento({ serie }: { serie: SerieMes[] }) {
  const W = 760, H = 250
  const padL = 46, padR = 14, padT = 16, padB = 34
  const iw = W - padL - padR
  const ih = H - padT - padB
  const n = serie.length
  const max = Math.max(1, ...serie.map((s) => s.valor))
  const xs = (i: number) => (n <= 1 ? padL + iw / 2 : padL + (i / (n - 1)) * iw)
  const ys = (v: number) => padT + ih - (v / max) * ih
  const pts = serie.map((s, i) => `${xs(i).toFixed(1)},${ys(s.valor).toFixed(1)}`)
  const line = pts.length ? `M${pts.join(' L')}` : ''
  const area = pts.length ? `M${xs(0).toFixed(1)},${(padT + ih).toFixed(1)} L${pts.join(' L')} L${xs(n - 1).toFixed(1)},${(padT + ih).toFixed(1)} Z` : ''
  const grid = [0, 0.25, 0.5, 0.75, 1]
  const passoLbl = n > 12 ? Math.ceil(n / 12) : 1

  return (
    <div style={{ width: '100%' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} role="img" aria-label="Evolução do faturamento por mês">
        <defs>
          <linearGradient id="fatArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COR_FAT} stopOpacity="0.28" />
            <stop offset="100%" stopColor={COR_FAT} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {grid.map((g) => {
          const y = padT + ih - g * ih
          return (
            <g key={g}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#EDE9E2" strokeWidth="1" />
              <text x={padL - 8} y={y + 3.5} textAnchor="end" fontSize="10" fill="#9b8f82">{fmtCompacto(max * g)}</text>
            </g>
          )
        })}
        {area && <path d={area} fill="url(#fatArea)" />}
        {line && <path d={line} fill="none" stroke={COR_FAT} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />}
        {serie.map((s, i) => (
          <g key={s.mes}>
            <circle cx={xs(i)} cy={ys(s.valor)} r="3.4" fill="#fff" stroke={COR_FAT} strokeWidth="2">
              <title>{`${s.label}: ${fmtBRL(s.valor)} · ${s.qtd} nota(s)`}</title>
            </circle>
            {i % passoLbl === 0 && (
              <text x={xs(i)} y={H - 12} textAnchor="middle" fontSize="10" fill="#77706a">{s.label}</text>
            )}
          </g>
        ))}
      </svg>
    </div>
  )
}

/* ============ Faturado × Recebido × A receber ============ */
function ComposicaoRecebimento({ recebido, aReceber, total }: { recebido: number; aReceber: number; total: number }) {
  const pRec = total ? (recebido / total) * 100 : 0
  const pAR = total ? (aReceber / total) * 100 : 0
  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Total faturado</span>
          <span className="text-[15px] font-extrabold tnum text-ink">{fmtBRL(total)}</span>
        </div>
        <div className="flex h-4 w-full overflow-hidden rounded-full bg-[#EFEAE2]">
          <div style={{ width: `${pRec}%`, background: COR_REC }} title={`Recebido: ${fmtBRL(recebido)}`} />
          <div style={{ width: `${pAR}%`, background: COR_AREC }} title={`A receber: ${fmtBRL(aReceber)}`} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <LegVal cor={COR_REC} lbl="Recebido" val={recebido} pct={pRec} />
        <LegVal cor={COR_AREC} lbl="A receber" val={aReceber} pct={pAR} />
      </div>
    </div>
  )
}
function LegVal({ cor, lbl, val, pct }: { cor: string; lbl: string; val: number; pct: number }) {
  return (
    <div className="rounded-lg border border-line bg-paper px-3 py-2">
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: cor }} />
        <span className="text-[11px] font-bold text-muted">{lbl}</span>
      </div>
      <div className="mt-0.5 text-[15px] font-extrabold tnum text-ink">{fmtBRL(val)}</div>
      <div className="text-[10px] text-muted">{pct1(pct)}</div>
    </div>
  )
}

/* ============ Por unidade de negócio (barras) ============ */
function BarrasUnidade({ itens, total }: { itens: Fatia[]; total: number }) {
  const max = Math.max(1, ...itens.map((i) => i.valor))
  if (!itens.length) return <div className="py-6 text-center text-[12px] text-muted">Sem dados de unidade.</div>
  return (
    <div className="flex flex-col gap-2.5">
      {itens.map((it, i) => (
        <div key={it.nome}>
          <div className="mb-0.5 flex items-baseline justify-between gap-2">
            <span className="truncate text-[12px] font-semibold text-ink" title={it.nome}>{it.nome}</span>
            <span className="tnum whitespace-nowrap text-[12px] font-bold text-ink">
              {fmtBRL(it.valor)} <span className="text-[10px] font-semibold text-muted">· {total ? pct1((it.valor / total) * 100) : '—'}</span>
            </span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-[#EFEAE2]">
            <div className="h-full rounded-full" style={{ width: `${(it.valor / max) * 100}%`, minWidth: 3, background: PAL[i % PAL.length] }} title={`${it.qtd} nota(s)`} />
          </div>
        </div>
      ))}
    </div>
  )
}

/* ============ Top clientes + concentração (donut) ============ */
function TopClientes({ itens, total }: { itens: Fatia[]; total: number }) {
  const size = 176, r = 66, cx = size / 2, cy = size / 2, sw = 26
  const circ = 2 * Math.PI * r
  let acc = 0
  const segs = itens.map((it, i) => {
    const frac = total ? it.valor / total : 0
    const seg = frac * circ
    const node = (
      <circle
        key={it.nome}
        cx={cx} cy={cy} r={r} fill="none"
        stroke={PAL[i % PAL.length]} strokeWidth={sw}
        strokeDasharray={`${seg.toFixed(2)} ${(circ - seg).toFixed(2)}`}
        strokeDashoffset={(-acc).toFixed(2)}
        transform={`rotate(-90 ${cx} ${cy})`}
      >
        <title>{`${it.nome}: ${fmtBRL(it.valor)} (${total ? pct1((it.valor / total) * 100) : '—'})`}</title>
      </circle>
    )
    acc += seg
    return node
  })
  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-none" style={{ width: size, maxWidth: '55%' }}>
        <svg viewBox={`0 0 ${size} ${size}`} width="100%">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#EFEAE2" strokeWidth={sw} />
          {segs}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Total</span>
          <span className="text-[13px] font-extrabold tnum text-ink">{fmtCompacto(total)}</span>
        </div>
      </div>
      <ul className="flex-1 space-y-1.5 self-stretch">
        {itens.map((it, i) => (
          <li key={it.nome} className="flex items-center gap-2 text-[12px]">
            <span className="inline-block h-2.5 w-2.5 flex-none rounded-sm" style={{ background: PAL[i % PAL.length] }} />
            <span className="min-w-0 flex-1 truncate text-ink" title={it.nome}>{it.nome}</span>
            <span className="tnum whitespace-nowrap font-bold text-ink">{total ? pct1((it.valor / total) * 100) : '—'}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ============================ estilos ============================ */
function ScopedStyle() {
  return (
    <style>{`
.fatind .periodo-sel{font:inherit;font-size:12px;font-weight:700;color:#1F2937;background:#fff;border:1px solid #DBE4EF;border-radius:7px;padding:5px 7px;cursor:pointer}
.fatind .periodo-sel:focus{outline:2px solid #122238;border-color:#122238}
.fatind .seg{display:inline-flex;background:#EEEAE3;border-radius:9px;padding:3px;gap:2px}
.fatind .seg button{border:0;background:transparent;font:inherit;font-size:12px;font-weight:700;color:#7a756c;padding:5px 13px;border-radius:7px;cursor:pointer;white-space:nowrap}
.fatind .seg button.on{background:#fff;color:#1F2937;box-shadow:0 1px 2px rgba(0,0,0,.08)}
`}</style>
  )
}
