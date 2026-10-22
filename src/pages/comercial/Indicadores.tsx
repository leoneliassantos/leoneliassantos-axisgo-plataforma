/**
 * Indicadores Comerciais — Expectativa de Receita.
 *
 * Soma o valor potencial dos leads do pipeline distribuído no tempo (a partir
 * do plano de receita de cada lead: mensal mês a mês, ou anual num ano). Dois
 * modos de leitura: Total bruto (valor cheio) ou Ponderado pela probabilidade
 * (valor × probabilidade do lead). Leads "Fechado perdido" são ignorados.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Select } from './ui'
import { loadLeads } from './leadsData'
import { brl, brlc, MESES_LABEL, normalizaMeses, type Lead } from './data'

type Modo = 'bruto' | 'ponderado'

/** Quanto um lead contribui em cada mês (Jan..Dez) de um ano (só modo mensal). */
function contribMeses(l: Lead, ano: number): number[] {
  const r = l.receita
  if (r?.modo === 'mensal' && r.ano === ano) return normalizaMeses(r.meses)
  return Array<number>(12).fill(0)
}
/** Quanto um lead contribui no total de um ano (mensal = soma; anual = valor). */
function contribAno(l: Lead, ano: number): number {
  const r = l.receita
  if (!r || r.modo === 'unico' || r.ano !== ano) return 0
  if (r.modo === 'mensal') return normalizaMeses(r.meses).reduce((s, v) => s + v, 0)
  return Number(r.valorAnual) || 0
}
/** Leads sem período definido (valor único / sem plano) entram só no pipeline geral. */
function semPeriodo(l: Lead): boolean {
  return !l.receita || l.receita.modo === 'unico'
}

