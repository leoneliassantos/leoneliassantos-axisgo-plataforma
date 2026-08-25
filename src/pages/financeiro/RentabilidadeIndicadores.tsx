import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, fetchAllRows } from '../../lib/supabase'
import { useAuth } from '../../auth/AuthContext'
import { ModuloTopo } from '../../components/ModuloTopo'
import {
  buildIndicadoresMargem, TAXA_GANHO_TRIB_PADRAO, MESES_FULL, type MargemJob,
} from './margemJob'

/* ================================================================== *
 *  Rentabilidade de Projetos — Indicadores
 *  Lê a MESMA base (margem_job) da Lista e agrega: margem por cliente
 *  (participação + margem), por unidade de negócio e evolução mensal.
 *  Gráficos em barras CSS (sem lib). Leitura: todo autenticado.
 * ================================================================== */

const CONSOLIDADO = '__consolidado__'
const GRAD_KPI = 'linear-gradient(180deg, #FE9F2E 0%, #FB5403 55%, #F5390A 100%)'
const BAR = 'linear-gradient(90deg, #FB5403, #FE9F2E)'
const BAR2 = 'linear-gradient(90deg, #122238, #33507a)'

const fmt0 = (v: number) => Math.round(v).toLocaleString('pt-BR')
const fmtPct = (f: number) => `${(f * 100).toFixed(1).replace('.', ',')}%`

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

