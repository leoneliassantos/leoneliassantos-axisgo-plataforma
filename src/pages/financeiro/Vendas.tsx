import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../auth/AuthContext'
import { CLIENT } from '../../config/client'

/* ================================================================== *
 *  Vendas — módulo do Financeiro (notas de venda item a item)
 *  Dados no Supabase (public.vendas). Leitura: autenticado ·
 *  Escrita (upload): admin. A base NUNCA fica no repositório.
 * ================================================================== */

interface Venda {
  nota: string
  data: string // 'YYYY-MM-DD'
  tipo: string
  cliente: string
  sku: string
  produto: string
  qtd: number
  unit: number
  serie: string
  origem: string
}
type Gran = 'dia' | 'semana' | 'mes'
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

/* Degradê quente da marca MC (vermelho-laranja → âmbar), ordenado do mais forte
 * ao mais claro. Dá variação de cor aos gráficos sem fugir da identidade. */
const GRAD = ['#E8420A', '#FB6407', '#FB7D12', '#FB960E', '#FDAD1E', '#FDBE45', '#FCD07A']
const gradAt = (i: number) => GRAD[Math.min(i, GRAD.length - 1)]

/* ------------------------------- utils ------------------------------- */
const pad2 = (n: number) => `${n < 10 ? '0' : ''}${n}`
function fmt0(v: number): string {
  if (Math.abs(v) < 0.5) return '0'
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
}
function fmt2(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtCompacto(v: number): string {
  const s = v < 0 ? '-' : ''
  const a = Math.abs(v)
  if (a >= 1_000_000) return `${s}${(a / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
  if (a >= 1_000) return `${s}${(a / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
  return `${s}${a.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
}
function parseBR(s: string | number): number {
  if (typeof s === 'number') return s
  let t = (s || '').toString().trim().replace(/\s|R\$/g, '')
  if (t === '') return 0
  t = t.replace(/\./g, '').replace(',', '.')
  const n = parseFloat(t)
  return isNaN(n) ? 0 : n
}
function excelDateToISO(v: unknown): string {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${v.getFullYear()}-${pad2(v.getMonth() + 1)}-${pad2(v.getDate())}`
  }
  if (typeof v === 'number') {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000))
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
  }
  const s = (v ?? '').toString().trim()
  let m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/) // dd/mm/yyyy
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${y}-${pad2(+m[2])}-${pad2(+m[1])}`
  }
  m = s.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/) // yyyy-mm-dd
  if (m) return `${m[1]}-${pad2(+m[2])}-${pad2(+m[3])}`
  return ''
}
const normHeader = (h: unknown) => (h ?? '').toString().toUpperCase().replace(/\s+/g, ' ').trim()
/** Chave/rótulo do balde temporal conforme a granularidade. */
function bucket(iso: string, g: Gran): { key: string; label: string } {
  const [y, mo, d] = iso.split('-').map(Number)
  if (g === 'mes') return { key: `${y}-${pad2(mo)}`, label: `${MESES[mo - 1]}/${String(y).slice(2)}` }
  if (g === 'dia') return { key: iso, label: `${pad2(d)}/${pad2(mo)}` }
  // semana: segunda-feira de referência
  const dt = new Date(y, mo - 1, d)
  const dow = (dt.getDay() + 6) % 7
  const st = new Date(y, mo - 1, d - dow)
  return { key: `${st.getFullYear()}-${pad2(st.getMonth() + 1)}-${pad2(st.getDate())}`, label: `${pad2(st.getDate())}/${pad2(st.getMonth() + 1)}` }
}

/* ============================ Componente ============================ */
export function Vendas() {
  const { user, mode } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [rows, setRows] = useState<Venda[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // filtros
  const [dataDe, setDataDe] = useState('')
  const [dataAte, setDataAte] = useState('')
  const [selCanais, setSelCanais] = useState<Set<string> | null>(null) // null = todos
  const [gran, setGran] = useState<Gran>('semana')
  const [rankPor, setRankPor] = useState<'produto' | 'sku'>('produto')
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null)

  // altura disponível (caber 100% na tela)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [altura, setAltura] = useState<number | undefined>(undefined)
  useLayoutEffect(() => {
    function calc() {
      const el = wrapRef.current
      if (!el) return
      setAltura(Math.max(440, window.innerHeight - el.getBoundingClientRect().top - 80))
    }
    calc()
    window.addEventListener('resize', calc)
    return () => window.removeEventListener('resize', calc)
  }, [loading, erro, rows.length])

  /* ---------- carregar do Supabase ---------- */
  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    if (mode !== 'supabase' || !supabase) {
      setLoading(false)
      return
    }
    const { data, error } = await supabase
      .from('vendas')
      .select('nota, data, tipo, cliente, sku, produto, quantidade, valor_unitario, serie, origem')
      .order('data')
    if (error) {
      setErro('Não foi possível carregar a base. Verifique se a tabela "vendas" foi criada no Supabase.')
      setLoading(false)
      return
    }
    const mapped: Venda[] = (data ?? []).map((r) => ({
      nota: (r.nota ?? '').toString(),
      data: (r.data ?? '').toString().slice(0, 10),
      tipo: (r.tipo ?? '').toString(),
      cliente: (r.cliente ?? '').toString(),
      sku: (r.sku ?? '').toString().trim(),
      produto: (r.produto ?? '').toString().trim(),
      qtd: Number(r.quantidade) || 0,
      unit: Number(r.valor_unitario) || 0,
      serie: (r.serie ?? '').toString(),
      origem: ((r.origem ?? '').toString().trim()) || '(sem canal)',
    }))
    setRows(mapped)
    if (mapped.length) {
      const ds = mapped.map((r) => r.data).filter(Boolean).sort()
      setDataDe(ds[0])
      setDataAte(ds[ds.length - 1])
    }
    setLoading(false)
  }, [mode])

  useEffect(() => {
    carregar()
  }, [carregar])

  const canais = useMemo(
    () => Array.from(new Set(rows.map((r) => r.origem))).sort((a, b) => a.localeCompare(b)),
    [rows],
  )

  /* ---------- métricas com filtros ---------- */
  const m = useMemo(() => {
    const canalOk = (c: string) => selCanais === null || selCanais.has(c)
    const de = dataDe || '0000-01-01'
    const ate = dataAte || '9999-12-31'
    const f = rows.filter((r) => r.data >= de && r.data <= ate && canalOk(r.origem))

    const fat = (r: Venda) => r.qtd * r.unit
    const faturamento = f.reduce((a, r) => a + fat(r), 0)
    const itens = f.reduce((a, r) => a + r.qtd, 0)
    const pedidos = new Set(f.map((r) => r.nota)).size
    const skusAtivos = new Set(f.filter((r) => r.sku).map((r) => r.sku)).size
    const ticket = pedidos ? faturamento / pedidos : 0

    // série temporal por balde
    const bmap = new Map<string, { label: string; fat: number; pedidos: Set<string>; itens: number }>()
    for (const r of f) {
      const b = bucket(r.data, gran)
      let e = bmap.get(b.key)
      if (!e) { e = { label: b.label, fat: 0, pedidos: new Set(), itens: 0 }; bmap.set(b.key, e) }
      e.fat += fat(r); e.itens += r.qtd; e.pedidos.add(r.nota)
    }
    const bkeys = Array.from(bmap.keys()).sort()
    const serie = bkeys.map((k) => bmap.get(k)!)

    // agregação genérica por chave
    const agrupar = (key: (r: Venda) => string) => {
      const acc = new Map<string, { fat: number; qtd: number }>()
      for (const r of f) {
        const k = key(r) || '(sem)'
        const e = acc.get(k) || { fat: 0, qtd: 0 }
        e.fat += fat(r); e.qtd += r.qtd; acc.set(k, e)
      }
      return Array.from(acc.entries())
        .map(([nome, v]) => ({ nome, valor: v.fat, qtd: v.qtd }))
        .filter((x) => x.valor > 0.005)
        .sort((a, b) => b.valor - a.valor)
    }
    const porCanal = agrupar((r) => r.origem)
    const porProduto = agrupar((r) => r.produto)
    const porSku = agrupar((r) => r.sku)

    return { faturamento, itens, pedidos, skusAtivos, ticket, serie, porCanal, porProduto, porSku }
  }, [rows, selCanais, dataDe, dataAte, gran])

  /* ---------- ações ---------- */
  async function baixarBase() {
    try {
      setBusy(true)
      const XLSX = await import('xlsx')
      const aoa: unknown[][] = [['Nº nota', 'Data', 'Tipo', 'Cliente/Fornecedor', 'Código (SKU)', 'Produto', 'Quantidade', 'Valor unitário', 'Nº série', 'Origem']]
      for (const r of rows) {
        const p = r.data.split('-')
        const dt = p.length === 3 ? new Date(+p[0], +p[1] - 1, +p[2]) : null
        aoa.push([r.nota, dt, r.tipo, r.cliente, r.sku, r.produto, r.qtd, r.unit, r.serie, r.origem])
      }
      const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true })
      ws['!cols'] = [{ wch: 10 }, { wch: 12 }, { wch: 8 }, { wch: 30 }, { wch: 16 }, { wch: 54 }, { wch: 11 }, { wch: 13 }, { wch: 8 }, { wch: 12 }]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Vendas')
      const h = new Date()
      XLSX.writeFile(wb, `Base Vendas - ${CLIENT.nome} - ${h.getFullYear()}${pad2(h.getMonth() + 1)}${pad2(h.getDate())}.xlsx`)
    } catch (e) {
      setErro(`Erro ao baixar a base: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleFile(file: File) {
    setErro(null); setAviso(null); setBusy(true)
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: '' })
      if (!aoa.length) throw new Error('planilha vazia')

      // acha o cabeçalho e mapeia colunas por "contém"
      const find = (hs: string[], ...terms: string[]) => hs.findIndex((h) => terms.some((t) => h.includes(t)))
      let hi = -1
      let col: Record<string, number> = {}
      for (let i = 0; i < Math.min(aoa.length, 12); i++) {
        const hs = (aoa[i] as unknown[]).map(normHeader)
        const data = find(hs, 'DATA')
        const prod = find(hs, 'PRODUTO')
        const qtd = find(hs, 'QUANT')
        const val = find(hs, 'UNIT', 'VALOR')
        if (data >= 0 && qtd >= 0 && val >= 0 && prod >= 0) {
          hi = i
          col = {
            nota: find(hs, 'NOTA'), data, tipo: find(hs, 'TIPO'),
            cliente: find(hs, 'CLIENTE', 'FORNECEDOR'), sku: find(hs, 'SKU', 'CÓDIGO', 'CODIGO'),
            produto: prod, qtd, val, serie: find(hs, 'SÉRIE', 'SERIE'), origem: find(hs, 'ORIGEM', 'CANAL'),
          }
          break
        }
      }
      if (hi < 0) throw new Error('não encontrei as colunas (Data, Produto, Quantidade, Valor unitário). Confira o cabeçalho.')

      const get = (row: unknown[], i: number) => (i >= 0 ? row[i] : '')
      const novo: Venda[] = []
      let ignoradas = 0
      for (let r = hi + 1; r < aoa.length; r++) {
        const row = aoa[r] as unknown[]
        if (!row) continue
        const data = excelDateToISO(get(row, col.data))
        const qtdCell = get(row, col.qtd)
        const qtd = typeof qtdCell === 'number' ? qtdCell : parseBR(qtdCell as string)
        const unitCell = get(row, col.val)
        const unit = typeof unitCell === 'number' ? unitCell : parseBR(unitCell as string)
        if (!data || (!qtd && !unit)) {
          if (get(row, col.data) || get(row, col.produto)) ignoradas++
          continue
        }
        novo.push({
          nota: (get(row, col.nota) ?? '').toString().trim(),
          data, tipo: (get(row, col.tipo) ?? '').toString().trim(),
          cliente: (get(row, col.cliente) ?? '').toString().trim(),
          sku: (get(row, col.sku) ?? '').toString().trim(),
          produto: (get(row, col.produto) ?? '').toString().trim(),
          qtd, unit,
          serie: (get(row, col.serie) ?? '').toString().trim(),
          origem: (get(row, col.origem) ?? '').toString().trim(),
        })
      }
      if (!novo.length) throw new Error('nenhuma venda válida encontrada na planilha.')

      if (mode === 'supabase' && supabase) {
        const payload = novo.map((r) => ({
          nota: r.nota, data: r.data, tipo: r.tipo, cliente: r.cliente, sku: r.sku,
          produto: r.produto, quantidade: r.qtd, valor_unitario: r.unit, serie: r.serie, origem: r.origem,
        }))
        const { error } = await supabase.rpc('vendas_replace', { p_rows: payload })
        if (error) throw new Error(error.message)
        await carregar()
      } else {
        setRows(novo)
      }
      setAviso(`Base atualizada: ${novo.length} vendas${ignoradas ? ` (${ignoradas} linhas ignoradas)` : ''}.`)
    } catch (e) {
      setErro(`Não consegui ler a planilha: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  /* ---------- detalhes (modais + export) ---------- */
  const detSerie = (): Detalhe => ({
    titulo: 'Faturamento no tempo', arquivo: 'Vendas - Faturamento no tempo.xlsx',
    colunas: [{ label: gran === 'mes' ? 'Mês' : gran === 'semana' ? 'Semana (início)' : 'Dia', tipo: 'texto' }, { label: 'Faturamento (R$)', tipo: 'num' }, { label: 'Pedidos', tipo: 'num' }, { label: 'Itens', tipo: 'num' }],
    linhas: [
      ...m.serie.map((b) => [b.label, Math.round(b.fat), b.pedidos.size, b.itens] as (string | number)[]),
      ['TOTAL', Math.round(m.faturamento), m.pedidos, m.itens],
    ],
  })
  const detCanal = (): Detalhe => ({
    titulo: 'Faturamento por canal', arquivo: 'Vendas - Por canal.xlsx',
    colunas: [{ label: 'Canal (Origem)', tipo: 'texto' }, { label: 'Faturamento (R$)', tipo: 'num' }, { label: '% do total', tipo: 'pct' }],
    linhas: [
      ...m.porCanal.map((x) => [x.nome, Math.round(x.valor), m.faturamento ? Math.round((x.valor / m.faturamento) * 100) : 0] as (string | number)[]),
      ['TOTAL', Math.round(m.faturamento), 100],
    ],
  })
  const detRank = (base: { nome: string; valor: number; qtd: number }[], titulo: string, arq: string, rot: string): Detalhe => ({
    titulo, arquivo: arq,
    colunas: [{ label: rot, tipo: 'texto' }, { label: 'Faturamento (R$)', tipo: 'num' }, { label: 'Qtd', tipo: 'num' }, { label: '% do total', tipo: 'pct' }],
    linhas: [
      ...base.map((x) => [x.nome, Math.round(x.valor), Math.round(x.qtd), m.faturamento ? Math.round((x.valor / m.faturamento) * 100) : 0] as (string | number)[]),
      ['TOTAL', Math.round(m.faturamento), Math.round(m.itens), 100],
    ],
  })

  /* ---------- render ---------- */
  const vazio = rows.length === 0
  const rank = rankPor === 'produto' ? m.porProduto : m.porSku

  if (loading) return <div className="grid place-items-center rounded-2xl border border-line bg-surface py-20 text-sm text-muted">Carregando vendas…</div>

  return (
    <div
      ref={wrapRef}
      style={{ width: 'min(1600px, 96vw)', height: vazio ? undefined : altura, position: 'relative', left: '50%', transform: 'translateX(-50%)', overflow: vazio ? undefined : 'hidden' }}
      className="flex flex-col gap-2"
    >
      {/* Barra de topo: título + ações */}
      <div className="flex flex-none flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-serif text-lg font-semibold text-ink">Vendas</h2>
          <p className="text-[12px] text-muted">Notas de venda item a item · faturamento por canal, produto e período</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="inline-flex items-center gap-1.5 rounded-lg border border-brand/30 bg-brand/10 px-3 py-2 text-[12px] font-bold text-brand transition hover:bg-brand/20 disabled:opacity-50"
            onClick={baixarBase} disabled={busy || vazio} title="Baixar a base atual em Excel"
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>
            Baixar base
          </button>
          {isAdmin && (
            <button
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-[12px] font-bold text-white shadow-brand transition hover:opacity-90 disabled:opacity-50"
              onClick={() => fileRef.current?.click()} disabled={busy} title="Enviar a planilha (substitui a base para todos)"
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21V9" /><path d="m7 14 5-5 5 5" /><path d="M5 3h14" /></svg>
              {busy ? 'Processando…' : 'Atualizar base'}
            </button>
          )}
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} />
        </div>
      </div>

      {erro && <Alerta tipo="erro" texto={erro} onClose={() => setErro(null)} />}
      {aviso && <Alerta tipo="ok" texto={aviso} onClose={() => setAviso(null)} />}

      {vazio ? (
        <div className="grid place-items-center gap-2 rounded-2xl border border-dashed border-line bg-surface/60 px-6 py-16 text-center">
          <p className="font-serif text-lg text-ink">A base de vendas ainda não foi carregada.</p>
          <p className="max-w-md text-sm text-muted">
            {isAdmin
              ? 'Clique em “Atualizar base” e envie a planilha de vendas (colunas Nº nota, Data, Tipo, Cliente, SKU, Produto, Quantidade, Valor unitário, Origem).'
              : 'Assim que um administrador enviar a planilha, o painel de vendas aparecerá aqui.'}
          </p>
        </div>
      ) : (
        <>
          {/* Filtros */}
          <div className="flex flex-none flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Filtros</span>
            <div className="flex items-center gap-1.5 text-[12px]">
              <span className="text-muted">Período</span>
              <input type="date" value={dataDe} onChange={(e) => setDataDe(e.target.value)} className="rounded-md border border-line bg-white px-2 py-1 text-[12px] font-semibold text-ink outline-none focus:border-brand" />
              <span className="text-muted">até</span>
              <input type="date" value={dataAte} onChange={(e) => setDataAte(e.target.value)} className="rounded-md border border-line bg-white px-2 py-1 text-[12px] font-semibold text-ink outline-none focus:border-brand" />
            </div>
            <MultiSelect label="Canal" opcoes={canais} value={selCanais} onChange={setSelCanais} />
            <div className="flex items-center gap-1 text-[12px]">
              <span className="text-muted">Ver por</span>
              <Toggle valor={gran} set={setGran} ops={[['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês']]} />
            </div>
            <button
              className="ml-auto rounded-md border border-line px-2.5 py-1 text-[12px] font-medium text-muted transition hover:bg-paper"
              onClick={() => { const ds = rows.map((r) => r.data).filter(Boolean).sort(); setDataDe(ds[0] ?? ''); setDataAte(ds[ds.length - 1] ?? ''); setSelCanais(null) }}
            >
              Limpar filtros
            </button>
          </div>

          {/* KPIs */}
          <div className="grid flex-none grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <Kpi cor={GRAD[0]} lbl="Faturamento" valor={`R$ ${fmt0(m.faturamento)}`} foot="Total no período/canal" tip="Soma de Quantidade × Valor unitário de todas as vendas do filtro." />
            <Kpi cor={GRAD[1]} lbl="Pedidos" valor={fmt0(m.pedidos)} foot="Notas distintas" tip="Número de notas fiscais distintas (cada pedido pode ter vários itens)." />
            <Kpi cor={GRAD[2]} lbl="Itens vendidos" valor={fmt0(m.itens)} foot="Soma das quantidades" tip="Soma das quantidades de todos os itens vendidos no filtro." />
            <Kpi cor={GRAD[3]} lbl="Ticket médio" valor={`R$ ${fmt2(m.ticket)}`} foot="Faturamento ÷ pedidos" tip="Valor médio por pedido = faturamento dividido pelo número de notas." />
            <Kpi cor={GRAD[4]} lbl="SKUs ativos" valor={fmt0(m.skusAtivos)} foot="Códigos com venda" tip="Quantidade de SKUs diferentes que tiveram venda no período/canal filtrado." />
          </div>

          {/* Gráficos — 2 linhas que preenchem a altura */}
          <div className="grid min-h-0 flex-1 grid-cols-12 grid-rows-2 gap-2">
            <Tile className="col-span-12 lg:col-span-5 lg:row-span-2" titulo="Faturamento no tempo" tip="Evolução do faturamento por dia, semana ou mês (escolha em “Ver por”)." onDetalhes={() => setDetalhe(detSerie())}>
              <AreaFat serie={m.serie} />
            </Tile>

            <Tile className="col-span-12 lg:col-span-4" titulo={`Top ${rankPor === 'produto' ? 'Produtos' : 'SKUs'}`} tip="Itens que mais faturam no período/canal. Alterne entre Produto e SKU no botão." onDetalhes={() => setDetalhe(detRank(rank, `Top ${rankPor === 'produto' ? 'produtos' : 'SKUs'}`, `Vendas - Top ${rankPor}.xlsx`, rankPor === 'produto' ? 'Produto' : 'SKU'))}
              acao={<Toggle valor={rankPor} set={setRankPor} ops={[['produto', 'Produto'], ['sku', 'SKU']]} />}
            >
              <BarrasH itens={rank.slice(0, 6)} total={m.faturamento} />
            </Tile>

            <Tile className="col-span-12 lg:col-span-3 lg:row-span-2" titulo="Faturamento por canal" tip="Participação de cada canal de venda (Origem). Hoje só Olist; pronto para Shopee, Mercado Livre, TikTok, etc." onDetalhes={() => setDetalhe(detCanal())}>
              <Donut itens={m.porCanal} total={m.faturamento} />
            </Tile>

            <Tile className="col-span-12 lg:col-span-4" titulo="Concentração (Pareto)" tip="Mostra quantos itens concentram o faturamento: a linha acumulada mostra que poucos produtos respondem pela maior parte das vendas." onDetalhes={() => setDetalhe(detRank(m.porProduto, 'Concentração por produto', 'Vendas - Concentracao.xlsx', 'Produto'))}>
              <Pareto itens={m.porProduto} total={m.faturamento} />
            </Tile>
          </div>
        </>
      )}

      {detalhe && <ModalDetalhe dados={detalhe} onClose={() => setDetalhe(null)} />}

      {!vazio && mode !== 'supabase' && (
        <div className="flex-none text-[11px] text-amber-700">Modo demonstração (dados não persistem).</div>
      )}
    </div>
  )
}

/* ------------------------------ tooltip ------------------------------ */
function Info({ tip }: { tip: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number; below: boolean } | null>(null)
  const W = 236
  function show() {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const below = r.bottom < window.innerHeight * 0.62
    setPos({ left: Math.max(8, Math.min(r.left + r.width / 2 - W / 2, window.innerWidth - W - 8)), top: below ? r.bottom + 6 : r.top - 6, below })
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

/* ------------------------------ controles ------------------------------ */
function Toggle<T extends string>({ valor, set, ops }: { valor: T; set: (v: T) => void; ops: [T, string][] }) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-line">
      {ops.map(([v, txt]) => (
        <button key={v} onClick={() => set(v)} className={`px-2 py-1 text-[11px] font-semibold transition ${valor === v ? 'bg-brand text-white' : 'bg-white text-muted hover:bg-paper'}`}>{txt}</button>
      ))}
    </div>
  )
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
        <span className="text-muted">{label}</span>
        <b>{isAll ? 'Todos' : `${count}/${opcoes.length}`}</b>
        <span className="text-[9px] text-muted">▼</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-8 z-50 max-h-[340px] w-56 overflow-auto rounded-lg border border-line bg-white p-2 shadow-xl">
            <div className="mb-1 flex gap-2 border-b border-line pb-1.5">
              <button className="rounded px-2 py-0.5 text-[11px] font-semibold text-brand hover:bg-brand/10" onClick={() => onChange(null)}>Todos</button>
              <button className="rounded px-2 py-0.5 text-[11px] font-semibold text-muted hover:bg-paper" onClick={() => onChange(new Set())}>Nenhum</button>
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

/* -------------------------------- tiles -------------------------------- */
function Tile({ titulo, tip, className, onDetalhes, acao, children }: { titulo: string; tip: string; className?: string; onDetalhes?: () => void; acao?: ReactNode; children: ReactNode }) {
  return (
    <div className={`flex min-h-0 flex-col rounded-xl border border-line bg-surface p-2.5 shadow-card ${className ?? ''}`}>
      <div className="mb-1.5 flex flex-none items-center gap-2">
        <h3 className="text-[13px] font-bold text-ink">{titulo}</h3>
        <Info tip={tip} />
        <div className="ml-auto flex items-center gap-1.5">
          {acao}
          {onDetalhes && (
            <button onClick={onDetalhes} className="inline-flex items-center gap-1 rounded-md border border-brand/30 bg-brand/5 px-2 py-0.5 text-[10px] font-bold text-brand transition hover:bg-brand/15" title="Ver tabela detalhada">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18" /></svg>
              Detalhes
            </button>
          )}
        </div>
      </div>
      <div className="relative min-h-0 flex-1">{children}</div>
    </div>
  )
}

/* ------------------------------ modal detalhe ------------------------------ */
type Detalhe = { titulo: string; arquivo: string; colunas: { label: string; tipo: 'texto' | 'num' | 'pct' }[]; linhas: (string | number)[][] }
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
    ws['!cols'] = dados.colunas.map((c) => ({ wch: c.tipo === 'texto' ? 46 : 16 }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Detalhes')
    XLSX.writeFile(wb, dados.arquivo)
  }
  return createPortal(
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-none items-center justify-between border-b border-line px-5 py-3">
          <h3 className="font-serif text-lg font-semibold text-ink">{dados.titulo}</h3>
          <button onClick={onClose} className="text-2xl leading-none text-muted transition hover:text-ink" aria-label="Fechar">×</button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-5 py-2">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b-2 border-line text-muted">
                {dados.colunas.map((c, i) => (<th key={i} className={`py-2 font-semibold ${c.tipo === 'texto' ? 'text-left' : 'text-right'}`}>{c.label}</th>))}
              </tr>
            </thead>
            <tbody>
              {dados.linhas.map((linha, ri) => {
                const total = linha[0] === 'TOTAL'
                return (
                  <tr key={ri} className={`border-b border-line/60 ${total ? 'font-bold text-ink' : 'text-ink/90'}`}>
                    {linha.map((cel, ci) => (<td key={ci} className={`py-1.5 tnum ${dados.colunas[ci].tipo === 'texto' ? 'text-left' : 'text-right'}`}>{fmtCel(cel, dados.colunas[ci].tipo)}</td>))}
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
function Kpi({ lbl, valor, foot, tip, cor }: { lbl: string; valor: string; foot: string; tip: string; cor?: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-surface px-3 py-2">
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: cor ?? 'rgb(var(--brand))' }} />
      <div className="flex items-center"><span className="text-[10px] font-bold uppercase tracking-wider text-muted">{lbl}</span><Info tip={tip} /></div>
      <div className="mt-0.5 text-[19px] font-medium leading-tight tnum text-ink">{valor}</div>
      <div className="text-[10px] text-muted">{foot}</div>
    </div>
  )
}
function Alerta({ tipo, texto, onClose }: { tipo: 'erro' | 'ok'; texto: string; onClose: () => void }) {
  const c = tipo === 'erro' ? 'border-neg/30 bg-red-50 text-neg' : 'border-pos/30 bg-emerald-50 text-pos'
  return (
    <div className={`flex flex-none items-center justify-between gap-3 rounded-lg border px-4 py-2.5 text-[13px] font-medium ${c}`}>
      <span>{texto}</span>
      <button onClick={onClose} className="opacity-60 hover:opacity-100" aria-label="Fechar">✕</button>
    </div>
  )
}

/* ------------------------------ gráficos ------------------------------ */
function AreaFat({ serie }: { serie: { label: string; fat: number }[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const [dim, setDim] = useState({ w: 520, h: 300 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setDim({ w: Math.max(220, el.clientWidth), h: Math.max(150, el.clientHeight) })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  if (!serie.length) return <div className="flex h-full items-center text-[12px] text-muted">Sem vendas no filtro.</div>
  const { w: W, h: H } = dim
  const padL = 10, padR = 14, padT = 24, padB = 26
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const n = serie.length
  const denom = Math.max(1, n - 1)
  const vmax = Math.max(1, ...serie.map((b) => b.fat))
  const xs = (i: number) => (n === 1 ? padL + innerW / 2 : padL + (innerW * i) / denom)
  const ys = (v: number) => padT + innerH * (1 - v / vmax)
  const base = padT + innerH
  const pts = serie.map((b, i) => `${xs(i)},${ys(b.fat)}`).join(' ')
  const area = `M ${xs(0)},${base} L ${pts} L ${xs(n - 1)},${base} Z`
  const showVal = n <= 14
  const stepX = Math.ceil(n / 12)
  return (
    <div ref={ref} className="h-full w-full">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }} role="img" aria-label="Faturamento no tempo">
        <defs>
          <linearGradient id="fatFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FB6407" stopOpacity="0.32" />
            <stop offset="1" stopColor="#FDBE45" stopOpacity="0.03" />
          </linearGradient>
          <linearGradient id="fatLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#FDAD1E" />
            <stop offset="0.55" stopColor="#FB6407" />
            <stop offset="1" stopColor="#E8360A" />
          </linearGradient>
        </defs>
        <line x1={padL} y1={base} x2={W - padR} y2={base} stroke="#E2E1DE" strokeWidth={1} />
        <path d={area} fill="url(#fatFill)" />
        <polyline points={pts} fill="none" stroke="url(#fatLine)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {serie.map((b, i) => {
          const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'
          const lx = i === 0 ? xs(i) + 2 : i === n - 1 ? xs(i) - 2 : xs(i)
          return (
            <g key={i}>
              <circle cx={xs(i)} cy={ys(b.fat)} r={n <= 30 ? 3 : 0} fill={gradAt(Math.floor((i / Math.max(1, n - 1)) * (GRAD.length - 1)))} />
              {showVal && <text x={lx} y={ys(b.fat) - 8} fontSize={11} fontWeight={600} textAnchor={anchor} fill="#6B7280">{fmtCompacto(b.fat)}</text>}
              {i % stepX === 0 && <text x={xs(i)} y={H - 8} fontSize={11} textAnchor={anchor} fill="#64748B">{b.label}</text>}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
function BarrasH({ itens, total }: { itens: { nome: string; valor: number }[]; total: number }) {
  if (!itens.length) return <div className="flex h-full items-center text-[12px] text-muted">Sem vendas no filtro.</div>
  const max = itens[0].valor || 1
  return (
    <div className="flex h-full flex-col">
      {itens.map((it, i) => (
        <div key={it.nome} className="flex min-h-0 flex-1 items-center gap-1.5 text-[11px]">
          <div className="w-[38%] shrink-0 truncate text-ink" title={it.nome}>{it.nome}</div>
          <div className="h-3.5 flex-1 overflow-hidden rounded bg-paper">
            <div className="h-full rounded" style={{ width: `${(it.valor / max) * 100}%`, background: gradAt(i), minWidth: 2 }} />
          </div>
          <div className="w-[56px] shrink-0 text-right font-semibold tnum text-ink">{fmtCompacto(it.valor)}</div>
          <div className="w-[34px] shrink-0 text-right tnum text-muted">{total ? Math.round((it.valor / total) * 100) : 0}%</div>
        </div>
      ))}
    </div>
  )
}
function Donut({ itens, total }: { itens: { nome: string; valor: number }[]; total: number }) {
  if (!itens.length || total <= 0) return <div className="flex h-full items-center text-[12px] text-muted">Sem vendas no filtro.</div>
  const vis = itens.slice(0, 7)
  const size = 132, stroke = 26
  const r = (size - stroke) / 2, c = size / 2, C = 2 * Math.PI * r
  let off = 0
  const segs = vis.map((it, i) => {
    const len = (it.valor / total) * C
    const el = <circle key={it.nome} cx={c} cy={c} r={r} fill="none" stroke={GRAD[i % GRAD.length]} strokeWidth={stroke} strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off} transform={`rotate(-90 ${c} ${c})`} />
    off += len
    return el
  })
  return (
    <div className="flex h-full flex-col items-center gap-2">
      <div className="flex-none" style={{ height: 'min(54%, 210px)', aspectRatio: '1 / 1' }}>
        <svg viewBox={`0 0 ${size} ${size}`} width="100%" height="100%">
          {segs}
          <text x={c} y={c - 3} textAnchor="middle" fontSize={11} fill="#64748B">Faturamento</text>
          <text x={c} y={c + 13} textAnchor="middle" fontSize={14} fontWeight={700} fill="#B0451F">{fmtCompacto(total)}</text>
        </svg>
      </div>
      <div className="flex min-h-0 w-full flex-1 flex-col gap-0.5 overflow-auto">
        {vis.map((it, i) => (
          <div key={it.nome} className="flex items-center gap-1.5 text-[11px]">
            <span className="inline-block h-2.5 w-2.5 flex-none rounded-sm" style={{ background: GRAD[i % GRAD.length] }} />
            <span className="min-w-0 flex-1 truncate text-ink" title={it.nome}>{it.nome}</span>
            <span className="flex-none font-semibold tnum text-ink">{Math.round((it.valor / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
function Pareto({ itens, total }: { itens: { nome: string; valor: number }[]; total: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [dim, setDim] = useState({ w: 400, h: 200 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setDim({ w: Math.max(220, el.clientWidth), h: Math.max(120, el.clientHeight) })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  if (!itens.length || total <= 0) return <div className="flex h-full items-center text-[12px] text-muted">Sem vendas no filtro.</div>
  const top = itens.slice(0, 12)
  const { w: W, h: H } = dim
  const padL = 6, padR = 6, padT = 16, padB = 14
  const innerW = W - padL - padR, innerH = H - padT - padB
  const nb = top.length
  const bw = innerW / nb
  const maxv = top[0].valor || 1
  let acc = 0
  const cum = top.map((it) => { acc += it.valor; return acc / total })
  const cx = (i: number) => padL + bw * i + bw / 2
  const cyLine = (p: number) => padT + innerH * (1 - p)
  const marca = cum.findIndex((p) => p >= 0.8)
  return (
    <div ref={ref} className="h-full w-full">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }} role="img" aria-label="Concentração de produtos (Pareto)">
        <line x1={padL} y1={cyLine(0.8)} x2={W - padR} y2={cyLine(0.8)} stroke="#CBD5E1" strokeWidth={1} strokeDasharray="4 4" />
        <text x={W - padR} y={cyLine(0.8) - 3} fontSize={10} textAnchor="end" fill="#94A3B8">80%</text>
        {top.map((it, i) => {
          const bh = (it.valor / maxv) * innerH
          return <rect key={i} x={padL + bw * i + 2} y={padT + innerH - bh} width={Math.max(1, bw - 4)} height={bh} rx={1.5} style={{ fill: gradAt(i) }} />
        })}
        <polyline points={cum.map((p, i) => `${cx(i)},${cyLine(p)}`).join(' ')} fill="none" stroke="#8A3F1C" strokeWidth={2} />
        {cum.map((p, i) => <circle key={i} cx={cx(i)} cy={cyLine(p)} r={2.2} fill="#8A3F1C" />)}
      </svg>
      <div className="-mt-4 text-center text-[10px] text-muted">
        {marca >= 0 ? `${marca + 1} de ${itens.length} produtos = 80% do faturamento` : `${itens.length} produtos no filtro`}
      </div>
    </div>
  )
}