export function Indicadores() {
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [leads, setLeads] = useState<Lead[]>([])

  const anoAtual = new Date().getFullYear()
  const ANOS = [anoAtual, anoAtual + 1, anoAtual + 2, anoAtual + 3]
  const [ano, setAno] = useState(anoAtual)
  const [modo, setModo] = useState<Modo>('bruto')

  const carregar = useCallback(async () => {
    setLoading(true); setErro(null)
    try { setLeads(await loadLeads()) }
    catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao carregar.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const m = useMemo(() => {
    // Ignora leads perdidos; peso = 1 (bruto) ou probabilidade/100 (ponderado).
    const ativos = leads.filter((l) => l.etapa !== 'Fechado perdido')
    const peso = (l: Lead) => (modo === 'ponderado' ? (Number(l.probabilidade) || 0) / 100 : 1)

    // Mês a mês do ano selecionado (vem dos leads mensais).
    const meses = Array<number>(12).fill(0)
    let anuaisSemMes = 0 // leads anuais do ano (sem mês definido)
    let nOport = 0
    for (const l of ativos) {
      const w = peso(l)
      const cm = contribMeses(l, ano)
      const somaMes = cm.reduce((s, v) => s + v, 0)
      if (somaMes > 0) for (let i = 0; i < 12; i++) meses[i] += cm[i] * w
      if (l.receita?.modo === 'anual' && l.receita.ano === ano) anuaisSemMes += (Number(l.receita.valorAnual) || 0) * w
      if (contribAno(l, ano) > 0) nOport++
    }
    const totalAno = meses.reduce((s, v) => s + v, 0) + anuaisSemMes
    const maxMes = Math.max(1, ...meses)

    // Visão por ano (todos os anos) + balde "sem período".
    const porAno = ANOS.map((a) => ({
      ano: a,
      valor: ativos.reduce((s, l) => s + contribAno(l, a) * peso(l), 0),
    }))
    const semAno = ativos.filter(semPeriodo).reduce((s, l) => s + (Number(l.valorPotencial) || 0) * peso(l), 0)
    const maxAno = Math.max(1, ...porAno.map((x) => x.valor), semAno)

    const pipelineGeral = porAno.reduce((s, x) => s + x.valor, 0) + semAno
    const ticket = nOport ? totalAno / nOport : 0

    return { meses, anuaisSemMes, totalAno, maxMes, porAno, semAno, maxAno, pipelineGeral, ticket, nOport }
  }, [leads, ano, modo, ANOS])

  if (loading) return <div className="py-20 text-center text-muted">Carregando…</div>
  if (erro) return <div className="mx-auto mt-10 max-w-lg rounded-xl border border-neg/30 bg-neg/5 p-5 text-center text-neg">{erro}</div>

  const legenda = modo === 'ponderado' ? 'valor × probabilidade de cada lead' : 'valor cheio do lead'

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted">Comercial · Indicadores</div>
          <h1 className="mt-1 font-serif text-2xl font-semibold text-ink">Expectativa de Receita</h1>
          <p className="mt-1 text-sm text-muted">Previsão de faturamento do pipeline por período · {legenda}.</p>
        </div>
        <div className="flex items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-[11px] text-muted">Ano</span>
            <Select value={ano} onChange={(e) => setAno(Number(e.target.value))} className="w-28">
              {ANOS.map((a) => <option key={a} value={a}>{a}</option>)}
            </Select>
          </label>
          <div className="flex gap-1.5">
            {(['bruto', 'ponderado'] as Modo[]).map((x) => (
              <button
                key={x}
                type="button"
                onClick={() => setModo(x)}
                className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                  modo === x ? 'border-transparent bg-brand text-white' : 'border-line text-muted hover:bg-paper'
                }`}
              >
                {x === 'bruto' ? 'Total bruto' : 'Ponderado'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {m.pipelineGeral === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-surface p-12 text-center text-muted">
          Sem expectativa de receita ainda. Cadastre leads no CRM com o valor potencial (mensal ou anual) para ver a previsão aqui.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi titulo={`Esperado em ${ano}`} valor={brl(m.totalAno)} destaque="brand" />
            <Kpi titulo={`Oportunidades em ${ano}`} valor={m.nOport} />
            <Kpi titulo={`Ticket médio em ${ano}`} valor={brl(m.ticket)} />
            <Kpi titulo="Pipeline total (todos os anos)" valor={brl(m.pipelineGeral)} />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Receita esperada mês a mês do ano selecionado */}
            <div className="rounded-2xl border border-line bg-surface p-5 lg:col-span-2">
              <h2 className="mb-1 font-serif text-base font-semibold text-ink">Por mês em {ano}</h2>
              <p className="mb-4 text-[12px] text-muted">A partir dos leads com valor <b>mensal</b> neste ano.</p>
              <div className="space-y-2">
                {MESES_LABEL.map((lbl, i) => (
                  <div key={lbl} className="flex items-center gap-3">
                    <span className="w-9 shrink-0 text-[12px] uppercase tracking-wide text-muted">{lbl}</span>
                    <div className="h-5 flex-1 overflow-hidden rounded bg-paper">
                      <div className="h-full rounded bg-brand" style={{ width: `${(m.meses[i] / m.maxMes) * 100}%`, minWidth: m.meses[i] > 0 ? 6 : 0 }} />
                    </div>
                    <span className="tnum w-24 shrink-0 text-right text-[12px] font-semibold text-ink">{m.meses[i] > 0 ? brl(m.meses[i]) : '—'}</span>
                  </div>
                ))}
              </div>
              {m.anuaisSemMes > 0 && (
                <p className="mt-4 rounded-lg bg-paper px-3 py-2 text-[12px] text-muted">
                  Além dos meses acima, <b className="text-ink">{brl(m.anuaisSemMes)}</b> em {ano} vêm de leads com valor <b>anual</b> (sem mês definido).
                </p>
              )}
            </div>

            {/* Visão por ano */}
            <div className="rounded-2xl border border-line bg-surface p-5">
              <h2 className="mb-1 font-serif text-base font-semibold text-ink">Por ano</h2>
              <p className="mb-4 text-[12px] text-muted">Receita esperada total em cada ano.</p>
              <div className="space-y-3">
                {m.porAno.map(({ ano: a, valor }) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAno(a)}
                    className="block w-full text-left"
                    title={`Ver ${a} mês a mês`}
                  >
                    <div className="flex items-center justify-between text-sm">
                      <span className={`font-medium ${a === ano ? 'text-brand' : 'text-ink'}`}>{a}</span>
                      <span className="tnum text-muted">{brlc(valor)}</span>
                    </div>
                    <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-paper">
                      <div className="h-full rounded-full" style={{ width: `${(valor / m.maxAno) * 100}%`, background: a === ano ? 'rgb(var(--brand))' : '#14252F', minWidth: valor > 0 ? 6 : 0 }} />
                    </div>
                  </button>
                ))}
              </div>
              {m.semAno > 0 && (
                <div className="mt-4 border-t border-line pt-3 text-[12px] text-muted">
                  Sem período definido (valor único): <b className="text-ink">{brl(m.semAno)}</b>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Kpi({ titulo, valor, destaque }: { titulo: string; valor: number | string; destaque?: 'brand' }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
      <div className="text-[12px] uppercase tracking-wide text-muted">{titulo}</div>
      <div className={`mt-1 font-serif text-2xl font-semibold ${destaque === 'brand' ? 'text-brand' : 'text-ink'}`}>{valor}</div>
    </div>
  )
}
