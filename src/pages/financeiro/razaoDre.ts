/* ================================================================== *
 *  Razão Contábil → DRE (multiempresa)
 *  Funções puras: (1) parseRazaoAOA extrai empresa/CNPJ e os movimentos
 *  das contas de resultado (classes 3, 4 e 5), agregados por conta e mês,
 *  descartando Balanço (1 e 2), a conta de Apuração (5.8, encerramento) e
 *  as linhas de total/saldo. (2) buildDRE monta o DRE a partir do plano de
 *  contas. Reutilizadas pelo componente e por testes em Node.
 * ================================================================== */

export interface RazaoRow {
  codigo: string
  nome: string
  ano: number
  mes: number // 1..12
  debito: number
  credito: number
}
export interface ParsedRazao {
  empresa: string
  cnpj: string
  rows: RazaoRow[]
  anos: number[]
  meses: number[] // 1..12 presentes
}

const up = (s: unknown) => (s ?? '').toString().toUpperCase().replace(/\s+/g, ' ').trim()
const isCodigo = (s: unknown) => /^\d(\.\d+)+$/.test((s ?? '').toString().trim())

function serialToYM(v: unknown): { ano: number; mes: number } | null {
  if (typeof v !== 'number' || !isFinite(v) || v < 1) return null
  const d = new Date(Math.round((v - 25569) * 86400 * 1000))
  const ano = d.getUTCFullYear()
  const mes = d.getUTCMonth() + 1
  if (ano < 2000 || ano > 2100) return null
  return { ano, mes }
}

/** Nome curto para o seletor: 1ª palavra significativa, capitalizada. */
export function apelidoEmpresa(empresa: string): string {
  const t = (empresa || '').trim().replace(/[.,]/g, ' ').split(/\s+/).filter(Boolean)
  const w = t[0] || empresa || 'Empresa'
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
}

export function parseRazaoAOA(aoa: unknown[][]): ParsedRazao {
  // 1) cabeçalho: empresa / cnpj
  let empresa = ''
  let cnpj = ''
  for (const r of aoa.slice(0, 10)) {
    const k = up(r[0])
    const rest = (r as unknown[]).slice(1).map((x) => (x ?? '').toString().trim()).filter(Boolean)
    if (!empresa && k.includes('EMPRESA')) empresa = rest[0] || ''
    if (!cnpj && (k.includes('C.N.P.J') || k.includes('CNPJ'))) cnpj = rest[0] || ''
  }

  // 2) colunas (detecta pelo cabeçalho da tabela; cai para posições padrão)
  let cData = 0
  let cPart = 7
  let cDeb = 8
  let cCred = 9
  for (const r of aoa.slice(0, 12)) {
    const hs = (r as unknown[]).map(up)
    const iDeb = hs.findIndex((h) => h === 'DÉBITO' || h === 'DEBITO')
    const iCred = hs.findIndex((h) => h === 'CRÉDITO' || h === 'CREDITO')
    if (iDeb >= 0 && iCred >= 0) {
      cDeb = iDeb
      cCred = iCred
      const iData = hs.findIndex((h) => h === 'DATA')
      if (iData >= 0) cData = iData
      const iPart = hs.findIndex((h) => h.includes('C.PART') || h.startsWith('CTA.C') || h.includes('C. PART'))
      if (iPart >= 0) cPart = iPart
      break
    }
  }

  // 3) mapear id -> código (linhas "Conta:") e achar a conta de Apuração (5.8)
  const idToCode: Record<string, string> = {}
  const contaInfo = (r: unknown[]) => {
    let idxCode = -1
    for (let i = 0; i < r.length; i++) if (isCodigo(r[i])) { idxCode = i; break }
    const codigo = idxCode >= 0 ? (r[idxCode] as string).toString().trim() : ''
    let idVal = ''
    for (let i = 0; i < idxCode; i++) if (typeof r[i] === 'number') { idVal = String(r[i]); break }
    let nome = ''
    for (let i = idxCode + 1; i < r.length; i++) {
      const s = (r[i] ?? '').toString().trim()
      if (s && !isCodigo(s)) { nome = s; break }
    }
    return { codigo, idVal, nome }
  }
  let apurId = ''
  for (const r of aoa) {
    if (up(r[0]) === 'CONTA:') {
      const { codigo, idVal } = contaInfo(r as unknown[])
      if (codigo) idToCode[idVal] = codigo
      if (/^5\.8/.test(codigo)) apurId = idVal
    }
  }

  // 4) varrer, agregando por (codigo, ano, mes) — só contas 3/4/5 (exceto 5.8)
  const agg: Record<string, RazaoRow> = {}
  const anos = new Set<number>()
  const meses = new Set<number>()
  let cur: { codigo: string; nome: string } | null = null
  for (const r of aoa) {
    const row = r as unknown[]
    if (up(row[0]) === 'CONTA:') {
      const info = contaInfo(row)
      cur = info.codigo ? { codigo: info.codigo, nome: info.nome } : null
      continue
    }
    if (!cur) continue
    if (!/^[345]/.test(cur.codigo) || /^5\.8/.test(cur.codigo)) continue // fora do DRE
    const ym = serialToYM(row[cData])
    if (!ym) continue // pula SALDO ANTERIOR e linha de TOTAL (sem data)
    const part = (row[cPart] ?? '').toString().trim()
    if (part && part === apurId) continue // encerramento (RESULTADO DO PERIODO)
    const deb = typeof row[cDeb] === 'number' ? (row[cDeb] as number) : 0
    const cred = typeof row[cCred] === 'number' ? (row[cCred] as number) : 0
    if (!deb && !cred) continue
    const key = `${cur.codigo}|${ym.ano}|${ym.mes}`
    if (!agg[key]) agg[key] = { codigo: cur.codigo, nome: cur.nome, ano: ym.ano, mes: ym.mes, debito: 0, credito: 0 }
    agg[key].debito += deb
    agg[key].credito += cred
    anos.add(ym.ano)
    meses.add(ym.mes)
  }

  return {
    empresa,
    cnpj,
    rows: Object.values(agg),
    anos: [...anos].sort(),
    meses: [...meses].sort((a, b) => a - b),
  }
}

