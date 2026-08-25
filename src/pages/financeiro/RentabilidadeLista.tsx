import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase, fetchAllRows } from '../../lib/supabase'
import { useAuth } from '../../auth/AuthContext'
import { ModuloTopo } from '../../components/ModuloTopo'
import {
  calcularJob, competenciaDaData,
  TAXA_GANHO_TRIB_PADRAO, UNIDADES_NEGOCIO, EMPRESAS, MESES_FULL,
  type MargemJob,
} from './margemJob'

/* ================================================================== *
 *  Rentabilidade de Projetos — Lista analítica (Margem Job)
 *  Migra a rotina do Excel: o admin lança/edita cada job (ou importa a
 *  planilha na carga inicial) e a plataforma calcula as margens.
 *  Campos calculados (não se digita): Receita, Margem 1, Ganho
 *  tributário, Margem c/ encargos, Margem 2.
 * ================================================================== */

const CONSOLIDADO = '__consolidado__'
const GRAD_KPI = 'linear-gradient(180deg, #FE9F2E 0%, #FB5403 55%, #F5390A 100%)'

const fmt0 = (v: number) => Math.round(v).toLocaleString('pt-BR')
const fmtPct = (f: number) => `${(f * 100).toFixed(1).replace('.', ',')}%`
const fmtData = (iso: string | null) => {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
const parseNum = (s: string) => {
  const v = Number(String(s).replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''))
  return isFinite(v) ? v : 0
}

/* mapeamento banco <-> app */
type DbRow = {
  id?: number; empresa: string; cliente: string; data: string | null; competencia: string | null
  pit: string | null; ec: string | null; unidade_negocio: string | null; campanha: string | null
  valor_faturado: number; custo_total: number; encargos: number
}
const fromDb = (r: DbRow): MargemJob => ({
  id: r.id, empresa: r.empresa ?? '', cliente: r.cliente ?? '', data: r.data ?? null,
  competencia: r.competencia ?? '', pit: r.pit ?? '', ec: r.ec ?? '',
  unidadeNegocio: r.unidade_negocio ?? '', campanha: r.campanha ?? '',
  valorFaturado: Number(r.valor_faturado) || 0, custoTotal: Number(r.custo_total) || 0, encargos: Number(r.encargos) || 0,
})
const toDb = (j: MargemJob) => ({
  empresa: j.empresa, cliente: j.cliente, data: j.data, competencia: j.competencia,
  pit: j.pit, ec: j.ec, unidade_negocio: j.unidadeNegocio, campanha: j.campanha,
  valor_faturado: j.valorFaturado, custo_total: j.custoTotal, encargos: j.encargos,
})

const jobVazio = (): MargemJob => ({
  empresa: 'Batuque', cliente: '', data: null, competencia: '', pit: '', ec: '',
  unidadeNegocio: '', campanha: '', valorFaturado: 0, custoTotal: 0, encargos: 0,
})

