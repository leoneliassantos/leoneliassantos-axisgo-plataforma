import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { supabase, fetchAllRows } from '../../lib/supabase'
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
  categoria: string // agrupador do "de-para" (ex.: Açaí, Mussarela) — coluna K da base
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
// A base tem a coluna "categoria" preenchida? (define se o agrupamento padrão é
// por Categoria — o de-para do cliente — ou cai para Produto em bases sem ela.)
const temCategoria = (rs: Venda[]) => rs.some((r) => r.categoria)
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

/* ------------------------------------------------------------------ *
 *  Foodpro — parser do PDF "Relatório de Notas Fiscais Detalhado".
 *  Normaliza para o MESMO formato do Olist (nota item a item), marcando
 *  origem = 'Foodpro'. As páginas vêm em paisagem (rotacionadas), então
 *  reconstruímos as linhas pela coordenada VISUAL (viewport) e lemos a
 *  nota do cabeçalho + os itens (7 colunas numéricas fixas no fim).
 * ------------------------------------------------------------------ */
const FOODPRO_ORIGEM = 'Foodpro'
async function parseFoodproPDF(file: File): Promise<Venda[]> {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  ;(pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = (worker as { default: string }).default

  const buf = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise

  // "Número: 12405 Emissão: 01/07/2026 Cliente: PROJETO FABRICA Valor: 350,00 Status: Enviada"
  const notaRe = /^Número:\s*(\S+)\s+Emissão:\s*(\d{2}\/\d{2}\/\d{4})\s+Cliente:\s*(.*?)\s+Valor:\s*([\d.,]+)\s+Status:\s*\S+/
  const out: Venda[] = []
  let cur: { nota: string; data: string; cliente: string; valor: number } | null = null
  let curItens: Venda[] = []

  // Rateia o desconto/acréscimo do rodapé da nota entre seus itens, para o total
  // item a item bater com o "Valor" (líquido) da nota — igual ao total do Foodpro.
  const fecharNota = () => {
    if (!cur) return
    const soma = curItens.reduce((s, it) => s + it.qtd * it.unit, 0)
    const fator = cur.valor > 0 && soma > 0 && Math.abs(cur.valor - soma) > 0.01 ? cur.valor / soma : 1
    for (const it of curItens) out.push(fator === 1 ? it : { ...it, unit: it.unit * fator })
    curItens = []
  }

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const vp = page.getViewport({ scale: 1 })
    const tc = await page.getTextContent()

    // agrupa os fragmentos de texto em linhas visuais (mesmo y do viewport), ordenando por x
    const linhas = new Map<number, { x: number; s: string }[]>()
    for (const it of tc.items as { str?: string; transform?: number[] }[]) {
      const s = it.str
      if (!s || !s.trim() || !it.transform) continue
      const [vx, vy] = vp.convertToViewportPoint(it.transform[4], it.transform[5])
      const yk = Math.round(vy)
      let key: number | null = null
      for (const k of linhas.keys()) { if (Math.abs(k - yk) <= 3) { key = k; break } }
      if (key === null) { key = yk; linhas.set(key, []) }
      linhas.get(key)!.push({ x: vx, s })
    }

    for (const y of [...linhas.keys()].sort((a, b) => a - b)) {
      const line = linhas.get(y)!.sort((a, b) => a.x - b.x).map((o) => o.s).join(' ').replace(/\s+/g, ' ').trim()
      const m = notaRe.exec(line)
      if (m) {
        fecharNota()
        const [dd, mm, yy] = [m[2].slice(0, 2), m[2].slice(3, 5), m[2].slice(6)]
        cur = { nota: m[1], data: `${yy}-${mm}-${dd}`, cliente: m[3].trim(), valor: parseBR(m[4]) }
        continue
      }
      if (!cur || line.startsWith('Item Cod')) continue
      // linha de item: nº do item + cód. produto no início; 7 colunas no fim
      // (Quant · V.Unit · V.Total · Origem fiscal · CFOP · CST · NCM)
      const t = line.split(' ')
      if (t.length < 9 || !/^\d+$/.test(t[0]) || !/^\d+$/.test(t[1])) continue
      const cfop = t[t.length - 3]
      const qtd = parseBR(t[t.length - 7])
      const unit = parseBR(t[t.length - 6])
      if (!qtd && !unit) continue
      curItens.push({
        nota: cur.nota, data: cur.data,
        tipo: /^[12]/.test(cfop) ? 'Entrada' : 'Saída', // CFOP 1xxx/2xxx = devolução/entrada; 5xxx/6xxx = venda
        cliente: cur.cliente, sku: t[1], produto: t.slice(2, t.length - 7).join(' '),
        qtd, unit, serie: '', origem: FOODPRO_ORIGEM, categoria: '',
      })
    }
  }
  fecharNota() // finaliza a última nota
  if (!out.length) throw new Error('não encontrei notas no PDF (esperado o "Relatório de Notas Fiscais Detalhado" do Foodpro).')
  return out
}
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
  const [ano, setAno] = useState('') // '' = todos os anos
  const [dataDe, setDataDe] = useState('')
  const [dataAte, setDataAte] = useState('')
  const [selCanais, setSelCanais] = useState<Set<string> | null>(null) // null = todos
  const [gran, setGran] = useState<Gran>('semana')
  const [rankPor, setRankPor] = useState<'categoria' | 'produto' | 'sku'>('categoria')
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null)
  const [view, setView] = useState<'painel' | 'comparativo' | 'abc'>('painel')
  // Base sem coluna categoria (ex.: cliente ainda não migrado): cai para Produto.
  useEffect(() => { if (rows.length && !temCategoria(rows)) setRankPor('produto') }, [rows])

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
    // O PostgREST limita cada requisição (padrão 1.000 linhas). Buscamos em páginas
    // e juntamos tudo — senão o painel só enxergaria as datas mais antigas e cortaria
    // o restante (ex.: base grande do Foodpro ficando de fora).
    type LinhaVenda = {
      nota: string | null; data: string | null; tipo: string | null; cliente: string | null
      sku: string | null; produto: string | null; quantidade: number | string | null
      valor_unitario: number | string | null; serie: string | null; origem: string | null
      categoria?: string | null
    }
    const COLS = 'nota, data, tipo, cliente, sku, produto, quantidade, valor_unitario, serie, origem'
    // Tenta ler com a coluna "categoria" (agrupador do de-para). Se o banco deste
    // cliente ainda não tem essa coluna, o PostgREST devolve erro citando "categoria":
    // nesse caso relê sem ela, para a tela seguir funcionando (retrocompatível).
    let res = await fetchAllRows<LinhaVenda>((from, to) =>
      supabase!.from('vendas').select(`${COLS}, categoria`).order('data').order('id').range(from, to))
    if (res.error && /categoria/i.test(res.error.message)) {
      res = await fetchAllRows<LinhaVenda>((from, to) =>
        supabase!.from('vendas').select(COLS).order('data').order('id').range(from, to))
    }
    const { data: brutos, error } = res
    if (error) {
      setErro('Não foi possível carregar a base. Verifique se a tabela "vendas" foi criada no Supabase.')
      setLoading(false)
      return
    }
    const mapped: Venda[] = brutos.map((r) => ({
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
      categoria: (r.categoria ?? '').toString().trim(),
    }))
    setRows(mapped)
    if (mapped.length) {
      // Abre no ano mais recente da base (o seletor de Ano começa nele).
      const anosArr = Array.from(new Set(mapped.map((r) => r.data.slice(0, 4)).filter(Boolean))).sort()
      const ultimo = anosArr[anosArr.length - 1] ?? ''
      setAno(ultimo)
      const base = ultimo ? mapped.filter((r) => r.data.slice(0, 4) === ultimo) : mapped
      const ds = base.map((r) => r.data).filter(Boolean).sort()
      setDataDe(ds[0] ?? '')
      setDataAte(ds[ds.length - 1] ?? '')
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

  // Anos presentes na base (para o seletor) e a base já recortada pelo ano escolhido.
  const anos = useMemo(
    () => Array.from(new Set(rows.map((r) => r.data.slice(0, 4)).filter(Boolean))).sort(),
    [rows],
  )
  const rowsView = useMemo(() => (ano ? rows.filter((r) => r.data.slice(0, 4) === ano) : rows), [rows, ano])

  // Troca o ano e reajusta o período (De/Até) para o intervalo real daquele ano.
  function escolherAno(a: string) {
    setAno(a)
    const base = a ? rows.filter((r) => r.data.slice(0, 4) === a) : rows
    const ds = base.map((r) => r.data).filter(Boolean).sort()
    setDataDe(ds[0] ?? '')
    setDataAte(ds[ds.length - 1] ?? '')
  }

  /* ---------- métricas com filtros ---------- */
  const m = useMemo(() => {
    const canalOk = (c: string) => selCanais === null || selCanais.has(c)
    const de = dataDe || '0000-01-01'
    const ate = dataAte || '9999-12-31'
    const f = rowsView.filter((r) => r.data >= de && r.data <= ate && canalOk(r.origem))

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
    const porCategoria = agrupar((r) => r.categoria)

    return { faturamento, itens, pedidos, skusAtivos, ticket, serie, porCanal, porProduto, porSku, porCategoria }
  }, [rowsView, selCanais, dataDe, dataAte, gran])

  /* ---------- ações ---------- */
  async function baixarBase() {
    try {
      setBusy(true)
      const XLSX = await import('xlsx')
      const aoa: unknown[][] = [['Nº nota', 'Data', 'Tipo', 'Cliente/Fornecedor', 'Código (SKU)', 'Produto', 'Quantidade', 'Valor unitário', 'Nº série', 'Origem', 'Categoria']]
      for (const r of rows) {
        const p = r.data.split('-')
        const dt = p.length === 3 ? new Date(+p[0], +p[1] - 1, +p[2]) : null
        aoa.push([r.nota, dt, r.tipo, r.cliente, r.sku, r.produto, r.qtd, r.unit, r.serie, r.origem, r.categoria])
      }
      const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true })
      ws['!cols'] = [{ wch: 10 }, { wch: 12 }, { wch: 8 }, { wch: 30 }, { wch: 16 }, { wch: 54 }, { wch: 11 }, { wch: 13 }, { wch: 8 }, { wch: 12 }, { wch: 18 }]
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
      const isPdf = /\.pdf$/i.test(file.name)
      let novo: Venda[] = []
      let ignoradas = 0

      if (isPdf) {
        // Foodpro — PDF "Relatório de NFe Detalhado" (marca origem = 'Foodpro')
        novo = await parseFoodproPDF(file)
      } else {
        // Olist (ou outra planilha item a item) — Excel/CSV
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
              categoria: find(hs, 'CATEGORIA'),
            }
            break
          }
        }
        if (hi < 0) throw new Error('não encontrei as colunas (Data, Produto, Quantidade, Valor unitário). Confira o cabeçalho.')

        const get = (row: unknown[], i: number) => (i >= 0 ? row[i] : '')
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
            origem: ((get(row, col.origem) ?? '').toString().trim()) || 'Olist',
            categoria: (get(row, col.categoria) ?? '').toString().trim(),
          })
        }
        if (!novo.length) throw new Error('nenhuma venda válida encontrada na planilha.')
      }

      // intervalo de datas coberto POR CANAL → substituição incremental (canal + período):
      // apaga só as vendas do mesmo canal DENTRO do período do arquivo; o resto é mantido.
      const janela = new Map<string, { d0: string; d1: string }>()
      for (const r of novo) {
        const o = r.origem.trim() || 'Olist'
        const w = janela.get(o)
        if (!w) janela.set(o, { d0: r.data, d1: r.data })
        else { if (r.data < w.d0) w.d0 = r.data; if (r.data > w.d1) w.d1 = r.data }
      }

      if (mode === 'supabase' && supabase) {
        const payload = novo.map((r) => ({
          nota: r.nota, data: r.data, tipo: r.tipo, cliente: r.cliente, sku: r.sku,
          produto: r.produto, quantidade: r.qtd, valor_unitario: r.unit, serie: r.serie, origem: r.origem,
          categoria: r.categoria,
        }))
        const { error } = await supabase.rpc('vendas_replace_periodo', { p_rows: payload })
        if (error) throw new Error(error.message)
        await carregar()
      } else {
        // modo local (sem Supabase): espelha a substituição por canal+período em memória
        setRows((prev) => [
          ...prev.filter((r) => {
            const w = janela.get(r.origem.trim() || 'Olist')
            return !(w && r.data >= w.d0 && r.data <= w.d1)
          }),
          ...novo,
        ])
      }
      const brd = (iso: string) => iso.split('-').reverse().join('/')
      const resumo = [...janela.entries()].map(([o, w]) => `${o} (${brd(w.d0)}–${brd(w.d1)})`).join(' · ')
      setAviso(`Base atualizada: ${novo.length} vendas — ${resumo}${ignoradas ? ` · ${ignoradas} linhas ignoradas` : ''}. Só esse período/canal foi substituído; o restante foi mantido.`)
    } catch (e) {
      setErro(`Não consegui ler o arquivo: ${(e as Error).message}`)
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
  // Dimensão do ranking/Pareto (Categoria = de-para do cliente; Produto/SKU = detalhe).
  const rankRot = rankPor === 'categoria' ? 'Categoria' : rankPor === 'produto' ? 'Produto' : 'SKU'
  const rankUnid = rankPor === 'categoria' ? 'categorias' : rankPor === 'produto' ? 'produtos' : 'SKUs'
  const rank = rankPor === 'categoria' ? m.porCategoria : rankPor === 'produto' ? m.porProduto : m.porSku
  const conc80 = (() => {
    const arr = rank, tot = m.faturamento
    if (!arr.length || tot <= 0) return ''
    let acc = 0, k = 0
    for (const it of arr) { acc += it.valor; k++; if (acc / tot >= 0.8) break }
    return `${k} de ${arr.length} ${rankUnid} = 80% do faturamento`
  })()

  if (loading) return <div className="grid place-items-center rounded-2xl border border-line bg-surface py-20 text-sm text-muted">Carregando vendas…</div>

  return (
    <div
      ref={wrapRef}
      style={{ width: '100%', height: !vazio && view === 'painel' ? altura : undefined, overflow: !vazio && view === 'painel' ? 'hidden' : undefined }}
      className="flex flex-col gap-2"
    >
      {/* Barra de topo: título + ações */}
      <div className="flex flex-none flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-serif text-lg font-semibold text-ink">Vendas</h2>
          <p className="text-[12px] text-muted">Notas de venda item a item · faturamento por canal, produto e período</p>
        </div>
        {!vazio && (
          <div className="flex flex-wrap items-center gap-2">
            {view !== 'comparativo' && (
              <label className="flex items-center gap-1.5 text-[12px]" title="Filtra os indicadores por ano. O Comparativo cruza anos livremente, por isso não usa este seletor.">
                <span className="font-bold uppercase tracking-wider text-muted">Ano</span>
                <select
                  value={ano}
                  onChange={(e) => escolherAno(e.target.value)}
                  className="rounded-md border border-line bg-white px-2 py-1 text-[12px] font-semibold text-ink outline-none focus:border-ink/40"
                >
                  <option value="">Todos</option>
                  {anos.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </label>
            )}
            <Toggle valor={view} set={setView} ops={[['painel', 'Painel'], ['comparativo', 'Comparativo'], ['abc', 'Curva ABC']]} />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-[12px] font-bold text-ink transition hover:bg-paper disabled:opacity-50"
            onClick={baixarBase} disabled={busy || vazio} title="Baixar a base atual em Excel"
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>
            Baixar base
          </button>
          {isAdmin && (
            <button
              className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-2 text-[12px] font-bold text-white shadow-brand transition hover:brightness-125 disabled:opacity-50"
              onClick={() => fileRef.current?.click()} disabled={busy} title="Enviar Excel do Olist ou PDF do Foodpro. Substitui só o canal e o período do arquivo; as demais datas e canais são mantidos."
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21V9" /><path d="m7 14 5-5 5 5" /><path d="M5 3h14" /></svg>
              {busy ? 'Processando…' : 'Atualizar base'}
            </button>
          )}
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} />
        </div>
      </div>

      {erro && <Alerta tipo="erro" texto={erro} onClose={() => setErro(null)} />}
      {aviso && <Alerta tipo="ok" texto={aviso} onClose={() => setAviso(null)} />}

      {vazio ? (
        <div className="grid place-items-center gap-2 rounded-2xl border border-dashed border-line bg-surface/60 px-6 py-16 text-center">
          <p className="font-serif text-lg text-ink">A base de vendas ainda não foi carregada.</p>
          <p className="max-w-md text-sm text-muted">
            {isAdmin
              ? 'Clique em “Atualizar base” e envie o Excel do Olist ou o PDF do Foodpro (Relatório de NFe Detalhado). Cada envio atualiza só o seu canal e o período do arquivo (as demais datas ficam), e os dois se consolidam nos mesmos indicadores.'
              : 'Assim que um administrador enviar a base, o painel de vendas aparecerá aqui.'}
          </p>
        </div>
      ) : view === 'comparativo' ? (
        <Comparativo rows={rows} />
      ) : view === 'abc' ? (
        <AbcCurva rows={rowsView} />
      ) : (
        <>
          {/* Filtros */}
          <div className="flex flex-none flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Filtros</span>
            <div className="flex items-center gap-1.5 text-[12px]">
              <span className="text-muted">Período</span>
              <input type="date" value={dataDe} onChange={(e) => setDataDe(e.target.value)} className="rounded-md border border-line bg-white px-2 py-1 text-[12px] font-semibold text-ink outline-none focus:border-ink/40" />
              <span className="text-muted">até</span>
              <input type="date" value={dataAte} onChange={(e) => setDataAte(e.target.value)} className="rounded-md border border-line bg-white px-2 py-1 text-[12px] font-semibold text-ink outline-none focus:border-ink/40" />
            </div>
            <MultiSelect label="Canal" opcoes={canais} value={selCanais} onChange={setSelCanais} />
            <div className="flex items-center gap-1 text-[12px]">
              <span className="text-muted">Ver por</span>
              <Toggle valor={gran} set={setGran} ops={[['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês']]} />
            </div>
            <button
              className="ml-auto rounded-md border border-line px-2.5 py-1 text-[12px] font-medium text-muted transition hover:bg-paper"
              onClick={() => { const ds = rowsView.map((r) => r.data).filter(Boolean).sort(); setDataDe(ds[0] ?? ''); setDataAte(ds[ds.length - 1] ?? ''); setSelCanais(null) }}
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

            <Tile className="col-span-12 lg:col-span-4" titulo={`Top ${rankRot}s`} tip="O que mais fatura no período/canal. Alterne entre Categoria (agrupa itens semelhantes), Produto e SKU no botão." onDetalhes={() => setDetalhe(detRank(rank, `Top ${rankUnid}`, `Vendas - Top ${rankPor}.xlsx`, rankRot))}
              acao={<Toggle valor={rankPor} set={setRankPor} ops={[['categoria', 'Categoria'], ['produto', 'Produto'], ['sku', 'SKU']]} />}
            >
              <BarrasH itens={rank.slice(0, 6)} total={m.faturamento} />
            </Tile>

            <Tile className="col-span-12 lg:col-span-3 lg:row-span-2" titulo="Faturamento por canal" tip="Participação de cada canal de venda (Origem). Hoje só Olist; pronto para Shopee, Mercado Livre, TikTok, etc." onDetalhes={() => setDetalhe(detCanal())}>
              <Donut itens={m.porCanal} total={m.faturamento} />
            </Tile>

            <Tile className="col-span-12 lg:col-span-4" titulo="Concentração (Pareto)" sub={conc80} tip="Mostra quantos itens concentram o faturamento: a linha acumulada mostra que poucos respondem pela maior parte das vendas. Segue a dimensão escolhida em “Top” (Categoria, Produto ou SKU)." onDetalhes={() => setDetalhe(detRank(rank, `Concentração por ${rankRot.toLowerCase()}`, 'Vendas - Concentracao.xlsx', rankRot))}>
              <Pareto itens={rank} total={m.faturamento} />
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
    <span ref={ref} onMouseEnter={show} onMouseLeave={() => setPos(null)} className="ml-1 inline-grid h-3.5 w-3.5 cursor-help place-items-center rounded-full border border-ink/30 align-middle text-[9px] font-bold text-muted">
      i
      {pos && createPortal(
        <span style={{ position: 'fixed', left: pos.left, top: pos.top, width: W, transform: pos.below ? undefined : 'translateY(-100%)', background: '#EEF3F9', color: '#122238', borderColor: '#DBE4EF' }} className="pointer-events-none z-[100] rounded-lg border px-3 py-2 text-[11px] font-normal leading-snug shadow-xl">{tip}</span>,
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
        <button key={v} onClick={() => set(v)} className={`px-2 py-1 text-[11px] font-semibold transition ${valor === v ? 'bg-ink text-white' : 'bg-white text-muted hover:bg-paper'}`}>{txt}</button>
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
              <button className="rounded px-2 py-0.5 text-[11px] font-semibold text-ink hover:bg-paper" onClick={() => onChange(null)}>Todos</button>
              <button className="rounded px-2 py-0.5 text-[11px] font-semibold text-muted hover:bg-paper" onClick={() => onChange(new Set())}>Nenhum</button>
            </div>
            {opcoes.map((c) => (
              <label key={c} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-paper">
                <input type="checkbox" checked={has(c)} onChange={() => toggle(c)} className="accent-ink" />
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
function Tile({ titulo, tip, sub, className, onDetalhes, acao, children }: { titulo: string; tip: string; sub?: string; className?: string; onDetalhes?: () => void; acao?: ReactNode; children: ReactNode }) {
  return (
    <div className={`flex min-h-0 flex-col rounded-xl border border-line bg-surface p-2.5 shadow-card ${className ?? ''}`}>
      <div className="mb-1.5 flex flex-none items-start gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1"><h3 className="text-[13px] font-bold text-ink">{titulo}</h3><Info tip={tip} /></div>
          {sub && <p className="text-[10px] leading-tight text-muted">{sub}</p>}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {acao}
          {onDetalhes && (
            <button onClick={onDetalhes} className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-0.5 text-[10px] font-bold text-ink transition hover:bg-paper" title="Ver tabela detalhada">
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
          <button onClick={exportar} className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-bold text-white shadow-brand transition hover:brightness-125">
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
        {serie.map((b, i) => {
          const hw = n > 1 ? innerW / (n - 1) : innerW
          return (
            <rect key={`h${i}`} x={Math.max(padL, xs(i) - hw / 2)} y={padT} width={hw} height={innerH} fill="transparent">
              <title>{`${b.label}\nFaturamento: R$ ${fmt0(b.fat)}`}</title>
            </rect>
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
          <div className="h-3.5 flex-1 overflow-hidden rounded bg-paper" title={`${it.nome}\nFaturamento: R$ ${fmt0(it.valor)}${total ? `\nParticipação: ${Math.round((it.valor / total) * 100)}% do total` : ''}`}>
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
    const el = (
      <circle key={it.nome} cx={c} cy={c} r={r} fill="none" stroke={GRAD[i % GRAD.length]} strokeWidth={stroke} strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off} transform={`rotate(-90 ${c} ${c})`}>
        <title>{`${it.nome}\nFaturamento: R$ ${fmt0(it.valor)}\nParticipação: ${Math.round((it.valor / total) * 100)}%`}</title>
      </circle>
    )
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
  return (
    <div ref={ref} className="h-full w-full">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }} role="img" aria-label="Concentração de produtos (Pareto)">
        <line x1={padL} y1={cyLine(0.8)} x2={W - padR} y2={cyLine(0.8)} stroke="#CBD5E1" strokeWidth={1} strokeDasharray="4 4" />
        <text x={W - padR} y={cyLine(0.8) - 3} fontSize={10} textAnchor="end" fill="#94A3B8">80%</text>
        {top.map((it, i) => {
          const bh = (it.valor / maxv) * innerH
          return (
            <rect key={i} x={padL + bw * i + 2} y={padT + innerH - bh} width={Math.max(1, bw - 4)} height={bh} rx={1.5} style={{ fill: gradAt(i) }}>
              <title>{`${it.nome}\nFaturamento: R$ ${fmt0(it.valor)}\nAcumulado: ${Math.round(cum[i] * 100)}%`}</title>
            </rect>
          )
        })}
        <polyline points={cum.map((p, i) => `${cx(i)},${cyLine(p)}`).join(' ')} fill="none" stroke="#8A3F1C" strokeWidth={2} />
        {cum.map((p, i) => <circle key={i} cx={cx(i)} cy={cyLine(p)} r={2.2} fill="#8A3F1C" />)}
      </svg>
    </div>
  )
}

/* ============================ COMPARATIVO ============================ */
function monthRange(ym: string): [string, string] {
  const [y, mo] = ym.split('-').map(Number)
  return [`${ym}-01`, `${ym}-${pad2(new Date(y, mo, 0).getDate())}`]
}
function mesLabel(ym: string): string {
  if (!ym) return '—'
  const [y, mo] = ym.split('-')
  return `${MESES[+mo - 1]}/${y.slice(2)}`
}
function br(iso: string): string {
  const p = iso.split('-')
  return p.length === 3 ? `${p[2]}/${p[1]}` : iso
}
interface Metrica {
  fat: number; itens: number; pedidos: number; skus: number; ticket: number
  canal: Map<string, number>; produto: Map<string, number>; sku: Map<string, number>; categoria: Map<string, number>
}
function calcMetrica(sub: Venda[]): Metrica {
  const byKey = (k: (r: Venda) => string) => {
    const mp = new Map<string, number>()
    for (const r of sub) { const key = k(r) || '(sem)'; mp.set(key, (mp.get(key) || 0) + r.qtd * r.unit) }
    return mp
  }
  const fat = sub.reduce((s, r) => s + r.qtd * r.unit, 0)
  const pedidos = new Set(sub.map((r) => r.nota)).size
  return {
    fat, itens: sub.reduce((s, r) => s + r.qtd, 0), pedidos,
    skus: new Set(sub.filter((r) => r.sku).map((r) => r.sku)).size,
    ticket: pedidos ? fat / pedidos : 0,
    canal: byKey((r) => r.origem), produto: byKey((r) => r.produto), sku: byKey((r) => r.sku), categoria: byKey((r) => r.categoria),
  }
}
function pct(a: number, b: number): number | null { return a <= 0 ? null : ((b - a) / a) * 100 }
function pctTxt(a: number, b: number): string {
  const p = pct(a, b)
  if (p === null) return b > 0 ? 'novo' : '—'
  return `${p >= 0 ? '+' : ''}${p.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}
const UP = '#0F9D58', DOWN = '#C0392B', FLAT = '#94A3B8'
const deltaCor = (a: number, b: number) => (b > a + 0.005 ? UP : b < a - 0.005 ? DOWN : FLAT)

function Comparativo({ rows }: { rows: Venda[] }) {
  const [modo, setModo] = useState<'mes' | 'intervalo'>('mes')
  const [selCanais, setSelCanais] = useState<Set<string> | null>(null)
  const [rankPor, setRankPor] = useState<'categoria' | 'produto' | 'sku'>('categoria')
  useEffect(() => { if (rows.length && !temCategoria(rows)) setRankPor('produto') }, [rows])
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null)
  const [mesA, setMesA] = useState(''); const [mesB, setMesB] = useState('')
  const [aDe, setADe] = useState(''); const [aAte, setAAte] = useState('')
  const [bDe, setBDe] = useState(''); const [bAte, setBAte] = useState('')

  const meses = useMemo(() => Array.from(new Set(rows.map((r) => r.data.slice(0, 7)))).sort(), [rows])
  const canais = useMemo(() => Array.from(new Set(rows.map((r) => r.origem))).sort((a, b) => a.localeCompare(b)), [rows])

  useEffect(() => {
    if (!meses.length) return
    const b = meses[meses.length - 1], a = meses[Math.max(0, meses.length - 2)]
    setMesA(a); setMesB(b)
    const [a1, a2] = monthRange(a), [b1, b2] = monthRange(b)
    setADe(a1); setAAte(a2); setBDe(b1); setBAte(b2)
  }, [meses])

  const canalOk = (c: string) => selCanais === null || selCanais.has(c)
  const A = useMemo(() => calcMetrica(rows.filter((r) => canalOk(r.origem) && (modo === 'mes' ? r.data.slice(0, 7) === mesA : r.data >= aDe && r.data <= aAte))), [rows, modo, mesA, aDe, aAte, selCanais])
  const B = useMemo(() => calcMetrica(rows.filter((r) => canalOk(r.origem) && (modo === 'mes' ? r.data.slice(0, 7) === mesB : r.data >= bDe && r.data <= bAte))), [rows, modo, mesB, bDe, bAte, selCanais])
  const rotA = modo === 'mes' ? mesLabel(mesA) : `${br(aDe)}–${br(aAte)}`
  const rotB = modo === 'mes' ? mesLabel(mesB) : `${br(bDe)}–${br(bAte)}`

  const uni = (ma: Map<string, number>, mb: Map<string, number>) =>
    Array.from(new Set([...ma.keys(), ...mb.keys()])).map((nome) => ({ nome, a: ma.get(nome) || 0, b: mb.get(nome) || 0 }))
  const canalCmp = uni(A.canal, B.canal).sort((x, y) => y.b - x.b)
  const dim: 'categoria' | 'produto' | 'sku' = rankPor
  const dimRot = dim === 'categoria' ? 'Categoria' : dim === 'produto' ? 'Produto' : 'SKU'
  const rankCmp = uni(A[dim], B[dim]).filter((x) => x.a > 0 || x.b > 0).sort((x, y) => y.b - x.b)
  const evol = meses.map((ym) => ({ ym, label: mesLabel(ym), fat: rows.filter((r) => canalOk(r.origem) && r.data.slice(0, 7) === ym).reduce((s, r) => s + r.qtd * r.unit, 0) }))

  const kpis: { lbl: string; a: number; b: number; money?: boolean; dec?: boolean }[] = [
    { lbl: 'Faturamento', a: A.fat, b: B.fat, money: true },
    { lbl: 'Pedidos', a: A.pedidos, b: B.pedidos },
    { lbl: 'Itens', a: A.itens, b: B.itens },
    { lbl: 'Ticket médio', a: A.ticket, b: B.ticket, money: true, dec: true },
    { lbl: 'SKUs ativos', a: A.skus, b: B.skus },
  ]
  const linhasDet = (arr: { nome: string; a: number; b: number }[]): (string | number)[][] =>
    arr.map((x) => [x.nome, Math.round(x.a), Math.round(x.b), Math.round(x.b - x.a), pct(x.a, x.b) === null ? 0 : Math.round(pct(x.a, x.b)!)])
  const colsCmp = (rot: string) => [{ label: rot, tipo: 'texto' as const }, { label: `${rotA} (R$)`, tipo: 'num' as const }, { label: `${rotB} (R$)`, tipo: 'num' as const }, { label: 'Δ (R$)', tipo: 'num' as const }, { label: 'Δ %', tipo: 'pct' as const }]

  return (
    <div className="flex flex-col gap-3 pb-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Comparar</span>
        <Toggle valor={modo} set={setModo} ops={[['mes', 'Por mês'], ['intervalo', 'Por intervalo']]} />
        {modo === 'mes' ? (
          <div className="flex items-center gap-1.5 text-[12px]">
            <SelMes meses={meses} value={mesA} onChange={setMesA} /><span className="text-muted">×</span><SelMes meses={meses} value={mesB} onChange={setMesB} />
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
            <span className="rounded bg-paper px-1.5 py-0.5 text-[11px] font-semibold text-muted">A</span>
            <DateIn value={aDe} onChange={setADe} /><span className="text-muted">–</span><DateIn value={aAte} onChange={setAAte} />
            <span className="mx-1 text-muted">×</span>
            <span className="rounded bg-paper px-1.5 py-0.5 text-[11px] font-semibold text-muted">B</span>
            <DateIn value={bDe} onChange={setBDe} /><span className="text-muted">–</span><DateIn value={bAte} onChange={setBAte} />
          </div>
        )}
        <MultiSelect label="Canal" opcoes={canais} value={selCanais} onChange={setSelCanais} />
        <span className="ml-auto text-[11px] text-muted">A = <b className="text-ink">{rotA}</b> · B = <b className="text-ink">{rotB}</b></span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map((k) => <KpiCmp key={k.lbl} {...k} rotA={rotA} rotB={rotB} />)}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <CardC titulo="Evolução mês a mês" sub="Faturamento por mês (canal filtrado)" tip="Faturamento total de cada mês da base (respeitando o filtro de canal). As barras dos períodos A e B ficam destacadas para situar a comparação. Passe o mouse na barra para ver o valor.">
          <BarrasMes itens={evol} mesA={modo === 'mes' ? mesA : ''} mesB={modo === 'mes' ? mesB : ''} />
        </CardC>
        <CardC titulo="Por canal (Origem)" sub={`${rotA} × ${rotB}`} tip="Faturamento de cada canal de venda no período A e no B, com a variação % (verde subiu, vermelho caiu). Hoje só Olist; quando entrarem outros canais, aparecem aqui." onDet={() => setDetalhe({ titulo: 'Comparativo por canal', arquivo: 'Vendas - Comparativo canal.xlsx', colunas: colsCmp('Canal'), linhas: linhasDet(canalCmp) })}>
          <ListaCmp itens={canalCmp} rotA={rotA} rotB={rotB} />
        </CardC>
      </div>

      <CardC titulo={`Por ${dimRot.toLowerCase()} — quem cresceu e quem caiu`} sub={`${rotA} × ${rotB}`}
        tip="Ranking comparando os dois períodos. Δ mostra a variação em R$ e Δ% em percentual (verde = cresceu, vermelho = caiu). Alterne entre Categoria, Produto e SKU."
        acao={<Toggle valor={rankPor} set={setRankPor} ops={[['categoria', 'Categoria'], ['produto', 'Produto'], ['sku', 'SKU']]} />}
        onDet={() => setDetalhe({ titulo: `Comparativo por ${dimRot.toLowerCase()}`, arquivo: `Vendas - Comparativo ${rankPor}.xlsx`, colunas: colsCmp(dimRot), linhas: linhasDet(rankCmp) })}>
        <TabelaCmp itens={rankCmp.slice(0, 10)} rotA={rotA} rotB={rotB} rot={dimRot} />
      </CardC>

      {detalhe && <ModalDetalhe dados={detalhe} onClose={() => setDetalhe(null)} />}
    </div>
  )
}

function SelMes({ meses, value, onChange }: { meses: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-md border border-line bg-white px-2 py-1 text-[12px] font-semibold text-ink outline-none focus:border-ink/40">
      {meses.map((ym) => <option key={ym} value={ym}>{mesLabel(ym)}</option>)}
    </select>
  )
}
function DateIn({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className="rounded-md border border-line bg-white px-1.5 py-1 text-[12px] font-semibold text-ink outline-none focus:border-ink/40" />
}
function KpiCmp({ lbl, a, b, money, dec, rotA, rotB }: { lbl: string; a: number; b: number; money?: boolean; dec?: boolean; rotA: string; rotB: string }) {
  const cor = deltaCor(a, b)
  const val = (v: number) => (money ? `R$ ${dec ? fmt2(v) : fmt0(v)}` : fmt0(v))
  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-surface px-3 py-2">
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: cor }} />
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted">{lbl}</div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span className="text-[19px] font-medium leading-tight tnum text-ink">{val(b)}</span>
        <span className="text-[12px] font-bold tnum" style={{ color: cor }}>{pctTxt(a, b)}</span>
      </div>
      <div className="text-[10px] text-muted">{rotB} · {rotA}: <span className="tnum">{val(a)}</span></div>
    </div>
  )
}
function CardC({ titulo, sub, tip, acao, onDet, children }: { titulo: string; sub?: string; tip?: string; acao?: ReactNode; onDet?: () => void; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3 shadow-card">
      <div className="mb-2 flex items-center gap-2">
        <div>
          <div className="flex items-center gap-0.5"><h3 className="text-[13px] font-bold text-ink">{titulo}</h3>{tip && <Info tip={tip} />}</div>
          {sub && <p className="text-[11px] text-muted">{sub}</p>}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {acao}
          {onDet && (
            <button onClick={onDet} className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-0.5 text-[10px] font-bold text-ink transition hover:bg-paper" title="Ver tabela detalhada">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18" /></svg>
              Detalhes
            </button>
          )}
        </div>
      </div>
      {children}
    </div>
  )
}
function BarrasMes({ itens, mesA, mesB }: { itens: { ym: string; label: string; fat: number }[]; mesA: string; mesB: string }) {
  if (!itens.length) return <div className="py-6 text-center text-[12px] text-muted">Sem dados.</div>
  const max = Math.max(1, ...itens.map((i) => i.fat))
  return (
    <div className="flex h-40 items-end gap-2">
      {itens.map((it) => {
        const dest = it.ym === mesA || it.ym === mesB
        const cor = it.ym === mesB ? '#E8420A' : it.ym === mesA ? '#FDAD1E' : 'rgba(251,84,3,0.28)'
        return (
          <div key={it.ym} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[10px] font-semibold tnum text-ink">{fmtCompacto(it.fat)}</span>
            <div className="w-full rounded-t" style={{ height: `${(it.fat / max) * 100}%`, background: cor, minHeight: 2 }} title={`${it.label}\nFaturamento: R$ ${fmt0(it.fat)}`} />
            <span className={`text-[10px] ${dest ? 'font-bold text-ink' : 'text-muted'}`}>{it.label}</span>
          </div>
        )
      })}
    </div>
  )
}
function ListaCmp({ itens, rotA, rotB }: { itens: { nome: string; a: number; b: number }[]; rotA: string; rotB: string }) {
  if (!itens.length) return <div className="py-6 text-center text-[12px] text-muted">Sem dados.</div>
  const max = Math.max(1, ...itens.flatMap((x) => [x.a, x.b]))
  return (
    <div className="flex flex-col gap-2.5">
      {itens.map((x) => (
        <div key={x.nome} className="text-[12px]">
          <div className="mb-1 flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate font-semibold text-ink" title={x.nome}>{x.nome}</span>
            <span className="tnum font-bold" style={{ color: deltaCor(x.a, x.b) }}>{pctTxt(x.a, x.b)}</span>
          </div>
          <BarraAB nome={x.nome} rot={rotA} v={x.a} max={max} cor="#FDBE45" />
          <BarraAB nome={x.nome} rot={rotB} v={x.b} max={max} cor="#E8420A" />
        </div>
      ))}
    </div>
  )
}
function BarraAB({ nome, rot, v, max, cor }: { nome: string; rot: string; v: number; max: number; cor: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px]">
      <span className="w-16 shrink-0 truncate text-muted" title={rot}>{rot}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded bg-paper" title={`${nome}\n${rot}: R$ ${fmt0(v)}`}>
        <div className="h-full rounded" style={{ width: `${(v / max) * 100}%`, background: cor, minWidth: 2 }} />
      </div>
      <span className="w-16 shrink-0 text-right tnum font-semibold text-ink">R$ {fmtCompacto(v)}</span>
    </div>
  )
}
function TabelaCmp({ itens, rotA, rotB, rot }: { itens: { nome: string; a: number; b: number }[]; rotA: string; rotB: string; rot: string }) {
  if (!itens.length) return <div className="py-6 text-center text-[12px] text-muted">Sem dados.</div>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b-2 border-line text-muted">
            <th className="py-1.5 text-left font-semibold">{rot}</th>
            <th className="py-1.5 text-right font-semibold">{rotA}</th>
            <th className="py-1.5 text-right font-semibold">{rotB}</th>
            <th className="py-1.5 text-right font-semibold">Δ</th>
            <th className="py-1.5 text-right font-semibold">Δ %</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((x) => {
            const cor = deltaCor(x.a, x.b)
            const d = x.b - x.a
            return (
              <tr key={x.nome} className="border-b border-line/60">
                <td className="max-w-0 truncate py-1.5 pr-2 text-ink" title={x.nome}>{x.nome}</td>
                <td className="py-1.5 text-right tnum text-muted">R$ {fmtCompacto(x.a)}</td>
                <td className="py-1.5 text-right tnum font-semibold text-ink">R$ {fmtCompacto(x.b)}</td>
                <td className="py-1.5 text-right tnum" style={{ color: cor }}>{d >= 0 ? '+' : '−'}{fmtCompacto(Math.abs(d))}</td>
                <td className="py-1.5 text-right tnum font-bold" style={{ color: cor }}>{pctTxt(x.a, x.b)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* ============================== CURVA ABC ============================== */
const ABC_COR: Record<'A' | 'B' | 'C', string> = { A: '#E8420A', B: '#FB960E', C: '#FDC24C' }

function AbcCurva({ rows }: { rows: Venda[] }) {
  const [dim, setDim] = useState<'categoria' | 'produto' | 'sku' | 'cliente'>('categoria')
  useEffect(() => { if (rows.length && !temCategoria(rows)) setDim('produto') }, [rows])
  const [dataDe, setDataDe] = useState(''); const [dataAte, setDataAte] = useState('')
  const [selCanais, setSelCanais] = useState<Set<string> | null>(null)
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null)

  const canais = useMemo(() => Array.from(new Set(rows.map((r) => r.origem))).sort((a, b) => a.localeCompare(b)), [rows])
  useEffect(() => {
    const ds = rows.map((r) => r.data).filter(Boolean).sort()
    if (ds.length) { setDataDe(ds[0]); setDataAte(ds[ds.length - 1]) }
  }, [rows])

  const rot = dim === 'categoria' ? 'Categoria' : dim === 'produto' ? 'Produto' : dim === 'sku' ? 'SKU' : 'Cliente'
  const abc = useMemo(() => {
    const canalOk = (c: string) => selCanais === null || selCanais.has(c)
    const de = dataDe || '0000-01-01', ate = dataAte || '9999-12-31'
    const f = rows.filter((r) => r.data >= de && r.data <= ate && canalOk(r.origem))
    const keyf = (r: Venda) => (dim === 'categoria' ? r.categoria : dim === 'produto' ? r.produto : dim === 'sku' ? r.sku : r.cliente) || `(sem ${rot.toLowerCase()})`
    const acc = new Map<string, { fat: number; qtd: number }>()
    for (const r of f) { const k = keyf(r); const e = acc.get(k) || { fat: 0, qtd: 0 }; e.fat += r.qtd * r.unit; e.qtd += r.qtd; acc.set(k, e) }
    const arr = Array.from(acc.entries()).map(([nome, v]) => ({ nome, fat: v.fat, qtd: v.qtd })).filter((x) => x.fat > 0.005).sort((a, b) => b.fat - a.fat)
    const total = arr.reduce((s, x) => s + x.fat, 0)
    let cum = 0
    const itens = arr.map((x) => {
      const antes = total ? (cum / total) * 100 : 0
      cum += x.fat
      const classe: 'A' | 'B' | 'C' = antes < 80 ? 'A' : antes < 95 ? 'B' : 'C'
      return { ...x, pct: total ? (x.fat / total) * 100 : 0, cumPct: total ? (cum / total) * 100 : 0, classe }
    })
    const resumo = (['A', 'B', 'C'] as const).map((c) => {
      const its = itens.filter((i) => i.classe === c)
      return { classe: c, n: its.length, fat: its.reduce((s, i) => s + i.fat, 0) }
    })
    return { itens, total, resumo, n: itens.length }
  }, [rows, dim, dataDe, dataAte, selCanais, rot])

  const det = (): Detalhe => ({
    titulo: `Curva ABC por ${rot.toLowerCase()}`, arquivo: `Vendas - Curva ABC ${dim}.xlsx`,
    colunas: [{ label: rot, tipo: 'texto' }, { label: 'Classe', tipo: 'texto' }, { label: 'Faturamento (R$)', tipo: 'num' }, { label: '% ind.', tipo: 'pct' }, { label: '% acum.', tipo: 'pct' }, { label: 'Qtd', tipo: 'num' }],
    linhas: abc.itens.map((x) => [x.nome, x.classe, Math.round(x.fat), Math.round(x.pct), Math.round(x.cumPct), Math.round(x.qtd)]),
  })

  return (
    <div className="flex flex-col gap-3 pb-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Classificar por</span>
        <Toggle valor={dim} set={setDim} ops={[['categoria', 'Categoria'], ['produto', 'Produto'], ['sku', 'SKU'], ['cliente', 'Cliente']]} />
        <div className="flex items-center gap-1.5 text-[12px]">
          <span className="text-muted">Período</span>
          <DateIn value={dataDe} onChange={setDataDe} /><span className="text-muted">até</span><DateIn value={dataAte} onChange={setDataAte} />
        </div>
        <MultiSelect label="Canal" opcoes={canais} value={selCanais} onChange={setSelCanais} />
        <span className="ml-auto text-[11px] text-muted">{abc.n} {rot.toLowerCase()}s · R$ {fmt0(abc.total)}</span>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {abc.resumo.map((c) => <AbcResumo key={c.classe} classe={c.classe} n={c.n} nTot={abc.n} fat={c.fat} total={abc.total} />)}
      </div>

      <CardC titulo="Curva ABC" sub="Participação acumulada no faturamento (A ≤ 80% · B ≤ 95% · C o restante)"
        tip="A Curva ABC classifica os itens pela importância no faturamento. Classe A = os poucos itens que somam até ~80% do total (os que mais pesam — priorize estoque e negociação); Classe B = os próximos, até ~95%; Classe C = a cauda longa, que soma o restante. As barras são a participação de cada item e a linha é o acumulado; as linhas tracejadas marcam os cortes de 80% e 95%.">
        <AbcChart itens={abc.itens} />
      </CardC>

      <CardC titulo={`${rot}s classificados`} sub="Ordenados por faturamento" tip="Lista do maior para o menor faturamento, com a classe (A/B/C), o % individual e o % acumulado. Passe o mouse nas barras do gráfico acima para ver os valores; use Detalhes para exportar a lista completa." onDet={() => setDetalhe(det())}>
        <AbcTabela itens={abc.itens} rot={rot} />
      </CardC>

      {detalhe && <ModalDetalhe dados={detalhe} onClose={() => setDetalhe(null)} />}
    </div>
  )
}

function AbcResumo({ classe, n, nTot, fat, total }: { classe: 'A' | 'B' | 'C'; n: number; nTot: number; fat: number; total: number }) {
  const cor = ABC_COR[classe]
  const desc = classe === 'A' ? 'Essenciais — priorize' : classe === 'B' ? 'Intermediários' : 'Cauda longa'
  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-surface px-4 py-3">
      <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: cor }} />
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-md text-[15px] font-extrabold text-white" style={{ background: cor }}>{classe}</span>
        <div>
          <div className="text-[13px] font-bold text-ink">Classe {classe}</div>
          <div className="text-[10px] text-muted">{desc}</div>
        </div>
        <div className="ml-auto text-right">
          <div className="text-[18px] font-semibold tnum text-ink">{total ? Math.round((fat / total) * 100) : 0}%</div>
          <div className="text-[10px] text-muted">do faturamento</div>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-muted">
        <span><b className="text-ink tnum">{n}</b> itens ({nTot ? Math.round((n / nTot) * 100) : 0}%)</span>
        <span className="tnum">R$ {fmt0(fat)}</span>
      </div>
    </div>
  )
}

function AbcChart({ itens }: { itens: { nome: string; fat: number; pct: number; cumPct: number; classe: 'A' | 'B' | 'C' }[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const [sz, setSz] = useState({ w: 700, h: 208 })
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return
    const up = () => setSz({ w: Math.max(240, el.clientWidth), h: Math.max(150, el.clientHeight) })
    up(); const ro = new ResizeObserver(up); ro.observe(el); return () => ro.disconnect()
  }, [])
  if (!itens.length) return <div className="py-8 text-center text-[12px] text-muted">Sem dados.</div>
  const { w: W, h: H } = sz
  const padL = 6, padR = 30, padT = 12, padB = 8
  const innerW = W - padL - padR, innerH = H - padT - padB
  const n = itens.length
  const bw = innerW / n
  const maxPct = Math.max(1, ...itens.map((i) => i.pct))
  const yCum = (p: number) => padT + innerH * (1 - p / 100)
  const cx = (i: number) => padL + bw * i + bw / 2
  return (
    <div ref={ref} className="h-52 w-full">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }} role="img" aria-label="Curva ABC">
        {[80, 95].map((t) => (
          <g key={t}>
            <line x1={padL} y1={yCum(t)} x2={W - padR} y2={yCum(t)} stroke="#CBD5E1" strokeWidth={1} strokeDasharray="4 4" />
            <text x={W - padR + 3} y={yCum(t) + 3} fontSize={10} fill="#94A3B8">{t}%</text>
          </g>
        ))}
        {itens.map((it, i) => {
          const bh = (it.pct / maxPct) * innerH
          return (
            <rect key={i} x={padL + bw * i + (bw > 4 ? 1 : 0)} y={padT + innerH - bh} width={Math.max(0.6, bw - (bw > 4 ? 2 : 0))} height={bh} style={{ fill: ABC_COR[it.classe] }}>
              <title>{`${it.nome}\nClasse: ${it.classe}\nFaturamento: R$ ${fmt0(it.fat)}\n% individual: ${it.pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%\n% acumulado: ${it.cumPct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}</title>
            </rect>
          )
        })}
        <polyline points={itens.map((it, i) => `${cx(i)},${yCum(it.cumPct)}`).join(' ')} fill="none" stroke="#8A3F1C" strokeWidth={2} />
        {n <= 40 && itens.map((it, i) => <circle key={i} cx={cx(i)} cy={yCum(it.cumPct)} r={2} fill="#8A3F1C" />)}
      </svg>
    </div>
  )
}

function AbcTabela({ itens, rot }: { itens: { nome: string; fat: number; qtd: number; pct: number; cumPct: number; classe: 'A' | 'B' | 'C' }[]; rot: string }) {
  if (!itens.length) return <div className="py-6 text-center text-[12px] text-muted">Sem dados.</div>
  const top = itens.slice(0, 15)
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b-2 border-line text-muted">
            <th className="py-1.5 text-center font-semibold">Classe</th>
            <th className="py-1.5 text-left font-semibold">{rot}</th>
            <th className="py-1.5 text-right font-semibold">Faturamento</th>
            <th className="py-1.5 text-right font-semibold">% ind.</th>
            <th className="py-1.5 text-right font-semibold">% acum.</th>
          </tr>
        </thead>
        <tbody>
          {top.map((x) => (
            <tr key={x.nome} className="border-b border-line/60">
              <td className="py-1.5 text-center"><span className="inline-grid h-5 w-5 place-items-center rounded text-[11px] font-bold text-white" style={{ background: ABC_COR[x.classe] }}>{x.classe}</span></td>
              <td className="max-w-0 truncate py-1.5 pr-2 text-ink" title={x.nome}>{x.nome}</td>
              <td className="py-1.5 text-right tnum font-semibold text-ink">R$ {fmtCompacto(x.fat)}</td>
              <td className="py-1.5 text-right tnum text-muted">{x.pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</td>
              <td className="py-1.5 text-right tnum text-muted">{x.cumPct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      {itens.length > top.length && <div className="mt-1.5 text-center text-[11px] text-muted">Mostrando 15 de {itens.length} — use <b>Detalhes</b> para a lista completa e exportar.</div>}
    </div>
  )
}
