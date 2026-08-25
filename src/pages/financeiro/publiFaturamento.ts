/* ================================================================== *
 *  Publi (Mapa de Faturamento) → base de Faturamento
 *  Funções PURAS: parsePubliAOA lê o extrato do Publi (colunas A–K),
 *  descartando as linhas de título, os "TOTAL <cliente>" e as milhares de
 *  linhas em branco (bloat do .xls antigo). buildFaturamentoIndicadores
 *  agrega a base para os KPIs/gráficos. Reutilizadas pelo componente e por
 *  testes em Node. Métrica principal = VALOR FATURADO (coluna K).
 * ================================================================== */

export interface FaturamentoRow {
  id?: number // presente quando vem do banco (usado para excluir a nota); ausente no parse
  empresa: string
  cliente: string
  sacado: string
  origem: string // Unidade de Negócio (normalizada, sem o código numérico)
  descricao: string // nome do evento
  documento: string // número da NF
  ecs: string
  pit: string
  emissao: string | null // ISO 'YYYY-MM-DD'
  vencimento: string | null
  pagamento: string | null // null = a receber
  valor: number // VALOR FATURADO (col K)
}

export interface ParsedPubli {
  empresa: string
  rows: FaturamentoRow[]
  anos: number[]
  meses: string[] // 'YYYY-MM' presentes (por emissão)
}

/* --------------------------------- helpers --------------------------------- */
const clean = (v: unknown): string =>
  (v ?? '').toString().replace(/\s+/g, ' ').trim()

/** Serial de data do Excel (ou Date) → 'YYYY-MM-DD'. null se não for data. */
function toISO(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-${String(v.getUTCDate()).padStart(2, '0')}`
  }
  if (typeof v === 'number' && isFinite(v) && v > 1) {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000))
    if (d.getUTCFullYear() < 2000 || d.getUTCFullYear() > 2100) return null
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
  }
  return null
}

/** Origem vem com um código colado (ex.: "PLANEJAMENTO 02496"). Remove o
 *  código numérico do fim e normaliza espaços, preservando o rótulo. */
export function normalizaOrigem(v: unknown): string {
  const s = clean(v).replace(/\s+\d{3,}\s*$/, '').trim()
  return s || '—'
}

const num = (v: unknown): number => (typeof v === 'number' && isFinite(v) ? v : 0)

/**
 * Lê a matriz (AOA) de um extrato do Publi. `empresa` é informada no upload
 * (o arquivo não traz a empresa). Colunas fixas A–K (0..10).
 */
export function parsePubliAOA(aoa: unknown[][], empresa: string): ParsedPubli {
  // 1) achar a linha de cabeçalho (col A == 'CLIENTE')
  let hi = -1
  for (let i = 0; i < Math.min(aoa.length, 15); i++) {
    if (clean(aoa[i]?.[0]).toUpperCase() === 'CLIENTE') { hi = i; break }
  }
  const start = hi >= 0 ? hi + 1 : 4 // fallback: dados começam na linha 5

  const C = { CLI: 0, SAC: 1, ORI: 2, DESC: 3, DOC: 4, ECS: 5, PIT: 6, EMI: 7, VEN: 8, PAG: 9, VAL: 10 }
  const rows: FaturamentoRow[] = []
  const anos = new Set<number>()
  const meses = new Set<string>()

  for (let i = start; i < aoa.length; i++) {
    const r = aoa[i]
    if (!r) continue
    // Linha de detalhe = EMISSÃO é data. Descarta TOTAL/branco/título.
    const emissao = toISO(r[C.EMI])
    if (!emissao) continue
    const cliente = clean(r[C.CLI])
    // Guarda contra "TOTAL <cliente>" que porventura tenha data (não deve).
    if (!cliente || cliente.toUpperCase().startsWith('TOTAL')) continue

    const row: FaturamentoRow = {
      empresa,
      cliente,
      sacado: clean(r[C.SAC]),
      origem: normalizaOrigem(r[C.ORI]),
      descricao: clean(r[C.DESC]),
      documento: clean(r[C.DOC]),
      ecs: clean(r[C.ECS]),
      pit: clean(r[C.PIT]),
      emissao,
      vencimento: toISO(r[C.VEN]),
      pagamento: toISO(r[C.PAG]),
      valor: num(r[C.VAL]),
    }
    rows.push(row)
    anos.add(Number(emissao.slice(0, 4)))
    meses.add(emissao.slice(0, 7))
  }

  return {
    empresa,
    rows,
    anos: [...anos].sort(),
    meses: [...meses].sort(),
  }
}

/* ============================ Indicadores (A–K) ============================ */
export const MESES_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

export interface SerieMes { mes: string; label: string; valor: number; qtd: number }
export interface Fatia { nome: string; valor: number; qtd: number }
export interface Indicadores {
  totalFaturado: number
  qtdNotas: number
  ticketMedio: number
  recebido: number
  aReceber: number
  pctRecebido: number | null
  prazoMedioReceb: number | null // dias entre emissão e pagamento (recebidas)
  porMes: SerieMes[]
  porUnidade: Fatia[]
  porCliente: Fatia[]
}

const mesLabel = (ym: string) => {
  const [y, m] = ym.split('-')
  return `${MESES_PT[Number(m) - 1]}/${y.slice(2)}`
}
const diasEntre = (a: string, b: string) =>
  Math.round((Date.parse(b) - Date.parse(a)) / 86400000)

/** Agrega a base de faturamento (já filtrada por empresa/período no chamador). */
export function buildFaturamentoIndicadores(rows: FaturamentoRow[]): Indicadores {
  const totalFaturado = rows.reduce((s, r) => s + r.valor, 0)
  const qtdNotas = rows.length
  const recebidas = rows.filter((r) => r.pagamento)
  const recebido = recebidas.reduce((s, r) => s + r.valor, 0)
  const aReceber = totalFaturado - recebido

  const mMes = new Map<string, SerieMes>()
  const mUni = new Map<string, Fatia>()
  const mCli = new Map<string, Fatia>()
  const bump = (map: Map<string, Fatia>, nome: string, v: number) => {
    const f = map.get(nome) ?? { nome, valor: 0, qtd: 0 }
    f.valor += v; f.qtd += 1; map.set(nome, f)
  }
  for (const r of rows) {
    if (r.emissao) {
      const ym = r.emissao.slice(0, 7)
      const s = mMes.get(ym) ?? { mes: ym, label: mesLabel(ym), valor: 0, qtd: 0 }
      s.valor += r.valor; s.qtd += 1; mMes.set(ym, s)
    }
    bump(mUni, r.origem || '—', r.valor)
    bump(mCli, r.cliente || '—', r.valor)
  }

  let somaDias = 0, nDias = 0
  for (const r of recebidas) {
    if (r.emissao && r.pagamento) { somaDias += diasEntre(r.emissao, r.pagamento); nDias++ }
  }

  return {
    totalFaturado,
    qtdNotas,
    ticketMedio: qtdNotas ? totalFaturado / qtdNotas : 0,
    recebido,
    aReceber,
    pctRecebido: totalFaturado ? (recebido / totalFaturado) * 100 : null,
    prazoMedioReceb: nDias ? somaDias / nDias : null,
    porMes: [...mMes.values()].sort((a, b) => a.mes.localeCompare(b.mes)),
    porUnidade: [...mUni.values()].sort((a, b) => b.valor - a.valor),
    porCliente: [...mCli.values()].sort((a, b) => b.valor - a.valor),
  }
}
