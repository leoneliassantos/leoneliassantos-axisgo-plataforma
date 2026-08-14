import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { supabase, fetchAllRows } from '../../lib/supabase'
import { useAuth } from '../../auth/AuthContext'
import { ModuloTopo } from '../../components/ModuloTopo'

/* ================================================================== *
 *  Fluxo de Caixa — módulo do Financeiro
 *  Dados persistidos no Supabase (tabela public.fluxo_caixa + config).
 *  Leitura: todo usuário autenticado · Escrita (upload/saldo): admin.
 *  A base NUNCA fica no repositório — é carregada via upload pelo admin.
 * ================================================================== */

interface Lancamento {
  tipo: 'ENTRADA' | 'SAÍDA'
  desc: string
  cat: string
  valor: number
  data: string // 'YYYY-MM-DD'
}

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

/* ------------------------------- utils ------------------------------- */
const z12 = () => new Array(12).fill(0) as number[]
const sum12 = (a: number[]) => a.reduce((s, v) => s + v, 0)

function fmt(v: number): string {
  // Sem centavos, para os valores caberem 100% na tela (arredonda ao inteiro).
  if (Math.abs(v) < 0.5) return '—'
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
function fmtSaldo(v: number): string {
  // Campo de saldo mantém os centavos (não estoura e preserva a precisão ao salvar).
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function numClass(v: number): string {
  if (Math.abs(v) < 0.005) return 'zero'
  return v < 0 ? 'neg' : ''
}
function parseBR(s: string | number): number {
  if (typeof s === 'number') return s
  let t = (s || '').toString().trim().replace(/\s|R\$/g, '')
  if (t === '') return 0
  t = t.replace(/\./g, '').replace(',', '.')
  const n = parseFloat(t)
  return isNaN(n) ? 0 : n
}
function normTipo(t: unknown): string {
  const s = (t ?? '').toString().toUpperCase().trim()
  if (s.indexOf('ENT') === 0) return 'ENTRADA'
  if (s.indexOf('SA') === 0) return 'SAÍDA'
  return s
}
function monthOf(dstr: string): number | null {
  const m = parseInt((dstr || '').slice(5, 7), 10)
  return m >= 1 && m <= 12 ? m - 1 : null
}
function excelDateToISO(v: unknown): string {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${v.getFullYear()}-${`0${v.getMonth() + 1}`.slice(-2)}-${`0${v.getDate()}`.slice(-2)}`
  }
  if (typeof v === 'number') {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000))
    return `${d.getUTCFullYear()}-${`0${d.getUTCMonth() + 1}`.slice(-2)}-${`0${d.getUTCDate()}`.slice(-2)}`
  }
  const s = (v ?? '').toString().trim()
  let m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/) // dd/mm/yyyy
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${y}-${`0${m[2]}`.slice(-2)}-${`0${m[1]}`.slice(-2)}`
  }
  m = s.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/) // yyyy-mm-dd
  if (m) return `${m[1]}-${`0${m[2]}`.slice(-2)}-${`0${m[3]}`.slice(-2)}`
  return ''
}
const normHeader = (h: unknown) => (h ?? '').toString().toUpperCase().replace(/\s+/g, ' ').trim()

/* --------------------------- agregação --------------------------- */
interface Pivot {
  ent: Record<string, number[]>
  sai: Record<string, number[]>
  entD: Record<string, Record<string, number[]>>
  saiD: Record<string, Record<string, number[]>>
  years: string[]
}
function build(rows: Lancamento[]): Pivot {
  const ent: Record<string, number[]> = {}
  const sai: Record<string, number[]> = {}
  const entD: Record<string, Record<string, number[]>> = {}
  const saiD: Record<string, Record<string, number[]>> = {}
  const years: Record<string, 1> = {}
  for (const r of rows) {
    const tp = normTipo(r.tipo)
    const m = monthOf(r.data)
    if (m === null) continue
    const v = typeof r.valor === 'number' ? r.valor : parseBR(r.valor)
    const y = (r.data || '').slice(0, 4)
    if (y) years[y] = 1
    const bag = tp === 'ENTRADA' ? ent : tp === 'SAÍDA' ? sai : null
    const bagD = tp === 'ENTRADA' ? entD : tp === 'SAÍDA' ? saiD : null
    if (!bag || !bagD) continue
    const cat = (r.cat || '(sem categoria)').trim()
    if (!bag[cat]) bag[cat] = z12()
    bag[cat][m] += v
    const d = (r.desc || '(sem descrição)').trim()
    if (!bagD[cat]) bagD[cat] = {}
    if (!bagD[cat][d]) bagD[cat][d] = z12()
    bagD[cat][d][m] += v
  }
  return { ent, sai, entD, saiD, years: Object.keys(years).sort() }
}
function sortedCats(bag: Record<string, number[]>): string[] {
  return Object.keys(bag).sort((a, b) => sum12(bag[b]) - sum12(bag[a]))
}

