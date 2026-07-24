import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../auth/AuthContext'
import {
  MESES,
  sum12,
  fmt0,
  fmtCompacto,
  computeSeries,
  totalPorCategoria,
  topDescricoes,
  loadFluxo,
  type Lancamento,
} from './fluxoData'

const VERDE = '#15805A'
const VERMELHO = '#C0392B'

export function Indicadores() {
  const { mode } = useAuth()
  const [rows, setRows] = useState<Lancamento[]>([])
  const [saldoInicial, setSaldoInicial] = useState(0)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

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

  const m = useMemo(() => {
    const s = computeSeries(rows, saldoInicial)
    const catEnt = totalPorCategoria(s.d.ent)
    const catSai = totalPorCategoria(s.d.sai)
    const topCli = topDescricoes(s.d.entD, 6)
    const topPag = topDescricoes(s.d.saiD, 6)
    const totR = sum12(s.receb)
    const totP = sum12(s.pag)
    const minSaldo = Math.min(...s.saldo)
    const minIdx = s.saldo.indexOf(minSaldo)
    const queimas = s.resultado.filter((r) => r < 0).map((r) => -r)
    const queimaMedia = queimas.length ? queimas.reduce((a, b) => a + b, 0) / queimas.length : 0
    const runway = queimaMedia > 0 ? saldoInicial / queimaMedia : null
    return { s, catEnt, catSai, topCli, topPag, totR, totP, minSaldo, minIdx, queimaMedia, runway, anos: s.d.years.join(' / ') }
  }, [rows, saldoInicial])

  const vazio = rows.length === 0

  if (loading) {
    return <div className="grid place-items-center rounded-2xl border border-line bg-surface py-20 text-sm text-muted">Carregando indicadores…</div>
  }
  if (erro) {
    return <div className="rounded-lg border border-neg/30 bg-red-50 px-4 py-3 text-sm font-medium text-neg">{erro}</div>
  }
  if (vazio) {
    return (
      <div className="grid place-items-center gap-2 rounded-2xl border border-dashed border-line bg-surface/60 px-6 py-16 text-center">
        <p className="font-serif text-lg text-ink">Sem dados para indicadores ainda.</p>
        <p className="max-w-md text-sm text-muted">Carregue a base no módulo <b>Fluxo de Caixa</b> (botão “Atualizar base”) e os indicadores aparecerão aqui automaticamente.</p>
      </div>
    )
  }

  const { s } = m

  return (
    <div className="flex flex-col gap-4" style={{ width: 'min(1400px, 95vw)', position: 'relative', left: '50%', transform: 'translateX(-50%)' }}>
      <div>
        <h2 className="font-serif text-xl font-semibold text-ink">Indicadores do Fluxo de Caixa</h2>
        <p className="text-[13px] text-muted">Gerados a partir da base de caixa{m.anos ? ` · exercício ${m.anos}` : ''}.</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi lbl="Saldo Final projetado" val={s.saldo[11]} cor={s.saldo[11] < 0 ? VERMELHO : undefined} foot="Ao fim do período" />
        <Kpi lbl="Resultado de Caixa" val={m.totR - m.totP} cor={m.totR - m.totP < 0 ? VERMELHO : VERDE} foot="Recebimentos − Pagamentos" />
        <Kpi lbl="Menor saldo do período" val={m.minSaldo} cor={m.minSaldo < 0 ? VERMELHO : undefined} foot={`Mês mais apertado: ${MESES[m.minIdx]}`} />
        <Kpi lbl="Queima média / mês" val={m.queimaMedia} cor={m.queimaMedia > 0 ? VERMELHO : undefined} foot="Média dos meses no negativo" />
        <KpiTexto lbl="Meses de caixa" valor={m.runway === null ? '—' : m.runway.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} foot={m.runway === null ? 'Sem queima média' : 'Saldo inicial ÷ queima média'} />
      </div>

      {/* Evolução do saldo */}
      <Card titulo="Evolução do Saldo de Caixa" sub="Saldo projetado ao fim de cada mês">
        <AreaSaldo saldo={s.saldo} minIdx={m.minIdx} />
      </Card>

      {/* Entradas x Saídas por mês */}
      <Card titulo="Recebimentos × Pagamentos por mês" sub="Comparativo mensal de entradas e saídas de caixa">
        <Legenda itens={[{ cor: VERDE, txt: 'Recebimentos' }, { cor: VERMELHO, txt: 'Pagamentos' }]} />
        <BarrasMensais receb={s.receb} pag={s.pag} />
      </Card>

      {/* Composição por categoria */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card titulo="Composição dos Recebimentos" sub="Por categoria (ano)">
          <BarrasHorizontais itens={m.catEnt} cor={VERDE} total={m.totR} />
        </Card>
        <Card titulo="Composição dos Pagamentos" sub="Por categoria (ano)">
          <BarrasHorizontais itens={m.catSai} cor={VERMELHO} total={m.totP} />
        </Card>
      </div>

      {/* Rankings */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card titulo="Top Clientes (recebimentos)" sub="Maiores entradas por descrição (ano)">
          <BarrasHorizontais itens={m.topCli} cor={VERDE} total={m.totR} />
        </Card>
        <Card titulo="Maiores Pagamentos" sub="Maiores saídas por descrição (ano)">
          <BarrasHorizontais itens={m.topPag} cor={VERMELHO} total={m.totP} />
        </Card>
      </div>

      {mode !== 'supabase' && (
        <div className="text-[12px] text-amber-700">Modo demonstração — sem dados persistidos.</div>
      )}
    </div>
  )
}

/* =============================== peças =============================== */
function Card({ titulo, sub, children }: { titulo: string; sub?: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
      <div className="mb-3">
        <h3 className="text-[15px] font-bold text-ink">{titulo}</h3>
        {sub && <p className="text-[12px] text-muted">{sub}</p>}
      </div>
      {children}
    </div>
  )
}

function Kpi({ lbl, val, cor, foot }: { lbl: string; val: number; cor?: string; foot: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-surface px-4 py-3">
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: cor ?? 'rgb(var(--brand))' }} />
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted">{lbl}</div>
      <div className="mt-1 text-[19px] font-extrabold tnum" style={{ color: cor ?? undefined }}>R$ {fmt0(val)}</div>
      <div className="mt-0.5 text-[11px] text-muted">{foot}</div>
    </div>
  )
}
function KpiTexto({ lbl, valor, foot }: { lbl: string; valor: string; foot: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-surface px-4 py-3">
      <span className="absolute inset-y-0 left-0 w-1 bg-band" />
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted">{lbl}</div>
      <div className="mt-1 text-[19px] font-extrabold tnum text-ink">{valor}</div>
      <div className="mt-0.5 text-[11px] text-muted">{foot}</div>
    </div>
  )
}

