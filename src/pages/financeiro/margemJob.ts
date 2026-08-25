/* ================================================================== *
 *  Rentabilidade de Projetos (Margem Job)
 *  Funções PURAS: cálculo das margens de cada job, parser do Excel
 *  "Margem Job" (carga inicial) e agregação para os indicadores.
 *  Reutilizadas pelo componente e por testes em Node.
 *
 *  CAMPOS DIGITADOS: empresa, cliente, data, competência, PIT, EC,
 *  unidade de negócio, campanha, valor faturado, custo total/impostos,
 *  encargos.
 *  CAMPOS CALCULADOS (não se digita):
 *    receita        = faturado − custo total/impostos
 *    margem 1       = receita / faturado
 *    ganho trib.    = encargos × taxa (padrão 52%)
 *    margem c/ enc. = receita + ganho tributário
 *    margem 2       = margem c/ encargos / faturado
 * ================================================================== */

export const TAXA_GANHO_TRIB_PADRAO = 0.52

/** Unidades de Negócio conhecidas (o campo antigo "Ferramenta"). */
export const UNIDADES_NEGOCIO = [
  'Evento/Ativação',
  'Promo',
  'Promo/Ativação',
  'Incentivo',
  'Eventos',
  'Promo/Fee',
]

export const EMPRESAS = ['Batuque', 'Batux']

export const MESES_FULL = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

/** Job como o usuário informa (sem os campos calculados). */
export interface MargemJob {
  id?: number
  empresa: string
  cliente: string
  data: string | null // ISO 'YYYY-MM-DD'
  competencia: string // nome do mês (ex.: 'Janeiro')
  pit: string
  ec: string
  unidadeNegocio: string
  campanha: string
  valorFaturado: number
  custoTotal: number // CUSTO TOTAL /IMPOSTOS
  encargos: number
  /**
   * Receita informada manualmente (override). Quando null/ausente, a receita
   * é calculada como Faturado − Custo. O usuário pode ajustar porque a receita
   * de um job varia com o andamento do projeto.
   */
  receita?: number | null
}

/** Job com as margens já calculadas. */
export interface MargemJobCalc extends MargemJob {
  receita: number
  margem1: number // fração (0..1)
  ganhoTrib: number
  margemEncargos: number
  margem2: number // fração (0..1)
}

/** Receita vigente: o override manual, se houver; senão Faturado − Custo. */
export function receitaEfetiva(j: MargemJob): number {
  return j.receita != null ? j.receita : j.valorFaturado - j.custoTotal
}

/** Aplica as fórmulas da planilha a um job. `taxa` = ganho tributário sobre encargos. */
export function calcularJob(j: MargemJob, taxa = TAXA_GANHO_TRIB_PADRAO): MargemJobCalc {
  const receita = receitaEfetiva(j)
  const margem1 = j.valorFaturado ? receita / j.valorFaturado : 0
  const ganhoTrib = j.encargos * taxa
  const margemEncargos = receita + ganhoTrib
  const margem2 = j.valorFaturado ? margemEncargos / j.valorFaturado : 0
  return { ...j, receita, margem1, ganhoTrib, margemEncargos, margem2 }
}

/* --------------------------------- helpers --------------------------------- */
const clean = (v: unknown): string => (v ?? '').toString().replace(/\s+/g, ' ').trim()
const num = (v: unknown): number => {
  if (typeof v === 'number' && isFinite(v)) return v
  if (typeof v === 'string') {
    // Aceita "61,786.53" (en) e "1.234,56" (pt) além de espaços.
    const s = v.replace(/\s/g, '')
    if (/,\d{2}$/.test(s) && s.includes('.')) return Number(s.replace(/\./g, '').replace(',', '.')) || 0
    return Number(s.replace(/,/g, '')) || 0
  }
  return 0
}