/**
 * Estrutura FIXA das linhas, seguindo o fluxo de referência (print).
 * Um bloco é uma categoria isolada ('cat') ou um GRUPO com subtotal ('grupo'),
 * que soma várias categorias. Categorias que aparecerem na base e não estiverem
 * em bloco nenhum entram ao final da seção (por valor), para nada sumir.
 */
type Bloco = { tipo: 'cat'; cat: string } | { tipo: 'grupo'; nome: string; membros: string[] }

const ENTRADAS_BLOCOS: Bloco[] = [
  { tipo: 'grupo', nome: 'Recebimento de Clientes', membros: ['PROMO', 'EVENTO', 'INCENTIVO', 'ATIVAÇÃO'] },
  { tipo: 'cat', cat: 'BV' },
  { tipo: 'cat', cat: 'ANTECIPAÇÕES' },
  { tipo: 'cat', cat: 'REND. APLIC MENSAL' },
  { tipo: 'cat', cat: 'REND.DIARIO' },
]
const SAIDAS_BLOCOS: Bloco[] = [
  { tipo: 'cat', cat: 'PESSOAS E BENEFÍCIOS' },
  { tipo: 'grupo', nome: 'Fornecedores Job', membros: ['PROMO', 'EVENTOS', 'INCENTIVO', 'ATIVAÇÃO'] },
  { tipo: 'cat', cat: 'CONCORRÊNCIAS' },
  { tipo: 'cat', cat: 'DESPESAS GERAIS E ADMINISTRATIVAS' },
  { tipo: 'cat', cat: 'TRIBUTOS' },
  { tipo: 'cat', cat: 'TRIBUTOS PARCELADOS' },
  { tipo: 'cat', cat: 'PASSIVO DE FORNECEDOR' },
  { tipo: 'cat', cat: 'BATUX CHILE' },
]
function groupSum(bag: Record<string, number[]>, membros: string[]): number[] {
  const t = z12()
  for (const m of membros) if (bag[m]) for (let i = 0; i < 12; i++) t[i] += bag[m][i]
  return t
}
function colSum(bag: Record<string, number[]>): number[] {
  const t = z12()
  for (const c of Object.keys(bag)) for (let i = 0; i < 12; i++) t[i] += bag[c][i]
  return t
}