function Legenda({ itens }: { itens: { cor: string; txt: string }[] }) {
  return (
    <div className="mb-3 flex flex-wrap gap-4">
      {itens.map((i) => (
        <span key={i.txt} className="flex items-center gap-1.5 text-[12px] text-muted">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: i.cor }} />
          {i.txt}
        </span>
      ))}
    </div>
  )
}

/** Área do saldo (SVG responsivo). */
function AreaSaldo({ saldo, minIdx }: { saldo: number[]; minIdx: number }) {
  const W = 860
  const H = 260
  const padL = 6
  const padR = 6
  const padT = 22
  const padB = 24
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const n = saldo.length
  const vmax = Math.max(0, ...saldo)
  const vmin = Math.min(0, ...saldo)
  const range = vmax - vmin || 1
  const xs = (i: number) => padL + (innerW * i) / (n - 1)
  const ys = (v: number) => padT + innerH * (1 - (v - vmin) / range)
  const zeroY = ys(0)
  const pts = saldo.map((v, i) => `${xs(i)},${ys(v)}`).join(' ')
  const area = `M ${xs(0)},${zeroY} L ${pts} L ${xs(n - 1)},${zeroY} Z`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', height: 'auto' }} role="img" aria-label="Evolução do saldo de caixa">
      {/* linha zero */}
      <line x1={padL} y1={zeroY} x2={W - padR} y2={zeroY} stroke="#CBD5E1" strokeWidth={1} strokeDasharray="4 4" />
      <text x={padL} y={zeroY - 3} fontSize={10} fill="#94A3B8">0</text>
      {/* área + linha */}
      <path d={area} style={{ fill: 'rgb(var(--brand))', fillOpacity: 0.12 }} />
      <polyline points={pts} fill="none" style={{ stroke: 'rgb(var(--brand))' }} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {/* pontos + rótulos de mês */}
      {saldo.map((v, i) => {
        const neg = v < 0
        const destaque = i === minIdx || i === n - 1
        return (
          <g key={i}>
            <circle cx={xs(i)} cy={ys(v)} r={destaque ? 4 : 2.6} fill={neg ? VERMELHO : VERDE} />
            {destaque && (
              <text x={xs(i)} y={ys(v) + (v >= 0 ? -8 : 14)} fontSize={10.5} fontWeight={700} textAnchor="middle" fill={neg ? VERMELHO : '#0B2545'}>
                {fmtCompacto(v)}
              </text>
            )}
            <text x={xs(i)} y={H - 8} fontSize={10.5} textAnchor="middle" fill="#64748B">{MESES[i]}</text>
          </g>
        )
      })}
    </svg>
  )
}