export function RentabilidadeLista() {
  const { user, mode } = useAuth()
  const isAdmin = user?.role === 'admin'
  const demo = mode !== 'supabase'

  const [jobs, setJobs] = useState<MargemJob[]>([])
  const [taxa, setTaxa] = useState(TAXA_GANHO_TRIB_PADRAO)
  const [taxaEdit, setTaxaEdit] = useState<string>((TAXA_GANHO_TRIB_PADRAO * 100).toString())
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [empresaSel, setEmpresaSel] = useState(CONSOLIDADO)
  const [mesSel, setMesSel] = useState('todos')
  const [unidadeSel, setUnidadeSel] = useState('todos')
  const [busca, setBusca] = useState('')
  const [form, setForm] = useState<MargemJob | null>(null) // modal de lançar/editar

  /* ---------- carregar ---------- */
  const carregar = useCallback(async () => {
    setLoading(true); setErro(null)
    if (demo || !supabase) { setLoading(false); return }
    const [{ data, error }, cfg] = await Promise.all([
      fetchAllRows<DbRow>((from, to) =>
        supabase!.from('margem_job')
          .select('id, empresa, cliente, data, competencia, pit, ec, unidade_negocio, campanha, valor_faturado, custo_total, encargos')
          .order('data', { ascending: false }).order('id').range(from, to)),
      supabase!.from('margem_config').select('taxa_ganho_trib').eq('id', 1).maybeSingle(),
    ])
    if (error) {
      setErro('Não foi possível carregar a base. Verifique se as tabelas foram criadas no Supabase (setup/margem-job-sql.html).')
      setLoading(false); return
    }
    setJobs((data ?? []).map(fromDb))
    const t = cfg.data?.taxa_ganho_trib
    if (t != null) { setTaxa(Number(t)); setTaxaEdit((Number(t) * 100).toString()) }
    setLoading(false)
  }, [demo])

  useEffect(() => { carregar() }, [carregar])

  /* ---------- salvar taxa ---------- */
  async function salvarTaxa() {
    const nova = parseNum(taxaEdit) / 100
    if (!(nova >= 0 && nova <= 5)) { setErro('Taxa inválida. Informe um percentual (ex.: 52).'); return }
    setBusy(true); setErro(null); setAviso(null)
    try {
      if (!demo && supabase) {
        const { error } = await supabase.from('margem_config').update({ taxa_ganho_trib: nova, atualizado_em: new Date().toISOString() }).eq('id', 1)
        if (error) throw new Error(error.message)
      }
      setTaxa(nova)
      setAviso(`Taxa do ganho tributário atualizada para ${fmtPct(nova)}.`)
    } catch (e) { setErro(`Não consegui salvar a taxa: ${(e as Error).message}`) } finally { setBusy(false) }
  }

  /* ---------- salvar job (novo/editar) ---------- */
  async function salvarJob(j: MargemJob) {
    setBusy(true); setErro(null); setAviso(null)
    try {
      if (!j.cliente.trim()) throw new Error('informe o Cliente.')
      if (!demo && supabase) {
        if (j.id) {
          const { error } = await supabase.from('margem_job').update(toDb(j)).eq('id', j.id)
          if (error) throw new Error(error.message)
        } else {
          const { error } = await supabase.from('margem_job').insert(toDb(j))
          if (error) throw new Error(error.message)
        }
        await carregar()
      } else {
        setJobs((prev) => j.id ? prev.map((x) => (x.id === j.id ? j : x)) : [...prev, { ...j, id: Date.now() }])
      }
      setForm(null)
      setAviso(j.id ? 'Lançamento atualizado.' : 'Lançamento adicionado.')
    } catch (e) { setErro(`Não consegui salvar: ${(e as Error).message}`) } finally { setBusy(false) }
  }

  /* ---------- excluir job ---------- */
  async function excluirJob(j: MargemJob) {
    const ok = window.confirm(`Excluir este lançamento?\n\n${j.empresa} · ${j.cliente}\n${j.campanha || '—'} · ${fmtData(j.data)} · R$ ${fmt0(j.valorFaturado)}\n\nEsta ação não pode ser desfeita.`)
    if (!ok) return
    setBusy(true); setErro(null); setAviso(null)
    try {
      if (!demo && supabase && j.id) {
        const { error } = await supabase.from('margem_job').delete().eq('id', j.id)
        if (error) throw new Error(error.message)
        await carregar()
      } else {
        setJobs((prev) => prev.filter((x) => x !== j && x.id !== j.id))
      }
      setAviso('Lançamento excluído.')
    } catch (e) { setErro(`Não consegui excluir: ${(e as Error).message}`) } finally { setBusy(false) }
  }

  /* ---------- derivações ---------- */
  const empresas = useMemo(() => [...new Set(jobs.map((j) => j.empresa))].filter(Boolean).sort(), [jobs])
  const clientes = useMemo(() => [...new Set(jobs.map((j) => j.cliente))].filter(Boolean).sort(), [jobs])
  const jobsEmp = useMemo(() => empresaSel === CONSOLIDADO ? jobs : jobs.filter((j) => j.empresa === empresaSel), [jobs, empresaSel])
  const meses = useMemo(() => [...new Set(jobsEmp.map((j) => (j.data ?? '').slice(0, 7)))].filter(Boolean).sort().reverse(), [jobsEmp])
  const unidades = useMemo(() => [...new Set(jobsEmp.map((j) => j.unidadeNegocio))].filter(Boolean).sort(), [jobsEmp])

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return jobsEmp
      .filter((j) => {
        if (mesSel !== 'todos' && (j.data ?? '').slice(0, 7) !== mesSel) return false
        if (unidadeSel !== 'todos' && j.unidadeNegocio !== unidadeSel) return false
        if (q && !`${j.cliente} ${j.campanha} ${j.pit} ${j.ec}`.toLowerCase().includes(q)) return false
        return true
      })
      .map((j) => calcularJob(j, taxa))
      .sort((a, b) => (b.data ?? '').localeCompare(a.data ?? '') || b.valorFaturado - a.valorFaturado)
  }, [jobsEmp, mesSel, unidadeSel, busca, taxa])

  const resumo = useMemo(() => {
    const faturado = filtrados.reduce((s, j) => s + j.valorFaturado, 0)
    const custo = filtrados.reduce((s, j) => s + j.custoTotal, 0)
    const receita = filtrados.reduce((s, j) => s + j.receita, 0)
    const ganho = filtrados.reduce((s, j) => s + j.ganhoTrib, 0)
    const margEnc = filtrados.reduce((s, j) => s + j.margemEncargos, 0)
    return {
      faturado, custo, receita, ganho, margEnc, qtd: filtrados.length,
      margem1: faturado ? receita / faturado : 0,
      margem2: faturado ? margEnc / faturado : 0,
    }
  }, [filtrados])

  async function exportar() {
    const XLSX = await import('xlsx')
    const head = ['EMPRESA', 'CLIENTE', 'DATA', 'COMPETÊNCIA', 'PIT', 'EC', 'UNIDADE DE NEGÓCIO', 'CAMPANHA',
      'VALOR FATURADO', 'CUSTO TOTAL /IMPOSTOS', 'RECEITA', 'MARGEM 1', 'ENCARGOS', 'GANHO TRIBUTÁRIO', 'MARGEM C/ ENCARGOS', 'MARGEM 2']
    const aoa: unknown[][] = [head]
    for (const j of filtrados)
      aoa.push([j.empresa, j.cliente, fmtData(j.data), j.competencia, j.pit, j.ec, j.unidadeNegocio, j.campanha,
        j.valorFaturado, j.custoTotal, j.receita, j.margem1, j.encargos, j.ganhoTrib, j.margemEncargos, j.margem2])
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Margem Job')
    XLSX.writeFile(wb, `Rentabilidade - ${empresaSel === CONSOLIDADO ? 'Consolidado' : empresaSel}.xlsx`)
  }

  const vazio = jobs.length === 0

  return (
    <div className="rent-mod flex flex-col gap-3" style={{ width: '100%' }}>
      <ScopedStyle />

      <ModuloTopo>
        <div className="flex min-h-[64px] flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-serif text-lg font-semibold text-ink">Rentabilidade de Projetos</h2>
            <p className="text-[13px] text-muted">
              Margem por job · receita e margens calculadas automaticamente
              {demo ? ' · modo demonstração (sem banco)' : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <button className="botao-sec" onClick={exportar} disabled={busy || vazio} title="Exportar a lista filtrada em Excel">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>
              Exportar
            </button>
            {isAdmin && (
              <>
                <div className="flex items-end gap-1.5 rounded-lg border border-line bg-paper px-2 py-1.5">
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-muted">Ganho trib. (%)</span>
                    <input className="taxa-inp" value={taxaEdit} onChange={(e) => setTaxaEdit(e.target.value)}
                      title="Ganho tributário estimado sobre os encargos" disabled={busy} />
                  </label>
                  <button className="botao-sec !py-1.5" onClick={salvarTaxa}
                    disabled={busy || parseNum(taxaEdit) / 100 === taxa} title="Salvar a taxa e recalcular">Salvar</button>
                </div>
                <button className="botao-pri" onClick={() => setForm(jobVazio())} disabled={busy} title="Adicionar um novo job">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
                  Novo lançamento
                </button>
              </>
            )}
          </div>
        </div>

        {!vazio && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <Kpi lbl="Faturado" val={`R$ ${fmt0(resumo.faturado)}`} foot={`${resumo.qtd} job(s)`} />
            <Kpi lbl="Custo /impostos" val={`R$ ${fmt0(resumo.custo)}`} foot="total de custos" />
            <Kpi lbl="Receita" val={`R$ ${fmt0(resumo.receita)}`} foot="faturado − custo" />
            <Kpi lbl="Margem 1" val={fmtPct(resumo.margem1)} foot="receita ÷ faturado" />
            <Kpi lbl="Ganho tributário" val={`R$ ${fmt0(resumo.ganho)}`} foot={`${fmtPct(taxa)} dos encargos`} />
            <Kpi lbl="Margem 2" val={fmtPct(resumo.margem2)} foot="c/ ganho tributário" />
          </div>
        )}

        {!vazio && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-4 py-2.5">
            <div className="seg flex-wrap">
              <button className={empresaSel === CONSOLIDADO ? 'on' : ''} onClick={() => setEmpresaSel(CONSOLIDADO)}>Consolidado</button>
              {empresas.map((e) => <button key={e} className={empresaSel === e ? 'on' : ''} onClick={() => setEmpresaSel(e)}>{e}</button>)}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select className="sel" value={mesSel} onChange={(e) => setMesSel(e.target.value)} title="Mês">
                <option value="todos">Todos os meses</option>
                {meses.map((m) => <option key={m} value={m}>{MESES_FULL[Number(m.slice(5, 7)) - 1]}/{m.slice(2, 4)}</option>)}
              </select>
              <select className="sel" value={unidadeSel} onChange={(e) => setUnidadeSel(e.target.value)} title="Unidade de Negócio">
                <option value="todos">Todas as unidades</option>
                {unidades.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
              <input className="busca" placeholder="Buscar cliente, campanha, PIT…" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
          </div>
        )}
      </ModuloTopo>

      {erro && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] font-semibold text-red-700">{erro}</div>}
      {aviso && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-[13px] font-semibold text-emerald-700">{aviso}</div>}

      {loading ? (
        <div className="rounded-xl border border-line bg-surface px-4 py-10 text-center text-[13px] text-muted">Carregando…</div>
      ) : vazio ? (
        <div className="rounded-xl border border-line bg-surface px-4 py-10 text-center text-[13px] text-muted">
          Nenhum job ainda.{isAdmin ? ' Use “Novo lançamento” para cadastrar um job.' : ' Peça a um administrador para carregar a base.'}
          {demo && <div className="mt-1 text-[12px]">Modo demonstração: os dados ficam só nesta sessão.</div>}
        </div>
      ) : (
        <div className="rent-scroller">
          <table className="rent">
            <thead>
              <tr>
                <th className="l">Cliente</th>
                <th className="l">Empresa</th>
                <th>Data</th>
                <th className="l">Unidade</th>
                <th className="l">Campanha</th>
                <th>Faturado</th>
                <th>Custo /imp.</th>
                <th className="calc">Receita</th>
                <th className="calc">Margem 1</th>
                <th>Encargos</th>
                <th className="calc">Ganho trib.</th>
                <th className="calc">Marg. c/ enc.</th>
                <th className="calc col-total">Margem 2</th>
                {isAdmin && <th className="col-acao" aria-label="Ações"></th>}
              </tr>
            </thead>
            <tbody>
              {filtrados.map((j, i) => (
                <tr key={j.id ?? i}>
                  <td className="l strong">{j.cliente}</td>
                  <td className="l">{j.empresa}</td>
                  <td className="tnum">{fmtData(j.data)}</td>
                  <td className="l">{j.unidadeNegocio || '—'}</td>
                  <td className="l">{j.campanha || '—'}</td>
                  <td className="tnum">{fmt0(j.valorFaturado)}</td>
                  <td className="tnum">{fmt0(j.custoTotal)}</td>
                  <td className="tnum calc">{fmt0(j.receita)}</td>
                  <td className="tnum calc"><span className={`pct ${j.margem1 < 0 ? 'neg' : ''}`}>{fmtPct(j.margem1)}</span></td>
                  <td className="tnum">{fmt0(j.encargos)}</td>
                  <td className="tnum calc">{fmt0(j.ganhoTrib)}</td>
                  <td className="tnum calc">{fmt0(j.margemEncargos)}</td>
                  <td className="tnum calc col-total"><span className={`pct ${j.margem2 < 0 ? 'neg' : ''}`}>{fmtPct(j.margem2)}</span></td>
                  {isAdmin && (
                    <td className="col-acao">
                      <div className="flex items-center justify-center gap-1">
                        <button className="mini" onClick={() => setForm(j)} title="Editar" aria-label="Editar">
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                        </button>
                        <button className="mini del" onClick={() => excluirJob(j)} title="Excluir" aria-label="Excluir">
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="l" colSpan={5}>Total ({resumo.qtd} job{resumo.qtd === 1 ? '' : 's'})</td>
                <td className="tnum">{fmt0(resumo.faturado)}</td>
                <td className="tnum">{fmt0(resumo.custo)}</td>
                <td className="tnum calc">{fmt0(resumo.receita)}</td>
                <td className="tnum calc">{fmtPct(resumo.margem1)}</td>
                <td className="tnum">—</td>
                <td className="tnum calc">{fmt0(resumo.ganho)}</td>
                <td className="tnum calc">{fmt0(resumo.margEnc)}</td>
                <td className="tnum calc col-total">{fmtPct(resumo.margem2)}</td>
                {isAdmin && <td className="col-acao"></td>}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {form && (
        <FormJob
          inicial={form}
          taxa={taxa}
          clientes={clientes}
          onCancel={() => setForm(null)}
          onSave={salvarJob}
          busy={busy}
        />
      )}
    </div>
  )
}

/* ------------------------------- KPI ------------------------------- */
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

/* --------------------------- Form (modal) --------------------------- */
function FormJob({ inicial, taxa, clientes, onCancel, onSave, busy }:
  { inicial: MargemJob; taxa: number; clientes: string[]; onCancel: () => void; onSave: (j: MargemJob) => void; busy: boolean }) {
  const [j, setJ] = useState<MargemJob>(inicial)
  const [unidadeOutro, setUnidadeOutro] = useState(inicial.unidadeNegocio !== '' && !UNIDADES_NEGOCIO.includes(inicial.unidadeNegocio))
  const set = (patch: Partial<MargemJob>) => setJ((p) => ({ ...p, ...patch }))
  const calc = calcularJob(j, taxa)
  const editando = Boolean(inicial.id)

  const setData = (v: string) => {
    const iso = v || null
    set({ data: iso, competencia: j.competencia || competenciaDaData(iso) })
  }

  return createPortal(
    <div className="rent-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="rent-modal" role="dialog" aria-modal="true">
        <div className="rmb-head">
          <h3>{editando ? 'Editar lançamento' : 'Novo lançamento'}</h3>
          <button className="mini" onClick={onCancel} aria-label="Fechar">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="rmb-body">
          <div className="grid-form">
            <L t="Empresa"><select className="inp" value={j.empresa} onChange={(e) => set({ empresa: e.target.value })}>{EMPRESAS.map((e) => <option key={e}>{e}</option>)}</select></L>
            <L t="Cliente" wide>
              <input className="inp" list="rent-clientes" value={j.cliente} onChange={(e) => set({ cliente: e.target.value })} placeholder="Nome do cliente" />
              <datalist id="rent-clientes">{clientes.map((c) => <option key={c} value={c} />)}</datalist>
            </L>
            <L t="Data"><input className="inp" type="date" value={j.data ?? ''} onChange={(e) => setData(e.target.value)} /></L>
            <L t="Competência">
              <select className="inp" value={j.competencia} onChange={(e) => set({ competencia: e.target.value })}>
                <option value="">—</option>{MESES_FULL.map((m) => <option key={m}>{m}</option>)}
              </select>
            </L>
            <L t="Unidade de Negócio">
              <select className="inp" value={unidadeOutro ? '__outro__' : j.unidadeNegocio}
                onChange={(e) => { if (e.target.value === '__outro__') { setUnidadeOutro(true); set({ unidadeNegocio: '' }) } else { setUnidadeOutro(false); set({ unidadeNegocio: e.target.value }) } }}>
                <option value="">—</option>
                {UNIDADES_NEGOCIO.map((u) => <option key={u}>{u}</option>)}
                <option value="__outro__">Outros…</option>
              </select>
              {unidadeOutro && <input className="inp mt-1" value={j.unidadeNegocio} onChange={(e) => set({ unidadeNegocio: e.target.value })} placeholder="Digite a unidade" />}
            </L>
            <L t="PIT"><input className="inp" value={j.pit} onChange={(e) => set({ pit: e.target.value })} /></L>
            <L t="EC"><input className="inp" value={j.ec} onChange={(e) => set({ ec: e.target.value })} /></L>
            <L t="Campanha" wide><input className="inp" value={j.campanha} onChange={(e) => set({ campanha: e.target.value })} placeholder="Nome do evento/campanha" /></L>
            <L t="Valor Faturado (R$)"><input className="inp tnum" inputMode="decimal" value={j.valorFaturado || ''} onChange={(e) => set({ valorFaturado: parseNum(e.target.value) })} /></L>
            <L t="Custo Total /Impostos (R$)"><input className="inp tnum" inputMode="decimal" value={j.custoTotal || ''} onChange={(e) => set({ custoTotal: parseNum(e.target.value) })} /></L>
            <L t="Encargos (R$)"><input className="inp tnum" inputMode="decimal" value={j.encargos || ''} onChange={(e) => set({ encargos: parseNum(e.target.value) })} /></L>
          </div>

          <div className="calc-box">
            <div className="cb-tit">Calculado automaticamente</div>
            <div className="cb-grid">
              <CB t="Receita" v={`R$ ${fmt0(calc.receita)}`} />
              <CB t="Margem 1" v={fmtPct(calc.margem1)} hi />
              <CB t={`Ganho trib. (${fmtPct(taxa)})`} v={`R$ ${fmt0(calc.ganhoTrib)}`} />
              <CB t="Margem c/ encargos" v={`R$ ${fmt0(calc.margemEncargos)}`} />
              <CB t="Margem 2" v={fmtPct(calc.margem2)} hi />
            </div>
          </div>
        </div>

        <div className="rmb-foot">
          <button className="botao-sec" onClick={onCancel} disabled={busy}>Cancelar</button>
          <button className="botao-pri" onClick={() => onSave(j)} disabled={busy}>{busy ? 'Salvando…' : editando ? 'Salvar alterações' : 'Adicionar'}</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
function L({ t, wide, children }: { t: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={`flex flex-col gap-1 ${wide ? 'col-span-2' : ''}`}><span className="lbl">{t}</span>{children}</label>
}
function CB({ t, v, hi }: { t: string; v: string; hi?: boolean }) {
  return <div className={`cb ${hi ? 'hi' : ''}`}><div className="cb-t">{t}</div><div className="cb-v tnum">{v}</div></div>
}

/* ------------------------------ estilos ----------------------------- */
function ScopedStyle() {
  return (
    <style>{`
.rent-mod .busca{font:inherit;font-size:12px;font-weight:600;color:#1F2937;background:#fff;border:1px solid #DBE4EF;border-radius:7px;padding:5px 9px;min-width:190px}
.rent-mod .busca:focus{outline:2px solid #122238;border-color:#122238}
.rent-mod .sel,.rent-mod .taxa-inp{font:inherit;font-size:12px;font-weight:700;color:#1F2937;background:#fff;border:1px solid #DBE4EF;border-radius:7px;padding:5px 7px;cursor:pointer}
.rent-mod .taxa-inp{width:56px;text-align:right;cursor:text}
.rent-mod .sel:focus,.rent-mod .taxa-inp:focus{outline:2px solid #122238;border-color:#122238}
.rent-mod .seg{display:inline-flex;background:#EEEAE3;border-radius:9px;padding:3px;gap:2px}
.rent-mod .seg button{border:0;background:transparent;font:inherit;font-size:12px;font-weight:700;color:#7a756c;padding:5px 13px;border-radius:7px;cursor:pointer;white-space:nowrap}
.rent-mod .seg button.on{background:#fff;color:#1F2937;box-shadow:0 1px 2px rgba(0,0,0,.08)}
.rent-mod .botao-sec{display:inline-flex;align-items:center;gap:7px;border:1px solid #DBE4EF;background:#fff;color:#1F2937;border-radius:9px;padding:9px 14px;font:inherit;font-size:13px;font-weight:700;cursor:pointer;transition:.12s}
.rent-mod .botao-sec:hover:not(:disabled){background:#F3F6FA}
.rent-mod .botao-pri{display:inline-flex;align-items:center;gap:7px;border:0;background:var(--brand,#FB5403);color:#fff;border-radius:9px;padding:9px 15px;font:inherit;font-size:13px;font-weight:800;cursor:pointer;transition:.12s;box-shadow:0 2px 8px rgba(251,84,3,.28)}
.rent-mod .botao-pri:hover:not(:disabled){filter:brightness(1.08)}
.rent-mod .botao-sec:disabled,.rent-mod .botao-pri:disabled{opacity:.5;cursor:default}
.rent-mod .rent-scroller{overflow:auto;border:1px solid #E7E2DA;border-radius:14px;background:#fff;max-height:calc(100vh - var(--topo-h,150px) - 40px)}
.rent-mod table.rent{border-collapse:separate;border-spacing:0;width:100%;min-width:1240px;font-size:12.5px}
.rent-mod table.rent th,.rent-mod table.rent td{padding:7px 10px;text-align:right;white-space:nowrap;border-bottom:1px solid #F0EEEC}
.rent-mod table.rent th.l,.rent-mod table.rent td.l{text-align:left}
.rent-mod table.rent thead th{position:sticky;top:0;z-index:2;background:#EEF3F9;color:#4B5563;font-size:10.5px;text-transform:uppercase;letter-spacing:.3px;font-weight:700;border-bottom:2px solid #DBE4EF}
.rent-mod table.rent thead th.calc{background:#FBEFE7;color:#9a4a1e}
.rent-mod table.rent td.calc{background:rgb(251 84 3 / 0.035)}
.rent-mod table.rent td.strong{font-weight:700;color:#1F2937;max-width:220px;overflow:hidden;text-overflow:ellipsis}
.rent-mod table.rent td.l{max-width:210px;overflow:hidden;text-overflow:ellipsis}
.rent-mod table.rent tbody tr:hover td{background:#F8FAFC}
.rent-mod table.rent tbody tr:hover td.calc{background:#FBEEE5}
.rent-mod table.rent td.col-total,.rent-mod table.rent th.col-total{font-weight:800;border-left:1px solid #F0D6C4;color:#B4530E}
.rent-mod table.rent .pct.neg{color:#C0392B}
.rent-mod table.rent tfoot td{position:sticky;bottom:0;background:#EEF3F9;font-weight:800;color:#122238;border-top:2px solid #DBE4EF}
.rent-mod table.rent tfoot td.calc{background:#FBEFE7}
.rent-mod table.rent th.col-acao,.rent-mod table.rent td.col-acao{width:74px;text-align:center;padding:4px 6px}
.rent-mod .mini{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:1px solid #DBE4EF;border-radius:7px;background:#fff;color:#334155;cursor:pointer;transition:.12s}
.rent-mod .mini:hover{background:#F3F6FA}
.rent-mod .mini.del{border-color:#F0D2D2;color:#B91C1C}
.rent-mod .mini.del:hover{background:#FEECEC}
/* modal */
.rent-modal-back{position:fixed;inset:0;background:rgba(18,34,56,.45);display:flex;align-items:flex-start;justify-content:center;padding:5vh 16px;z-index:60;backdrop-filter:blur(2px)}
.rent-modal{background:#fff;border-radius:16px;width:100%;max-width:720px;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 24px 60px rgba(18,34,56,.3);overflow:hidden}
.rent-modal .rmb-head{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #EEE9E1}
.rent-modal .rmb-head h3{font-family:Georgia,serif;font-size:18px;font-weight:600;margin:0;color:#1F2937}
.rent-modal .rmb-body{padding:18px 20px;overflow-y:auto}
.rent-modal .grid-form{display:grid;grid-template-columns:1fr 1fr;gap:12px 14px}
.rent-modal .lbl{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#8a8578}
.rent-modal .inp{font:inherit;font-size:13px;font-weight:600;color:#1F2937;background:#fff;border:1px solid #DBE4EF;border-radius:8px;padding:8px 10px;width:100%}
.rent-modal .inp:focus{outline:2px solid var(--brand,#FB5403);border-color:var(--brand,#FB5403)}
.rent-modal .col-span-2{grid-column:span 2}
.rent-modal .calc-box{margin-top:16px;border:1px solid #F0D6C4;background:#FDF6F1;border-radius:12px;padding:12px 14px}
.rent-modal .cb-tit{font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#B4530E;margin-bottom:8px}
.rent-modal .cb-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}
.rent-modal .cb{background:#fff;border:1px solid #F0DBCB;border-radius:9px;padding:7px 9px}
.rent-modal .cb.hi{background:#FB5403;border-color:#FB5403}
.rent-modal .cb.hi .cb-t,.rent-modal .cb.hi .cb-v{color:#fff}
.rent-modal .cb-t{font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.3px;color:#9a8f83;line-height:1.2}
.rent-modal .cb-v{font-size:15px;font-weight:800;color:#1F2937;margin-top:2px}
.rent-modal .rmb-foot{display:flex;justify-content:flex-end;gap:10px;padding:14px 20px;border-top:1px solid #EEE9E1;background:#FBFAF7}
@media (max-width:560px){.rent-modal .grid-form{grid-template-columns:1fr}.rent-modal .col-span-2{grid-column:span 1}.rent-modal .cb-grid{grid-template-columns:repeat(2,1fr)}}
`}</style>
  )
}