/* ============================ Componente ============================ */
export function FluxoCaixa() {
  const { user, mode } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [rows, setRows] = useState<Lancamento[]>([])
  const [saldoInicial, setSaldoInicial] = useState<number>(0)
  const [saldoTexto, setSaldoTexto] = useState<string>('0,00')
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({})
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const [secReceb, setSecReceb] = useState(false)
  const [secPag, setSecPag] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  /* ---------- carregar do Supabase ---------- */
  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    if (mode !== 'supabase' || !supabase) {
      // Modo demo (sem banco): trabalha em memória; base começa vazia.
      setLoading(false)
      return
    }
    const [lanc, cfg] = await Promise.all([
      fetchAllRows((from, to) =>
        supabase!.from('fluxo_caixa').select('tipo, descricao, categoria, valor, data').order('data').order('id').range(from, to)),
      supabase.from('fluxo_caixa_config').select('valor').eq('chave', 'saldo_inicial').maybeSingle(),
    ])
    if (lanc.error) {
      setErro('Não foi possível carregar a base. Verifique se a tabela fluxo_caixa foi criada no Supabase.')
      setLoading(false)
      return
    }
    const mapped: Lancamento[] = (lanc.data ?? []).map((r) => ({
      tipo: normTipo(r.tipo) as 'ENTRADA' | 'SAÍDA',
      desc: (r.descricao ?? '').toString(),
      cat: (r.categoria ?? '').toString(),
      valor: Number(r.valor) || 0,
      data: (r.data ?? '').toString().slice(0, 10),
    }))
    setRows(mapped)
    const sal = cfg.data ? Number(cfg.data.valor) || 0 : 0
    setSaldoInicial(sal)
    setSaldoTexto(fmtSaldo(sal))
    setLoading(false)
  }, [mode])

  useEffect(() => {
    carregar()
  }, [carregar])

  /* ---------- modelo do fluxo ---------- */
  const modelo = useMemo(() => {
    const d = build(rows)
    const receb = colSum(d.ent)
    const pag = colSum(d.sai)
    const saldoAnt = z12()
    const saldo = z12()
    let prev = saldoInicial
    for (let m = 0; m < 12; m++) {
      saldoAnt[m] = prev
      saldo[m] = prev + receb[m] - pag[m]
      prev = saldo[m]
    }
    return { d, receb, pag, saldoAnt, saldo }
  }, [rows, saldoInicial])

  /* ---------- ações ---------- */
  function toggleCat(key: string) {
    setOpenCats((o) => ({ ...o, [key]: !o[key] }))
  }
  function toggleGroup(nome: string) {
    setOpenGroups((o) => ({ ...o, [nome]: !(o[nome] ?? true) }))
  }

  /** Renderiza uma seção (blocos: categorias soltas + grupos com subtotal). */
  function renderSecao(
    blocos: Bloco[],
    pfx: string,
    bag: Record<string, number[]>,
    bagD: Record<string, Record<string, number[]>>,
  ): ReactNode[] {
    const usadas = new Set<string>()
    const out: ReactNode[] = []
    const catRow = (cat: string, nested?: boolean) => (
      <Categoria
        key={`${pfx}-${cat}`}
        pfx={pfx}
        cat={cat}
        arr={bag[cat]}
        detalhe={bagD[cat]}
        open={!!openCats[`${pfx}|${cat}`]}
        onToggle={toggleCat}
        nested={nested}
      />
    )
    for (const b of blocos) {
      if (b.tipo === 'cat') {
        if (!bag[b.cat]) continue
        usadas.add(b.cat)
        out.push(catRow(b.cat))
      } else {
        const membros = b.membros.filter((m) => bag[m])
        if (!membros.length) continue
        membros.forEach((m) => usadas.add(m))
        const aberto = openGroups[b.nome] ?? false
        out.push(
          <GrupoLinha key={`G-${b.nome}`} nome={b.nome} sub={groupSum(bag, b.membros)} open={aberto} onToggle={() => toggleGroup(b.nome)} />,
        )
        if (aberto) for (const m of membros) out.push(catRow(m, true))
      }
    }
    // Categorias presentes na base fora de qualquer bloco → ao final, por valor.
    for (const c of sortedCats(bag).filter((c) => !usadas.has(c))) out.push(catRow(c))
    return out
  }

  async function salvarSaldo(novo: number) {
    setSaldoInicial(novo)
    setSaldoTexto(fmtSaldo(novo))
    if (!isAdmin || mode !== 'supabase' || !supabase) return
    const { error } = await supabase
      .from('fluxo_caixa_config')
      .upsert({ chave: 'saldo_inicial', valor: novo, updated_at: new Date().toISOString() })
    if (error) setErro('Não foi possível salvar o saldo inicial.')
  }

  async function baixarBase() {
    try {
      setBusy(true)
      const XLSX = await import('xlsx')
      const aoa: unknown[][] = [['TIPO', 'DESCRIÇÃO', 'CATEGORIA', 'VALOR', 'DATA']]
      for (const r of rows) {
        let dt: Date | null = null
        if (r.data) {
          const p = r.data.split('-')
          dt = new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]))
        }
        aoa.push([r.tipo, r.desc, r.cat, r.valor, dt])
      }
      const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true })
      ws['!cols'] = [{ wch: 12 }, { wch: 52 }, { wch: 34 }, { wch: 16 }, { wch: 12 }]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'BD Sistema')
      const h = new Date()
      const z = (n: number) => `${n < 10 ? '0' : ''}${n}`
      XLSX.writeFile(wb, `Base FC - Batux - ${h.getFullYear()}${z(h.getMonth() + 1)}${z(h.getDate())}.xlsx`)
    } catch (e) {
      setErro(`Erro ao baixar a base: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleFile(file: File) {
    setErro(null)
    setAviso(null)
    setBusy(true)
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: '' })
      if (!aoa.length) throw new Error('planilha vazia')

      let hi = -1
      let map: Record<string, number> = {}
      for (let i = 0; i < Math.min(aoa.length, 10); i++) {
        const hs = (aoa[i] as unknown[]).map(normHeader)
        const t = hs.indexOf('TIPO')
        let dsc = hs.indexOf('DESCRIÇÃO')
        if (dsc < 0) dsc = hs.indexOf('DESCRICAO')
        const c = hs.indexOf('CATEGORIA')
        const v = hs.indexOf('VALOR')
        const dt = hs.indexOf('DATA')
        if (t >= 0 && v >= 0 && dt >= 0) {
          hi = i
          map = { tipo: t, desc: dsc, cat: c, valor: v, data: dt }
          break
        }
      }
      if (hi < 0) throw new Error('não encontrei as colunas TIPO / VALOR / DATA. Confira o cabeçalho da planilha.')

      const novo: Lancamento[] = []
      let ignoradas = 0
      for (let r = hi + 1; r < aoa.length; r++) {
        const row = aoa[r] as unknown[]
        if (!row) continue
        const tipo = normTipo(row[map.tipo]) as 'ENTRADA' | 'SAÍDA'
        const data = excelDateToISO(row[map.data])
        const valorCell = row[map.valor]
        const valor = typeof valorCell === 'number' ? valorCell : parseBR(valorCell as string)
        if ((tipo !== 'ENTRADA' && tipo !== 'SAÍDA') || !data) {
          if (row[map.tipo] || row[map.valor] || row[map.data]) ignoradas++
          continue
        }
        novo.push({
          tipo,
          desc: (map.desc >= 0 ? (row[map.desc] ?? '') : '').toString().trim(),
          cat: (map.cat >= 0 ? (row[map.cat] ?? '') : '').toString().trim(),
          valor,
          data,
        })
      }
      if (!novo.length) throw new Error('nenhum lançamento válido encontrado na planilha.')

      if (mode === 'supabase' && supabase) {
        const payload = novo.map((r) => ({ tipo: r.tipo, descricao: r.desc, categoria: r.cat, valor: r.valor, data: r.data }))
        const { error } = await supabase.rpc('fluxo_caixa_replace', { p_rows: payload, p_saldo: saldoInicial })
        if (error) throw new Error(error.message)
        await carregar()
      } else {
        setRows(novo)
      }
      setOpenCats({})
      setAviso(`Base atualizada: ${novo.length} lançamentos${ignoradas ? ` (${ignoradas} linhas ignoradas)` : ''}.`)
    } catch (e) {
      setErro(`Não consegui ler a planilha: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  /* ---------- render ---------- */
  const { d, receb, pag, saldoAnt, saldo } = modelo
  const totR = sum12(receb)
  const totP = sum12(pag)
  const res = totR - totP
  const fim = saldo[11]
  const anos = d.years.length ? d.years.join(' / ') : ''
  const nCats = Object.keys(d.ent).length + Object.keys(d.sai).length
  const vazio = rows.length === 0

  return (
    <div
      className="fcx flex flex-col gap-3"
      style={{ width: '100%' }}
    >
      <ScopedStyle />

      <ModuloTopo>
      {/* Cabeçalho do módulo */}
      <div className="flex min-h-[64px] flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-lg font-semibold text-ink">Fluxo de Caixa</h2>
          <p className="text-[13px] text-muted">
            Regime de caixa{anos ? ` · exercício ${anos}` : ''} · recebimentos e pagamentos efetivados
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Saldo inicial (jan)</span>
            <input
              className="w-40 rounded-lg border border-line bg-white px-3 py-2 text-right text-[15px] font-bold text-ink tnum outline-none focus:border-ink/40 disabled:opacity-60"
              inputMode="decimal"
              disabled={!isAdmin || busy}
              value={saldoTexto}
              onChange={(e) => setSaldoTexto(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              onBlur={() => salvarSaldo(parseBR(saldoTexto))}
              title={isAdmin ? 'Editável pelo admin' : 'Somente administradores podem editar'}
            />
          </label>
          <button
            className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-[13px] font-bold text-ink transition hover:bg-paper disabled:opacity-50"
            onClick={baixarBase}
            disabled={busy || vazio}
            title="Baixar a base atual em Excel"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>
            Baixar base
          </button>
          {isAdmin && (
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-[13px] font-bold text-white shadow-brand transition hover:brightness-125 disabled:opacity-50"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              title="Enviar a planilha atualizada (substitui a base para todos)"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21V9" /><path d="m7 14 5-5 5 5" /><path d="M5 3h14" /></svg>
              {busy ? 'Processando…' : 'Atualizar base'}
            </button>
          )}
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi lbl="Recebimentos no ano" val={totR} accent="pos" foot="Total de entradas de caixa" />
        <Kpi lbl="Pagamentos no ano" val={totP} accent="neg" foot="Total de saídas de caixa" />
        <Kpi lbl="Resultado de Caixa" val={res} accent={res >= 0 ? 'pos' : 'neg'} foot="Recebimentos − Pagamentos" signed />
        <Kpi lbl="Saldo Final de Caixa" val={fim} accent="band" foot="Saldo projetado ao fim do período" signed />
      </div>

      {!vazio && (
        <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5">
          <h3 className="text-[14px] font-bold text-ink">Demonstrativo do Fluxo de Caixa</h3>
          <span className="text-[11px] text-muted">
            {loading ? 'carregando…' : `${rows.length} lançamentos · ${nCats} categorias`}
          </span>
        </div>
      )}
      </ModuloTopo>

      {erro && <Alerta tipo="erro" texto={erro} onClose={() => setErro(null)} />}
      {aviso && <Alerta tipo="ok" texto={aviso} onClose={() => setAviso(null)} />}

      {/* Tabela */}
      <div className="rounded-2xl border border-line bg-surface shadow-card">
        {loading ? (
          <div className="grid place-items-center py-16 text-sm text-muted">Carregando base…</div>
        ) : vazio ? (
          <div className="grid place-items-center gap-2 px-6 py-16 text-center">
            <p className="font-serif text-lg text-ink">A base ainda não foi carregada.</p>
            <p className="max-w-md text-sm text-muted">
              {isAdmin
                ? 'Clique em “Atualizar base” e envie a planilha (colunas TIPO, DESCRIÇÃO, CATEGORIA, VALOR, DATA) para popular o fluxo de caixa para todo o time.'
                : 'Assim que um administrador enviar a planilha, o fluxo de caixa aparecerá aqui.'}
            </p>
          </div>
        ) : (
          <div className="fc-scroller">
            <table className="fc tnum">
              <thead>
                <tr>
                  <th className="rowlabel">Conta</th>
                  {MESES.map((m) => (
                    <th key={m}>{m}</th>
                  ))}
                  <th className="col-total">Ano</th>
                </tr>
              </thead>
              <tbody>
                <Linha cls="saldo-ant" label="(=) Saldo Atual" arr={saldoAnt} total={saldoInicial} />
                <SecaoTotal cls="total-receb" label="(+) Recebimentos" arr={receb} total={totR} open={secReceb} onToggle={() => setSecReceb((v) => !v)} />
                {secReceb && renderSecao(ENTRADAS_BLOCOS, 'E', d.ent, d.entD)}
                <SecaoTotal cls="total-pag" label="(−) Pagamentos" arr={pag} total={totP} open={secPag} onToggle={() => setSecPag((v) => !v)} />
                {secPag && renderSecao(SAIDAS_BLOCOS, 'S', d.sai, d.saiD)}
                <Linha cls="saldo-caixa" label="(=) Saldo Final" arr={saldo} total={fim} />
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
        <span className="rounded-full border border-line bg-surface px-2.5 py-1 font-medium">💡 Clique numa categoria para ver o detalhamento</span>
        <span className="rounded-full border border-line bg-surface px-2.5 py-1 font-medium">Valores em R$</span>
        <span className="rounded-full border border-line bg-surface px-2.5 py-1 font-medium">Saldo de Caixa = Saldo Anterior + Recebimentos − Pagamentos</span>
        {!isAdmin && <span className="rounded-full border border-line bg-surface px-2.5 py-1 font-medium">Somente administradores atualizam a base</span>}
        {mode !== 'supabase' && <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 font-medium text-amber-700">Modo demonstração (dados não persistem)</span>}
      </div>
    </div>
  )
}

/* --------------------------- subcomponentes --------------------------- */
function Cells({ arr, total }: { arr: number[]; total: number }) {
  return (
    <>
      {arr.map((v, i) => (
        <td key={i} className={`num ${numClass(v)}`}>{fmt(v)}</td>
      ))}
      <td className={`num col-total ${numClass(total)}`}>{fmt(total)}</td>
    </>
  )
}
function Linha({ cls, label, arr, total }: { cls: string; label: string; arr: number[]; total: number }) {
  return (
    <tr className={cls}>
      <td className="rowlabel">{label}</td>
      <Cells arr={arr} total={total} />
    </tr>
  )
}
function SecaoTotal({
  cls, label, arr, total, open, onToggle,
}: {
  cls: string
  label: string
  arr: number[]
  total: number
  open: boolean
  onToggle: () => void
}) {
  return (
    <tr className={`${cls} sechead${open ? ' open' : ''}`} onClick={onToggle}>
      <td className="rowlabel">
        <span className="caret">▶</span> {label}
      </td>
      <Cells arr={arr} total={total} />
    </tr>
  )
}
function GrupoLinha({ nome, sub, open, onToggle }: { nome: string; sub: number[]; open: boolean; onToggle: () => void }) {
  return (
    <tr className={`grupo${open ? ' open' : ''}`} onClick={onToggle}>
      <td className="rowlabel">
        <span className="caret">▶</span> {nome}
      </td>
      <Cells arr={sub} total={sum12(sub)} />
    </tr>
  )
}
function Categoria({
  pfx, cat, arr, detalhe, open, onToggle, nested,
}: {
  pfx: string
  cat: string
  arr: number[]
  detalhe?: Record<string, number[]>
  open: boolean
  onToggle: (k: string) => void
  nested?: boolean
}) {
  const key = `${pfx}|${cat}`
  const descs = detalhe ? Object.keys(detalhe).sort((a, b) => sum12(detalhe[b]) - sum12(detalhe[a])) : []
  const nc = nested ? ' nested' : ''
  return (
    <>
      <tr className={`cat${nc}${open ? ' open' : ''}`} onClick={() => onToggle(key)}>
        <td className="rowlabel">
          <span className="caret">▶</span> {cat}
        </td>
        <Cells arr={arr} total={sum12(arr)} />
      </tr>
      {open &&
        descs.map((dd) => (
          <tr className={`detail${nc}`} key={dd}>
            <td className="rowlabel">
              <span className="dot">•</span> {dd}
            </td>
            <Cells arr={detalhe![dd]} total={sum12(detalhe![dd])} />
          </tr>
        ))}
    </>
  )
}
function Kpi({ lbl, val, accent, foot, signed }: { lbl: string; val: number; accent: 'pos' | 'neg' | 'band'; foot: string; signed?: boolean }) {
  const cor = signed ? (val < 0 ? 'text-neg' : accent === 'band' ? 'text-ink' : 'text-pos') : accent === 'pos' ? 'text-pos' : accent === 'neg' ? 'text-neg' : 'text-ink'
  return (
    <div className="relative flex min-h-[74px] flex-col justify-center overflow-hidden rounded-xl border border-line bg-surface px-4 py-2.5">
      <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: 'linear-gradient(180deg, #FE9F2E 0%, #FB5403 55%, #F5390A 100%)' }} />
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted">{lbl}</div>
      <div className={`mt-1 text-[20px] font-extrabold tnum ${cor}`}>R$ {fmt(val)}</div>
      <div className="mt-0.5 text-[11px] text-muted">{foot}</div>
    </div>
  )
}
function Alerta({ tipo, texto, onClose }: { tipo: 'erro' | 'ok'; texto: string; onClose: () => void }) {
  const c = tipo === 'erro' ? 'border-neg/30 bg-red-50 text-neg' : 'border-pos/30 bg-emerald-50 text-pos'
  return (
    <div className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5 text-[13px] font-medium ${c}`}>
      <span>{texto}</span>
      <button onClick={onClose} className="opacity-60 hover:opacity-100" aria-label="Fechar">✕</button>
    </div>
  )
}

/* --------------------------- estilos da tabela --------------------------- */
function ScopedStyle() {
  return (
    <style>{`
.fcx .fc-scroller{overflow:visible}
.fcx table.fc{border-collapse:separate;border-spacing:0;width:100%;table-layout:fixed}
.fcx table.fc tbody tr:last-child td:first-child{border-bottom-left-radius:15px}
.fcx table.fc tbody tr:last-child td:last-child{border-bottom-right-radius:15px}
.fcx table.fc th,.fcx table.fc td{padding:6px 5px;text-align:right;white-space:nowrap;border-bottom:1px solid #F0EEEC;font-size:clamp(9px,0.86vw,13px);overflow:hidden}
.fcx table.fc thead th{position:sticky;top:calc(var(--topo-h,150px) - 1px);z-index:3;background:#EEF3F9;color:#4B5563;font-size:11.5px;text-transform:uppercase;letter-spacing:.5px;font-weight:700;border-bottom:2px solid #DBE4EF}
.fcx table.fc th.rowlabel,.fcx table.fc td.rowlabel{text-align:left;position:sticky;left:0;z-index:2;background:#fff;width:16%;white-space:normal;word-break:break-word;line-height:1.2;font-weight:600;box-shadow:1px 0 0 #DBE4EF;font-size:clamp(10px,0.86vw,13px)}
.fcx table.fc thead th.rowlabel{z-index:4;background:#EEF3F9}
.fcx table.fc th.col-total,.fcx table.fc td.col-total{background:rgb(18 34 56 / 0.05);font-weight:800;border-left:1px solid #DBE4EF}
.fcx table.fc thead th.col-total{background:#E4ECF5;color:#122238}
.fcx td.num{color:#1F2937}.fcx td.num.neg{color:#C0392B}.fcx td.num.zero{color:#C7C2BC}
.fcx tr.section td{background:#F4F7FB;color:#64748B;font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:800}
.fcx tr.cat{cursor:pointer}
.fcx tr.cat:hover td{background:#F8FAFC}
.fcx tr.cat td.rowlabel .caret{display:inline-block;width:14px;color:#64748B;font-size:10px;transition:transform .15s}
.fcx tr.cat.open td.rowlabel .caret{transform:rotate(90deg)}
.fcx tr.cat.nested td.rowlabel{padding-left:26px}
.fcx tr.detail.nested td.rowlabel{padding-left:40px}
.fcx tr.grupo{cursor:pointer}
.fcx tr.grupo td{background:#EEF3F9;font-weight:800;color:#122238;border-top:1px solid #DBE4EF;border-bottom:1px solid #DBE4EF}
.fcx tr.grupo:hover td{background:#E4ECF5}
.fcx tr.grupo td.rowlabel .caret{display:inline-block;width:14px;color:#64748B;font-size:10px;transition:transform .15s}
.fcx tr.grupo.open td.rowlabel .caret{transform:rotate(90deg)}
.fcx tr.detail td{background:#F8FAFC;color:#4B5563;font-size:clamp(8px,0.74vw,11px);font-style:italic;border-bottom:1px solid #EEF2F7}
.fcx tr.detail td.rowlabel{background:#F8FAFC;padding-left:18px;font-weight:500;white-space:normal;font-size:clamp(8.5px,0.74vw,11.5px);font-style:italic}
.fcx tr.detail td.rowlabel .dot{color:#9aa0a6}
.fcx tr.total-receb td{background:#EAF6F0;font-weight:800;color:#14663f;border-top:1px solid #CDE9DC;border-bottom:1px solid #CDE9DC}
.fcx tr.total-pag td{background:#FBECE9;font-weight:800;color:#8f2f22;border-top:1px solid #F1D2CB;border-bottom:1px solid #F1D2CB}
.fcx tr.sechead{cursor:pointer}
.fcx tr.sechead td.rowlabel .caret{display:inline-block;width:14px;font-size:10px;color:currentColor;transition:transform .15s}
.fcx tr.sechead.open td.rowlabel .caret{transform:rotate(90deg)}
.fcx tr.saldo-ant td{background:#F3F4F6;font-weight:700;color:#1F2937}
.fcx tr.disponivel td{background:rgb(18 34 56 / 0.06);font-weight:800;color:#122238;border-top:1px solid #DBE4EF}
.fcx tr.saldo-caixa td{background:#0B2545;color:#fff;font-weight:800;font-size:14px}
.fcx tr.saldo-caixa td.num.neg{color:#FF9B8A}
.fcx tr.saldo-caixa td.col-total{background:#0a1f3d;border-left:1px solid #24406a}
/* Fundo do RÓTULO (1ª coluna) das linhas especiais — sobrepõe o branco padrão */
.fcx tr.saldo-ant td.rowlabel{background:#F3F4F6}
.fcx tr.total-receb td.rowlabel{background:#EAF6F0}
.fcx tr.total-pag td.rowlabel{background:#FBECE9}
.fcx tr.grupo td.rowlabel{background:#FFF1E8}
.fcx tr.saldo-caixa td.rowlabel{background:#0B2545;color:#fff}
`}</style>
  )
}