/** Barras verticais agrupadas por mês (recebimentos × pagamentos). */
function BarrasMensais({ receb, pag }: { receb: number[]; pag: number[] }) {
  const maxVal = Math.max(1, ...receb, ...pag)
  return (
    <div>
      <div className="flex h-[190px] items-end gap-1.5">
        {MESES.map((mes, i) => (
          <div key={mes} className="flex h-full flex-1 items-end justify-center gap-[3px]">
            <div className="w-1/3 rounded-t-sm" style={{ height: `${(receb[i] / maxVal) * 100}%`, background: VERDE }} title={`Recebimentos ${mes}: R$ ${fmt0(receb[i])}`} />
            <div className="w-1/3 rounded-t-sm" style={{ height: `${(pag[i] / maxVal) * 100}%`, background: VERMELHO }} title={`Pagamentos ${mes}: R$ ${fmt0(pag[i])}`} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1.5">
        {MESES.map((mes) => (
          <div key={mes} className="flex-1 text-center text-[10px] text-muted">{mes}</div>
        ))}
      </div>
    </div>
  )
}

/** Lista de barras horizontais (categorias / rankings). */
function BarrasHorizontais({ itens, cor, total }: { itens: { nome: string; valor: number }[]; cor: string; total: number }) {
  if (!itens.length) return <p className="text-[13px] text-muted">Sem dados.</p>
  const max = itens[0].valor || 1
  return (
    <div className="flex flex-col gap-2">
      {itens.map((it) => (
        <div key={it.nome} className="flex items-center gap-2 text-[12px]">
          <div className="w-[34%] shrink-0 truncate text-ink" title={it.nome}>{it.nome}</div>
          <div className="h-4 flex-1 overflow-hidden rounded bg-paper">
            <div className="h-full rounded" style={{ width: `${(it.valor / max) * 100}%`, background: cor, minWidth: 2 }} />
          </div>
          <div className="w-[66px] shrink-0 text-right font-semibold tnum text-ink">{fmtCompacto(it.valor)}</div>
          <div className="w-[38px] shrink-0 text-right tnum text-muted">{total ? Math.round((it.valor / total) * 100) : 0}%</div>
        </div>
      ))}
    </div>
  )
}