export function RentabilidadeIndicadores() {
  const { mode } = useAuth()
  const demo = mode !== 'supabase'
  const [jobs, setJobs] = useState<MargemJob[]>([])
  const [taxa, setTaxa] = useState(TAXA_GANHO_TRIB_PADRAO)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [empresaSel, setEmpresaSel] = useState(CONSOLIDADO)
  const [mesIni, setMesIni] = useState('')
  const [mesFim, setMesFim] = useState('')

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

  const empresas = useMemo(() => [...new Set(jobs.map((j) => j.empresa))].filter(Boolean).sort(), [jobs])
  const jobsEmp = useMemo(() => empresaSel === CONSOLIDADO ? jobs : jobs.filter((j) => j.empresa === empresaSel), [jobs, empresaSel])
  const mesesDisp = useMemo(() => [...new Set(jobsEmp.map((j) => (j.data ?? '').slice(0, 7)))].filter(Boolean).sort(), [jobsEmp])

  const jobsPer = useMemo(() => jobsEmp.filter((j) => {
    const ym = (j.data ?? '').slice(0, 7)
    if (mesIni && ym && ym < mesIni) return false
    if (mesFim && ym && ym > mesFim) return false
    return true
  }), [jobsEmp, mesIni, mesFim])

  const ind = useMemo(() => buildIndicadoresMargem(jobsPer, taxa), [jobsPer, taxa])

  const vazio = jobs.length === 0
  const maxMesFat = Math.max(1, ...ind.porMes.map((m) => m.faturado))
  const optMes = (ym: string) => `${MESES_FULL[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`

  return (
    <div className="rind-mod flex flex-col gap-3" style={{ width: '100%' }}>
      <ScopedStyle />
      <ModuloTopo>
        <div className="flex min-h-[56px] flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-serif text-lg font-semibold text-ink">Rentabilidade · Indicadores</h2>
            <p className="text-[13px] text-muted">Margem por cliente, por unidade de negócio e evolução{demo ? ' · modo demonstração' : ''}</p>
          </div>
          {!vazio && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="seg flex-wrap">
                <button className={empresaSel === CONSOLIDADO ? 'on' : ''} onClick={() => setEmpresaSel(CONSOLIDADO)}>Consolidado</button>
                {empresas.map((e) => <button key={e} className={empresaSel === e ? 'on' : ''} onClick={() => setEmpresaSel(e)}>{e}</button>)}
              </div>
              <select className="sel" value={mesIni} onChange={(e) => setMesIni(e.target.value)} title="De (mês)">
                <option value="">Início</option>{mesesDisp.map((m) => <option key={m} value={m}>{optMes(m)}</option>)}
              </select>
              <span className="text-muted text-xs">até</span>
              <select className="sel" value={mesFim} onChange={(e) => setMesFim(e.target.value)} title="Até (mês)">
                <option value="">Fim</option>{mesesDisp.map((m) => <option key={m} value={m}>{optMes(m)}</option>)}
              </select>
            </div>
          )}
        </div>

        {!vazio && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <Kpi lbl="Faturado" val={`R$ ${fmt0(ind.totalFaturado)}`} foot={`${ind.qtd} job(s)`} />
            <Kpi lbl="Custo /impostos" val={`R$ ${fmt0(ind.totalCusto)}`} foot="total" />
            <Kpi lbl="Receita" val={`R$ ${fmt0(ind.totalReceita)}`} foot="faturado − custo" />
            <Kpi lbl="Margem 1" val={fmtPct(ind.margem1)} foot="receita ÷ faturado" />
            <Kpi lbl="Ganho tributário" val={`R$ ${fmt0(ind.totalGanhoTrib)}`} foot={`${fmtPct(taxa)} dos encargos`} />
            <Kpi lbl="Margem 2" val={fmtPct(ind.margem2)} foot="c/ ganho tributário" />
          </div>
        )}
      </ModuloTopo>

      {erro && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] font-semibold text-red-700">{erro}</div>}

      {loading ? (
        <div className="rounded-xl border border-line bg-surface px-4 py-10 text-center text-[13px] text-muted">Carregando…</div>
      ) : vazio ? (
        <div className="rounded-xl border border-line bg-surface px-4 py-10 text-center text-[13px] text-muted">Sem dados para indicadores. Carregue a base na aba Lista.</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {/* Margem por cliente */}
          <Card titulo="Margem por cliente" sub="participação na receita · margem 1">
            <div className="barlist">
              {ind.porCliente.map((c) => (
                <div key={c.nome} className="brow">
                  <div className="bnome" title={c.nome}>{c.nome}</div>
                  <div className="btrack"><span className="bfill" style={{ width: `${Math.max(2, c.participacao * 100)}%`, background: BAR }} /></div>
                  <div className="bpart tnum">{fmtPct(c.participacao)}</div>
                  <div className="bval tnum">R$ {fmt0(c.receita)}</div>
                  <div className={`bmarg tnum ${c.margem1 < 0 ? 'neg' : ''}`}>{fmtPct(c.margem1)}</div>
                </div>
              ))}
            </div>
            <div className="brow head"><div className="bnome">Cliente</div><div className="btrack" /><div className="bpart">Part.</div><div className="bval">Receita</div><div className="bmarg">Margem</div></div>
          </Card>

          {/* Por unidade de negócio */}
          <Card titulo="Por unidade de negócio" sub="faturado, receita e margem">
            <div className="barlist">
              {ind.porUnidade.map((u) => {
                const maxFat = Math.max(1, ...ind.porUnidade.map((x) => x.faturado))
                return (
                  <div key={u.nome} className="brow">
                    <div className="bnome" title={u.nome}>{u.nome}</div>
                    <div className="btrack"><span className="bfill" style={{ width: `${Math.max(2, (u.faturado / maxFat) * 100)}%`, background: BAR2 }} /></div>
                    <div className="bpart tnum">R$ {fmt0(u.faturado)}</div>
                    <div className="bval tnum">R$ {fmt0(u.receita)}</div>
                    <div className={`bmarg tnum ${u.margem1 < 0 ? 'neg' : ''}`}>{fmtPct(u.margem1)}</div>
                  </div>
                )
              })}
            </div>
            <div className="brow head"><div className="bnome">Unidade</div><div className="btrack" /><div className="bpart">Faturado</div><div className="bval">Receita</div><div className="bmarg">Margem</div></div>
          </Card>

          {/* Evolução mensal */}
          <Card titulo="Evolução mensal" sub="faturado e margem por mês" full>
            <div className="colchart">
              {ind.porMes.map((m) => (
                <div key={m.mes} className="col">
                  <div className="colval tnum">{fmtPct(m.margem1)}</div>
                  <div className="colbar-wrap">
                    <div className="colbar" style={{ height: `${Math.max(3, (m.faturado / maxMesFat) * 100)}%` }} title={`Faturado R$ ${fmt0(m.faturado)} · Receita R$ ${fmt0(m.receita)}`} />
                  </div>
                  <div className="collbl">{m.label}</div>
                  <div className="colfat tnum">R$ {fmt0(m.faturado)}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
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
function Card({ titulo, sub, full, children }: { titulo: string; sub?: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={`rounded-xl border border-line bg-surface p-4 ${full ? 'lg:col-span-2' : ''}`}>
      <div className="mb-3">
        <div className="font-serif text-[15px] font-semibold text-ink">{titulo}</div>
        {sub && <div className="text-[11px] text-muted">{sub}</div>}
      </div>
      {children}
    </div>
  )
}

function ScopedStyle() {
  return (
    <style>{`
.rind-mod .sel{font:inherit;font-size:12px;font-weight:700;color:#1F2937;background:#fff;border:1px solid #DBE4EF;border-radius:7px;padding:5px 7px;cursor:pointer}
.rind-mod .seg{display:inline-flex;background:#EEEAE3;border-radius:9px;padding:3px;gap:2px}
.rind-mod .seg button{border:0;background:transparent;font:inherit;font-size:12px;font-weight:700;color:#7a756c;padding:5px 13px;border-radius:7px;cursor:pointer;white-space:nowrap}
.rind-mod .seg button.on{background:#fff;color:#1F2937;box-shadow:0 1px 2px rgba(0,0,0,.08)}
.rind-mod .barlist{display:flex;flex-direction:column;gap:7px}
.rind-mod .brow{display:grid;grid-template-columns:130px 1fr 62px 100px 62px;align-items:center;gap:8px;font-size:12px}
.rind-mod .brow.head{margin-top:8px;padding-top:7px;border-top:1px solid #EEE9E1;color:#9aa0a6;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.3px}
.rind-mod .bnome{font-weight:700;color:#1F2937;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rind-mod .btrack{height:14px;background:#F0ECE4;border-radius:7px;overflow:hidden}
.rind-mod .bfill{display:block;height:100%;border-radius:7px}
.rind-mod .bpart,.rind-mod .bval,.rind-mod .bmarg{text-align:right;font-weight:700;color:#334155}
.rind-mod .bmarg{color:#B4530E}
.rind-mod .bmarg.neg{color:#C0392B}
.rind-mod .colchart{display:flex;align-items:flex-end;gap:10px;height:210px;padding-top:8px;overflow-x:auto}
.rind-mod .col{flex:1;min-width:56px;display:flex;flex-direction:column;align-items:center;height:100%}
.rind-mod .colval{font-size:11px;font-weight:800;color:#B4530E;margin-bottom:3px}
.rind-mod .colbar-wrap{flex:1;width:100%;display:flex;align-items:flex-end;justify-content:center}
.rind-mod .colbar{width:60%;min-width:22px;background:linear-gradient(180deg,#FE9F2E,#FB5403);border-radius:6px 6px 0 0}
.rind-mod .collbl{font-size:11px;font-weight:700;color:#4B5563;margin-top:6px}
.rind-mod .colfat{font-size:10px;color:#9aa0a6}
`}</style>
  )
}