/* =============================== DRE =============================== */
export const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const z12 = () => new Array(12).fill(0) as number[]
export const sum12 = (a: number[]) => a.reduce((s, v) => s + v, 0)

type Papel = 'receita' | 'deducao' | 'custo' | 'despesa' | 'imposto'
interface GrupoDef {
  key: string
  label: string
  papel: Papel
  prefixos: string[]
}
// Estrutura do DRE a partir do plano de contas (classes 3/4/5).
const GRUPOS: GrupoDef[] = [
  { key: 'rec_bruta', label: 'Receita Operacional Bruta', papel: 'receita', prefixos: ['3.1.10'] },
  { key: 'deducoes', label: 'Deduções da Receita Bruta', papel: 'deducao', prefixos: ['3.1.20'] },
  { key: 'custos', label: 'Custos dos Serviços Prestados', papel: 'custo', prefixos: ['4'] },
  { key: 'desp_op', label: 'Despesas Operacionais', papel: 'despesa', prefixos: ['5.1.11'] },
  { key: 'out_rec', label: 'Outras Receitas Operacionais', papel: 'receita', prefixos: ['5.1.10.400'] },
  { key: 'rec_fin', label: 'Receitas Financeiras', papel: 'receita', prefixos: ['5.1.10.300'] },
  { key: 'desp_fin', label: 'Despesas Financeiras', papel: 'despesa', prefixos: ['5.1.12'] },
  { key: 'impostos', label: 'IR / CSLL sobre o Lucro', papel: 'imposto', prefixos: ['5.7'] },
]
const sinalReceita = (p: Papel) => p === 'receita'
// contribuição no resultado: receita soma (+), demais subtraem (–)
const fator = (p: Papel) => (p === 'receita' ? 1 : -1)

function prefixMatch(codigo: string, pref: string): boolean {
  return codigo === pref || codigo.startsWith(pref + '.')
}
function achaGrupo(codigo: string): GrupoDef | null {
  let best: GrupoDef | null = null
  let bestLen = -1
  for (const g of GRUPOS) {
    for (const pr of g.prefixos) {
      if (prefixMatch(codigo, pr) && pr.length > bestLen) {
        best = g
        bestLen = pr.length
      }
    }
  }
  return best
}

export interface ContaLinha {
  codigo: string
  nome: string
  mes: number[]
  total: number
}
export interface LinhaGrupo {
  tipo: 'grupo'
  key: string
  label: string
  papel: Papel
  sinal: '+' | '–'
  mes: number[]
  total: number
  contas: ContaLinha[]
}
export interface LinhaSub {
  tipo: 'sub' | 'result' | 'final'
  key: string
  label: string
  mes: number[]
  total: number
}
export type LinhaDRE = LinhaGrupo | LinhaSub

interface RowLike {
  codigo: string
  nome: string
  mes: number // 1..12
  debito: number
  credito: number
}

