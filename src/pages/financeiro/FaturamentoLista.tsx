import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase, fetchAllRows } from '../../lib/supabase'
import { useAuth } from '../../auth/AuthContext'
import { ModuloTopo } from '../../components/ModuloTopo'
import { readFirstSheetAOA } from '../../lib/xls'
import { parsePubliAOA, MESES_PT, type FaturamentoRow } from './publiFaturamento'

/* ================================================================== *
 *  Faturamento — Lista analítica (base do Publi)
 *  O admin sobe o "Mapa de Faturamento" (.xlsx) do Publi por empresa;
 *  o módulo guarda as colunas A–K no Supabase (uma linha por NF) e lista
 *  com filtros, busca e export. Métrica = VALOR FATURADO (coluna K).
 *  Leitura: todo autenticado · Escrita (upload): admin.
 * ================================================================== */

const CONSOLIDADO = '__consolidado__'
const GRAD_KPI = 'linear-gradient(180deg, #FE9F2E 0%, #FB5403 55%, #F5390A 100%)'
const EMPRESAS_UPLOAD = ['Batuque', 'Batux']
const MESES_FULL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

const fmt0 = (v: number) => Math.round(v).toLocaleString('pt-BR')
const fmtData = (iso: string | null) => {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
const mesLabel = (ym: string) => {
  const [y, m] = ym.split('-')
  return `${MESES_PT[Number(m) - 1]}/${y.slice(2)}`
}

export function FaturamentoLista() {
  const { user, mode } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [rows, setRows] = useState<FaturamentoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [empresaSel, setEmpresaSel] = useState<string>(CONSOLIDADO)
  const [mesSel, setMesSel] = useState('todos')
  const [unidadeSel, setUnidadeSel] = useState('todos')
  const [statusSel, setStatusSel] = useState<'todos' | 'pago' | 'areceber'>('todos')
  const [busca, setBusca] = useState('')
  const [uploadEmpresa, setUploadEmpresa] = useState<string>('Batuque')
  const [uploadAno, setUploadAno] = useState<number>(() => new Date().getFullYear())
  const [uploadMes, setUploadMes] = useState<number>(() => new Date().getMonth() + 1) // 1..12
  const fileRef = useRef<HTMLInputElement>(null)

  // Anos disponíveis para seleção no upload (2023 até o próximo ano).
  const anosUpload = useMemo(() => {
    const atual = new Date().getFullYear()
    const arr: number[] = []
    for (let y = 2023; y <= atual + 1; y++) arr.push(y)
    return arr
  }, [])

  /* ---------- carregar ---------- */
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
      setErro('Não foi possível carregar a base. Verifique se a tabela faturamento foi criada no Supabase (setup/faturamento-sql.html).')
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

  /* ---------- upload do Publi ---------- */
  async function handleFile(file: File) {
    setErro(null)
    setAviso(null)
    setBusy(true)
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const aoa = readFirstSheetAOA(XLSX, buf)
      if (!aoa.length) throw new Error('não consegui ler a planilha (arquivo vazio ou formato não suportado).')
      const parsed = parsePubliAOA(aoa, uploadEmpresa)
      if (!parsed.rows.length) throw new Error('não encontrei faturamentos (linhas com data de Emissão). Confira se é o "Mapa de Faturamento" do Publi.')

      // Atualização SÓ do mês/ano selecionado: fica apenas com as notas dessa
      // competência (mesmo que o arquivo traga outros meses) — os meses
      // fechados nem são tocados no banco.
      const ymAlvo = `${uploadAno}-${String(uploadMes).padStart(2, '0')}`
      const rotuloMes = `${MESES_FULL[uploadMes - 1]}/${uploadAno}`
      const rowsMes = parsed.rows.filter((r) => (r.emissao ?? '').slice(0, 7) === ymAlvo)
      if (!rowsMes.length) {
        const achados = parsed.meses.map(mesLabel).join(', ') || '—'
        throw new Error(`o arquivo não tem notas de ${rotuloMes}. Meses encontrados no arquivo: ${achados}. Selecione um mês presente no arquivo (ou exporte ${rotuloMes} no Publi).`)
      }

      if (mode === 'supabase' && supabase) {
        const payload = rowsMes.map((r) => ({
          cliente: r.cliente, sacado: r.sacado, origem: r.origem, descricao: r.descricao,
          documento: r.documento, ecs: r.ecs, pit: r.pit,
          emissao: r.emissao, vencimento: r.vencimento, pagamento: r.pagamento, valor: r.valor,
        }))
        // faturamento_upload substitui por competência: só o mês enviado é apagado/reinserido.
        const { error } = await supabase.rpc('faturamento_upload', { p_empresa: uploadEmpresa, p_rows: payload })
        if (error) throw new Error(error.message)
        await carregar()
      } else {
        // modo demo: substitui em memória apenas o mês/empresa selecionado
        setRows((prev) => [
          ...prev.filter((r) => !(r.empresa === uploadEmpresa && (r.emissao ?? '').slice(0, 7) === ymAlvo)),
          ...rowsMes,
        ])
      }
      setEmpresaSel(uploadEmpresa)
      setMesSel(ymAlvo)
      const ignorados = parsed.rows.length - rowsMes.length
      const obsIgnorados = ignorados > 0 ? ` (${ignorados} nota(s) de outros meses no arquivo foram ignoradas)` : ''
      setAviso(`${uploadEmpresa}: ${rotuloMes} atualizado — ${rowsMes.length} nota(s). Meses fechados não foram alterados${obsIgnorados}.`)
    } catch (e) {
      setErro(`Não consegui importar a base do Publi: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  /* ---------- derivações ---------- */
  const empresas = useMemo(() => [...new Set(rows.map((r) => r.empresa))].filter(Boolean).sort(), [rows])
  const rowsEmpresa = useMemo(
    () => (empresaSel === CONSOLIDADO ? rows : rows.filter((r) => r.empresa === empresaSel)),
    [rows, empresaSel],
  )
  const meses = useMemo(
    () => [...new Set(rowsEmpresa.map((r) => (r.emissao ?? '').slice(0, 7)))].filter(Boolean).sort().reverse(),
    [rowsEmpresa],
  )
  const unidades = useMemo(() => [...new Set(rowsEmpresa.map((r) => r.origem))].filter(Boolean).sort(), [rowsEmpresa])

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return rowsEmpresa
      .filter((r) => {
        if (mesSel !== 'todos' && (r.emissao ?? '').slice(0, 7) !== mesSel) return false
        if (unidadeSel !== 'todos' && r.origem !== unidadeSel) return false
        if (statusSel === 'pago' && !r.pagamento) return false
        if (statusSel === 'areceber' && r.pagamento) return false
        if (q && !`${r.cliente} ${r.sacado} ${r.descricao} ${r.documento}`.toLowerCase().includes(q)) return false
        return true
      })
      .sort((a, b) => (b.emissao ?? '').localeCompare(a.emissao ?? '') || b.valor - a.valor)
  }, [rowsEmpresa, mesSel, unidadeSel, statusSel, busca])

  const resumo = useMemo(() => {
    const total = filtradas.reduce((s, r) => s + r.valor, 0)
    const recebido = filtradas.filter((r) => r.pagamento).reduce((s, r) => s + r.valor, 0)
    return { total, qtd: filtradas.length, recebido, aReceber: total - recebido }
  }, [filtradas])

  async function exportar() {
    const XLSX = await import('xlsx')
    const head = ['EMPRESA', 'CLIENTE', 'SACADO', 'ORIGEM', 'DESCRIÇÃO', 'DOCUMENTO', 'ECs', 'PIT', 'EMISSÃO', 'VENCIMENTO', 'PAGAMENTO', 'VALOR FATURADO']
    const aoa: unknown[][] = [head]
    for (const r of filtradas)
      aoa.push([r.empresa, r.cliente, r.sacado, r.origem, r.descricao, r.documento, r.ecs, r.pit, fmtData(r.emissao), fmtData(r.vencimento), r.pagamento ? fmtData(r.pagamento) : '', r.valor])
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 30 }, { wch: 16 }, { wch: 34 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 15 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Faturamento')
    XLSX.writeFile(wb, `Faturamento - ${empresaSel === CONSOLIDADO ? 'Consolidado' : empresaSel}.xlsx`)
  }

  const vazio = rows.length === 0
  const demo = mode !== 'supabase'

  return (
    <div className="fat-mod flex flex-col gap-3" style={{ width: '100%' }}>
      <ScopedStyle />

      <ModuloTopo>
        <div className="flex min-h-[64px] flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-serif text-lg font-semibold text-ink">Faturamento</h2>
            <p className="text-[13px] text-muted">
              Base do Publi (Mapa de Faturamento) · uma linha por nota · métrica: Valor Faturado
              {demo ? ' · modo demonstração (sem banco)' : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <button
              className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-[13px] font-bold text-ink transition hover:bg-paper disabled:opacity-50"
              onClick={exportar}
              disabled={busy || vazio}
              title="Exportar a lista filtrada em Excel"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>
              Exportar Excel
            </button>
            {isAdmin && (
              <div className="flex flex-wrap items-end gap-2 rounded-lg border border-line bg-paper px-2 py-1.5">
                <label className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-muted">Empresa</span>
                  <select
                    className="periodo-sel"
                    value={uploadEmpresa}
                    onChange={(e) => setUploadEmpresa(e.target.value)}
                    title="Empresa do arquivo que você vai subir"
                    disabled={busy}
                  >
                    {EMPRESAS_UPLOAD.map((e) => <option key={e} value={e}>{e}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-muted">Ano</span>
                  <select
                    className="periodo-sel"
                    value={uploadAno}
                    onChange={(e) => setUploadAno(Number(e.target.value))}
                    title="Ano da competência que você vai atualizar"
                    disabled={busy}
                  >
                    {anosUpload.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-muted">Mês</span>
                  <select
                    className="periodo-sel"
                    value={uploadMes}
                    onChange={(e) => setUploadMes(Number(e.target.value))}
                    title="Mês da competência que você vai atualizar"
                    disabled={busy}
                  >
                    {MESES_FULL.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </select>
                </label>
                <button
                  className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-[13px] font-bold text-white shadow-brand transition hover:brightness-125 disabled:opacity-50"
                  onClick={() => fileRef.current?.click()}
                  disabled={busy}
                  title={`Enviar o Mapa de Faturamento (.xlsx) e atualizar só ${MESES_FULL[uploadMes - 1]}/${uploadAno} de ${uploadEmpresa}`}
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21V9" /><path d="m7 14 5-5 5 5" /><path d="M5 3h14" /></svg>
                  {busy ? 'Processando…' : 'Subir base do mês'}
                </button>
              </div>
            )}
            <input ref={fileRef} type="file" accept=".xls,.xlsx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} />
          </div>
        </div>

        {!vazio && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi lbl="Faturado" val={resumo.total} foot={`${resumo.qtd} nota(s)`} />
            <Kpi lbl="Recebido" val={resumo.recebido} foot={resumo.total ? `${Math.round((resumo.recebido / resumo.total) * 100)}% do faturado` : '—'} />
            <Kpi lbl="A receber" val={resumo.aReceber} foot="notas em aberto" />
            <Kpi lbl="Ticket médio" val={resumo.qtd ? resumo.total / resumo.qtd : 0} foot="por nota" />
          </div>
        )}

        {!vazio && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-4 py-2.5">
            <div className="seg flex-wrap">
              <button className={empresaSel === CONSOLIDADO ? 'on' : ''} onClick={() => setEmpresaSel(CONSOLIDADO)} title="Todas as empresas">Consolidado</button>
              {empresas.map((e) => (
                <button key={e} className={empresaSel === e ? 'on' : ''} onClick={() => setEmpresaSel(e)} title={e}>{e}</button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select className="periodo-sel" value={mesSel} onChange={(e) => setMesSel(e.target.value)} title="Mês de emissão">
                <option value="todos">Todos os meses</option>
                {meses.map((m) => <option key={m} value={m}>{mesLabel(m)}</option>)}
              </select>
              <select className="periodo-sel" value={unidadeSel} onChange={(e) => setUnidadeSel(e.target.value)} title="Unidade de negócio">
                <option value="todos">Todas as unidades</option>
                {unidades.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
              <select className="periodo-sel" value={statusSel} onChange={(e) => setStatusSel(e.target.value as typeof statusSel)} title="Situação">
                <option value="todos">Pago + A receber</option>
                <option value="pago">Só pagos</option>
                <option value="areceber">Só a receber</option>
              </select>
              <input className="busca" placeholder="Buscar cliente, evento, NF…" value={busca} onChange={(e) => setBusca(e.target.value)} />
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
          Nenhum faturamento ainda.{isAdmin ? ' Selecione empresa, ano e mês e use “Subir base do mês” para carregar o Mapa de Faturamento.' : ' Peça a um administrador para subir a base do Publi.'}
          {demo && <div className="mt-1 text-[12px]">Modo demonstração: os dados ficam só nesta sessão.</div>}
        </div>
      ) : (
        <div className="fat-scroller">
          <table className="fat">
            <thead>
              <tr>
                <th className="l">Cliente</th>
                <th className="l">Sacado</th>
                <th className="l">Unidade</th>
                <th className="l">Descrição (evento)</th>
                <th>NF</th>
                <th className="l">ECs</th>
                <th className="l">PIT</th>
                <th>Emissão</th>
                <th>Vencimento</th>
                <th>Pagamento</th>
                <th>Situação</th>
                <th className="col-total">Valor Faturado</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((r, i) => (
                <tr key={i}>
                  <td className="l strong">{r.cliente}</td>
                  <td className="l">{r.sacado}</td>
                  <td className="l">{r.origem}</td>
                  <td className="l">{r.descricao}</td>
                  <td className="tnum">{r.documento}</td>
                  <td className="l muted">{r.ecs || '—'}</td>
                  <td className="l muted">{r.pit || '—'}</td>
                  <td className="tnum">{fmtData(r.emissao)}</td>
                  <td className="tnum">{fmtData(r.vencimento)}</td>
                  <td className="tnum">{fmtData(r.pagamento)}</td>
                  <td>
                    <span className={`chip ${r.pagamento ? 'pago' : 'areceber'}`}>{r.pagamento ? 'Pago' : 'A receber'}</span>
                  </td>
                  <td className="tnum col-total">{fmt0(r.valor)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="l" colSpan={11}>Total ({resumo.qtd} nota{resumo.qtd === 1 ? '' : 's'})</td>
                <td className="tnum col-total">{fmt0(resumo.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

/* ------------------------------- KPI ------------------------------- */
function Kpi({ lbl, val, foot }: { lbl: string; val: number; foot: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-surface px-3 py-2">
      <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: GRAD_KPI }} />
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted">{lbl}</div>
      <div className="mt-0.5 text-[18px] font-extrabold leading-tight tnum text-ink">R$ {fmt0(val)}</div>
      <div className="text-[10px] text-muted">{foot}</div>
    </div>
  )
}

/* ------------------------------ estilos ----------------------------- */
function ScopedStyle() {
  return (
    <style>{`
.fat-mod .busca{font:inherit;font-size:12px;font-weight:600;color:#1F2937;background:#fff;border:1px solid #DBE4EF;border-radius:7px;padding:5px 9px;min-width:190px}
.fat-mod .busca:focus{outline:2px solid #122238;border-color:#122238}
.fat-mod .periodo-sel{font:inherit;font-size:12px;font-weight:700;color:#1F2937;background:#fff;border:1px solid #DBE4EF;border-radius:7px;padding:5px 7px;cursor:pointer}
.fat-mod .periodo-sel:focus{outline:2px solid #122238;border-color:#122238}
.fat-mod .seg{display:inline-flex;background:#EEEAE3;border-radius:9px;padding:3px;gap:2px}
.fat-mod .seg button{border:0;background:transparent;font:inherit;font-size:12px;font-weight:700;color:#7a756c;padding:5px 13px;border-radius:7px;cursor:pointer;white-space:nowrap}
.fat-mod .seg button.on{background:#fff;color:#1F2937;box-shadow:0 1px 2px rgba(0,0,0,.08)}
.fat-mod .fat-scroller{overflow:auto;border:1px solid #E7E2DA;border-radius:14px;background:#fff;max-height:calc(100vh - var(--topo-h,150px) - 40px)}
.fat-mod table.fat{border-collapse:separate;border-spacing:0;width:100%;min-width:1180px;font-size:12.5px}
.fat-mod table.fat th,.fat-mod table.fat td{padding:7px 10px;text-align:right;white-space:nowrap;border-bottom:1px solid #F0EEEC}
.fat-mod table.fat th.l,.fat-mod table.fat td.l{text-align:left}
.fat-mod table.fat thead th{position:sticky;top:0;z-index:2;background:#EEF3F9;color:#4B5563;font-size:11px;text-transform:uppercase;letter-spacing:.4px;font-weight:700;border-bottom:2px solid #DBE4EF}
.fat-mod table.fat td.strong{font-weight:700;color:#1F2937;max-width:230px;overflow:hidden;text-overflow:ellipsis}
.fat-mod table.fat td.l{max-width:240px;overflow:hidden;text-overflow:ellipsis}
.fat-mod table.fat td.muted{color:#9aa0a6}
.fat-mod table.fat tbody tr:hover td{background:#F8FAFC}
.fat-mod table.fat td.col-total,.fat-mod table.fat th.col-total{background:rgb(18 34 56 / 0.05);font-weight:800;border-left:1px solid #DBE4EF;color:#122238}
.fat-mod table.fat tfoot td{position:sticky;bottom:0;background:#EEF3F9;font-weight:800;color:#122238;border-top:2px solid #DBE4EF}
.fat-mod .chip{display:inline-block;font-size:10.5px;font-weight:800;padding:2px 8px;border-radius:999px;text-transform:uppercase;letter-spacing:.3px}
.fat-mod .chip.pago{background:#E6F4EA;color:#15734F}
.fat-mod .chip.areceber{background:#FDECDD;color:#B4530E}
`}</style>
  )
}