/** Serial de data do Excel (ou Date/'M/D/YY') → 'YYYY-MM-DD'. null se não for data. */
export function toISO(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-${String(v.getUTCDate()).padStart(2, '0')}`
  }
  if (typeof v === 'number' && isFinite(v) && v > 1) {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000))
    if (d.getUTCFullYear() < 2000 || d.getUTCFullYear() > 2100) return null
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
  }
  if (typeof v === 'string') {
    const m = v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/) // M/D/YY (formato do arquivo)
    if (m) {
      let [, mo, da, yy] = m
      let y = Number(yy); if (y < 100) y += 2000
      const dt = new Date(Date.UTC(y, Number(mo) - 1, Number(da)))
      if (!isNaN(dt.getTime())) return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
    }
  }
  return null
}

/** Normaliza a empresa para 'Batuque' | 'Batux' (o arquivo traz em caixa alta). */
export function normalizaEmpresa(v: unknown): string {
  const s = clean(v).toUpperCase()
  if (s.startsWith('BATUQUE')) return 'Batuque'
  if (s.startsWith('BATUX')) return 'Batux'
  return clean(v)
}

/** Título (Caixa Alta → Só a inicial) preservando barras (ex.: EVENTO/ATIVAÇÃO). */
export function tituloCaso(v: unknown): string {
  const s = clean(v)
  if (!s) return ''
  return s.toLowerCase().replace(/(^|[\s/])([a-zà-ú])/g, (_, sep, ch) => sep + ch.toUpperCase())
}

/** Competência a partir do mês da data (fallback quando a planilha não traz). */
export function competenciaDaData(iso: string | null): string {
  if (!iso) return ''
  const m = Number(iso.slice(5, 7))
  return MESES_FULL[m - 1] ?? ''
}

/**
 * Lê a matriz (AOA) da planilha "Margem Job". Colunas A–M:
 * A cliente · B empresa · C data · D PIT · E EC · F competência ·
 * G unidade de negócio (Ferramenta) · H campanha · I faturado ·
 * J custo total/impostos · (K receita, L margem1 = calculados, ignora) ·
 * M encargos. Linha válida = cliente preenchido e faturado numérico;
 * descarta títulos, "TOTAL/TOTAIS/Total Geral" e o rodapé de resumo.
 */
export function parseMargemJobAOA(aoa: unknown[][]): MargemJob[] {
  let hi = -1
  for (let i = 0; i < Math.min(aoa.length, 15); i++) {
    if (clean(aoa[i]?.[0]).toUpperCase() === 'CLIENTE') { hi = i; break }
  }
  const start = hi >= 0 ? hi + 1 : 1
  const C = { CLI: 0, EMP: 1, DATA: 2, PIT: 3, EC: 4, COMP: 5, UNI: 6, CAMP: 7, FAT: 8, CUSTO: 9, ENC: 12 }
  const rows: MargemJob[] = []

  for (let i = start; i < aoa.length; i++) {
    const r = aoa[i]
    if (!r) continue
    const cliente = clean(r[C.CLI])
    if (!cliente) continue
    // Linha de JOB = tem empresa Batuque/Batux. As linhas de resumo do rodapé
    // (Total Geral, participação por cliente, por unidade) trazem NÚMERO na
    // coluna da empresa, então caem fora aqui — separação limpa e robusta.
    const empresa = normalizaEmpresa(r[C.EMP])
    if (empresa !== 'Batuque' && empresa !== 'Batux') continue
    const faturado = num(r[C.FAT])
    const custo = num(r[C.CUSTO])
    if (!faturado && !custo) continue // ignora linha em branco

    const data = toISO(r[C.DATA])
    const compCell = clean(r[C.COMP])
    rows.push({
      empresa,
      cliente: tituloCaso(cliente),
      data,
      competencia: compCell ? tituloCaso(compCell) : competenciaDaData(data),
      pit: clean(r[C.PIT]),
      ec: clean(r[C.EC]),
      unidadeNegocio: tituloCaso(r[C.UNI]),
      campanha: tituloCaso(r[C.CAMP]),
      valorFaturado: faturado,
      custoTotal: custo,
      encargos: num(r[C.ENC]),
    })
  }
  return rows
}

/* ============================ Indicadores ============================ */
export interface FatiaMargem {
  nome: string
  faturado: number
  custo: number
  receita: number
  encargos: number
  ganhoTrib: number
  margemEncargos: number
  qtd: number
  margem1: number // receita / faturado
  margem2: number // margem c/ encargos / faturado
  participacao: number // receita / receita total
}
export interface SerieMesMargem { mes: string; label: string; faturado: number; receita: number; margem1: number }
export interface IndicadoresMargem {
  totalFaturado: number
  totalCusto: number
  totalReceita: number
  totalEncargos: number
  totalGanhoTrib: number
  totalMargemEncargos: number
  qtd: number
  margem1: number
  margem2: number
  porCliente: FatiaMargem[]
  porUnidade: FatiaMargem[]
  porMes: SerieMesMargem[]
}

const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const mesLabel = (ym: string) => {
  const [y, m] = ym.split('-')
  return `${MESES_ABREV[Number(m) - 1]}/${y.slice(2)}`
}

/** Agrega jobs (já filtrados pelo chamador) para os indicadores. `taxa` do ganho trib. */
export function buildIndicadoresMargem(jobs: MargemJob[], taxa = TAXA_GANHO_TRIB_PADRAO): IndicadoresMargem {
  const calc = jobs.map((j) => calcularJob(j, taxa))
  const totalFaturado = calc.reduce((s, j) => s + j.valorFaturado, 0)
  const totalCusto = calc.reduce((s, j) => s + j.custoTotal, 0)
  const totalReceita = calc.reduce((s, j) => s + j.receita, 0)
  const totalEncargos = calc.reduce((s, j) => s + j.encargos, 0)
  const totalGanhoTrib = calc.reduce((s, j) => s + j.ganhoTrib, 0)
  const totalMargemEncargos = calc.reduce((s, j) => s + j.margemEncargos, 0)

  const grupo = (chave: (j: MargemJobCalc) => string): FatiaMargem[] => {
    const m = new Map<string, FatiaMargem>()
    for (const j of calc) {
      const nome = chave(j) || '—'
      const f = m.get(nome) ?? { nome, faturado: 0, custo: 0, receita: 0, encargos: 0, ganhoTrib: 0, margemEncargos: 0, qtd: 0, margem1: 0, margem2: 0, participacao: 0 }
      f.faturado += j.valorFaturado; f.custo += j.custoTotal; f.receita += j.receita
      f.encargos += j.encargos; f.ganhoTrib += j.ganhoTrib; f.margemEncargos += j.margemEncargos; f.qtd += 1
      m.set(nome, f)
    }
    const arr = [...m.values()]
    for (const f of arr) {
      f.margem1 = f.faturado ? f.receita / f.faturado : 0
      f.margem2 = f.faturado ? f.margemEncargos / f.faturado : 0
      f.participacao = totalReceita ? f.receita / totalReceita : 0
    }
    return arr.sort((a, b) => b.receita - a.receita)
  }

  const mMes = new Map<string, SerieMesMargem>()
  for (const j of calc) {
    if (!j.data) continue
    const ym = j.data.slice(0, 7)
    const s = mMes.get(ym) ?? { mes: ym, label: mesLabel(ym), faturado: 0, receita: 0, margem1: 0 }
    s.faturado += j.valorFaturado; s.receita += j.receita; mMes.set(ym, s)
  }
  const porMes = [...mMes.values()].sort((a, b) => a.mes.localeCompare(b.mes))
  for (const s of porMes) s.margem1 = s.faturado ? s.receita / s.faturado : 0

  return {
    totalFaturado, totalCusto, totalReceita, totalEncargos, totalGanhoTrib, totalMargemEncargos,
    qtd: calc.length,
    margem1: totalFaturado ? totalReceita / totalFaturado : 0,
    margem2: totalFaturado ? totalMargemEncargos / totalFaturado : 0,
    porCliente: grupo((j) => j.cliente),
    porUnidade: grupo((j) => j.unidadeNegocio),
    porMes,
  }
}