export function buildDRE(rows: RowLike[]): { linhas: LinhaDRE[]; grupos: Record<string, number[]> } {
  // agrega por grupo (mês) e por conta (mês)
  const grupoMes: Record<string, number[]> = {}
  const contas: Record<string, Record<string, ContaLinha>> = {} // grupoKey -> codigo -> conta
  const outras: Record<string, ContaLinha> = {}
  const outrasMes = z12()

  for (const g of GRUPOS) {
    grupoMes[g.key] = z12()
    contas[g.key] = {}
  }
  for (const r of rows) {
    const m = r.mes - 1
    if (m < 0 || m > 11) continue
    const g = achaGrupo(r.codigo)
    if (g) {
      const val = sinalReceita(g.papel) ? r.credito - r.debito : r.debito - r.credito
      grupoMes[g.key][m] += val
      const c = (contas[g.key][r.codigo] ||= { codigo: r.codigo, nome: r.nome, mes: z12(), total: 0 })
      c.mes[m] += val
      c.total += val
    } else {
      // conta de resultado não mapeada — não some do DRE
      const val = r.codigo.startsWith('3') ? r.credito - r.debito : -(r.debito - r.credito)
      outrasMes[m] += val
      const c = (outras[r.codigo] ||= { codigo: r.codigo, nome: r.nome, mes: z12(), total: 0 })
      c.mes[m] += val
      c.total += val
    }
  }

  const G = (k: string) => grupoMes[k] || z12()
  const combine = (...parts: Array<{ arr: number[]; s: number }>): number[] => {
    const out = z12()
    for (const { arr, s } of parts) for (let i = 0; i < 12; i++) out[i] += s * arr[i]
    return out
  }
  const recliq = combine({ arr: G('rec_bruta'), s: 1 }, { arr: G('deducoes'), s: -1 })
  const lucroBruto = combine({ arr: recliq, s: 1 }, { arr: G('custos'), s: -1 })
  const ebit = combine({ arr: lucroBruto, s: 1 }, { arr: G('desp_op'), s: -1 }, { arr: G('out_rec'), s: 1 })
  const lair = combine({ arr: ebit, s: 1 }, { arr: G('rec_fin'), s: 1 }, { arr: G('desp_fin'), s: -1 })
  const liquido = combine({ arr: lair, s: 1 }, { arr: G('impostos'), s: -1 }, { arr: outrasMes, s: 1 })

  const grupoLinha = (key: string): LinhaGrupo | null => {
    const g = GRUPOS.find((x) => x.key === key)!
    const mes = G(key)
    const lista = Object.values(contas[key]).sort((a, b) => b.total - a.total)
    if (Math.abs(sum12(mes)) < 0.005 && lista.length === 0) return null
    return {
      tipo: 'grupo',
      key,
      label: g.label,
      papel: g.papel,
      sinal: sinalReceita(g.papel) ? '+' : '–',
      mes,
      total: sum12(mes),
      contas: lista,
    }
  }
  const sub = (tipo: LinhaSub['tipo'], key: string, label: string, mes: number[]): LinhaSub => ({ tipo, key, label, mes, total: sum12(mes) })

  const linhas: LinhaDRE[] = []
  const push = (l: LinhaGrupo | null) => { if (l) linhas.push(l) }
  push(grupoLinha('rec_bruta'))
  push(grupoLinha('deducoes'))
  linhas.push(sub('sub', 'recliq', '= Receita Operacional Líquida', recliq))
  push(grupoLinha('custos'))
  linhas.push(sub('sub', 'lucrobruto', '= Lucro Bruto', lucroBruto))
  push(grupoLinha('desp_op'))
  push(grupoLinha('out_rec'))
  linhas.push(sub('result', 'ebit', '= Resultado Operacional (EBIT)', ebit))
  push(grupoLinha('rec_fin'))
  push(grupoLinha('desp_fin'))
  linhas.push(sub('result', 'lair', '= Resultado antes do IR/CSLL', lair))
  push(grupoLinha('impostos'))
  // outras contas não mapeadas (se houver)
  const outrasLista = Object.values(outras).sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
  if (outrasLista.length) {
    linhas.push({ tipo: 'grupo', key: 'outras', label: 'Outras contas de resultado', papel: 'receita', sinal: '+', mes: outrasMes, total: sum12(outrasMes), contas: outrasLista })
  }
  linhas.push(sub('final', 'liquido', '= Resultado Líquido do Exercício', liquido))
  return { linhas, grupos: grupoMes }
}

export { fator }
