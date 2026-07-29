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

/**
 * Papel de um grupo de nível 1 no DRE — define o sinal (soma/subtrai) e a
 * posição relativa aos subtotais. Grupos de mesmo papel ficam juntos.
 */
export type Papel =
  | 'receita_bruta'
  | 'deducao'
  | 'custo'
  | 'despesa_op'
  | 'outra_desp_op'
  | 'outra_rec_op'
  | 'outras'
  | 'depreciacao'
  | 'rec_fin'
  | 'desp_fin'
  | 'equiv'
  | 'imposto'

export interface GrupoDef {
  nome: string
  papel: Papel
}

// Catálogo PADRÃO dos grupos de nível 1 (ordem + papel). A parte 2
// (ambiente de reclassificação) poderá substituir/estender este catálogo.
export const CATALOGO_PADRAO: GrupoDef[] = [
  { nome: 'Receita Operacional Bruta', papel: 'receita_bruta' },
  { nome: 'Deduções da Receita Bruta', papel: 'deducao' },
  { nome: 'Custos dos Serviços Prestados', papel: 'custo' },
  { nome: 'Despesas Operacionais', papel: 'despesa_op' },
  { nome: 'Outras Despesas Operacionais', papel: 'outra_desp_op' },
  { nome: 'Outras Receitas Operacionais', papel: 'outra_rec_op' },
  { nome: 'Outras contas de resultado', papel: 'outras' },
  { nome: 'Depreciação e Amortização', papel: 'depreciacao' },
  { nome: 'Receitas Financeiras', papel: 'rec_fin' },
  { nome: 'Despesas Financeiras', papel: 'desp_fin' },
  { nome: 'Resultado de Equivalência Patrimonial', papel: 'equiv' },
  { nome: 'IR / CSLL sobre o Lucro', papel: 'imposto' },
]

const RECEITA_PAPEIS = new Set<Papel>(['receita_bruta', 'outra_rec_op', 'rec_fin'])
export const ehReceitaPapel = (p: Papel) => RECEITA_PAPEIS.has(p)
const ehReceita = ehReceitaPapel

/* ------------------------------- DDL ------------------------------- */
// DDL = Distribuição Desproporcional de Lucros (antecipação de lucros dos
// sócios, lançada manualmente). Entra no DRE como UMA linha "DDL" dentro do
// subgrupo Pessoal e Encargos (Despesas Operacionais). O detalhe por sócio
// vive no ambiente analítico — aqui os valores já vêm somados por empresa/mês.
export const DDL_CODIGO = '__ddl__'
export const DDL_NOME = 'DDL — Distribuição Desproporcional de Lucros'
export const DDL_GRUPO = 'Despesas Operacionais'
export const DDL_SUBGRUPO = 'Pessoal e Encargos'

export interface DdlLanc {
  empresa: string
  ano: number
  mes: number // 1..12
  valor: number
}
/**
 * Soma os lançamentos de DDL por (empresa, ano, mês) numa única "conta"
 * sintética por empresa/mês (código DDL_CODIGO), pronta para o buildDRE.
 * É tratada como despesa: debito = valor (subtrai do resultado).
 */
export function ddlParaRows(lancs: DdlLanc[]): (RowLike & { empresa: string; ano: number })[] {
  const agg = new Map<string, RowLike & { empresa: string; ano: number }>()
  for (const l of lancs) {
    if (!l.valor || l.mes < 1 || l.mes > 12) continue
    const key = `${l.empresa}|${l.ano}|${l.mes}`
    let r = agg.get(key)
    if (!r) {
      r = { empresa: l.empresa, ano: l.ano, codigo: DDL_CODIGO, nome: DDL_NOME, mes: l.mes, debito: 0, credito: 0 }
      agg.set(key, r)
    }
    r.debito += l.valor
  }
  return [...agg.values()]
}

/* ------------------- Reclassificação gerencial (de-para) ------------------- */
// Ajuste gerencial de VALORES: move parte do valor de uma CONTA de origem
// para outro grupo/subgrupo do DRE (destino), por empresa/ano/mês, SEM tocar
// na base contábil. Entra no DRE como duas linhas sintéticas por ajuste:
//   • CONTRA na conta de origem — reduz a conta na sua classificação original;
//   • LANÇAMENTO no destino — código sintético mapeado ao grupo/subgrupo escolhido.
// Auditável (o de-para fica explícito) e reversível. Core reutilizável.
export const RECLASS_PREFIXO = '__reclass__'

export interface ReclassLanc {
  empresa: string
  ano: number
  mes: number // 1..12
  origem: string // código da conta contábil de onde o valor sai
  origemNome?: string // nome da conta de origem (rótulo)
  grupo: string // destino: grupo (nível 1)
  subgrupo: string // destino: subgrupo (nível 2, livre)
  valor: number // > 0 (valor transferido)
}

const slugReclass = (s: string) => (s || '').replace(/[^a-z0-9]+/gi, '-').toLowerCase()

/** Código sintético estável da linha de destino (por destino + origem, para
 *  preservar a rastreabilidade da reclassificação dentro do próprio DRE). */
export function reclassDestinoCodigo(grupo: string, subgrupo: string, origem: string): string {
  return `${RECLASS_PREFIXO}${slugReclass(grupo)}|${slugReclass(subgrupo)}|${slugReclass(origem)}`
}

export interface ReclassResultado {
  rows: (RowLike & { empresa: string; ano: number })[]
  overrides: Record<string, { grupo: string; subgrupo: string }>
}

/**
 * Converte os ajustes de reclassificação em linhas sintéticas para o buildDRE,
 * mais os overrides que posicionam cada linha de destino no grupo/subgrupo certo.
 * `papelDeGrupo` decide o lado do lançamento (grupo de receita usa crédito;
 * de despesa/custo usa débito), tanto na contra da origem quanto no destino.
 */
export function reclassParaRows(
  reclasses: ReclassLanc[],
  papelDeGrupo: (grupo: string) => Papel,
  classificar: Classificador,
): ReclassResultado {
  const agg = new Map<string, RowLike & { empresa: string; ano: number }>()
  const overrides: Record<string, { grupo: string; subgrupo: string }> = {}
  const add = (
    key: string,
    base: () => RowLike & { empresa: string; ano: number },
    deb: number,
    cred: number,
  ) => {
    let r = agg.get(key)
    if (!r) {
      r = base()
      agg.set(key, r)
    }
    r.debito += deb
    r.credito += cred
  }
  for (const l of reclasses) {
    if (!l.valor || l.mes < 1 || l.mes > 12 || !l.origem || !l.grupo) continue
    const origemGrupo = classificar(l.origem, l.origemNome || '').grupo
    const origemReceita = ehReceitaPapel(papelDeGrupo(origemGrupo))
    const destinoReceita = ehReceitaPapel(papelDeGrupo(l.grupo))

    // 1) contra na origem — reduz a conta na classificação original dela.
    const kO = `O|${l.empresa}|${l.ano}|${l.origem}|${l.mes}`
    add(
      kO,
      () => ({ empresa: l.empresa, ano: l.ano, codigo: l.origem, nome: l.origemNome || l.origem, mes: l.mes, debito: 0, credito: 0 }),
      origemReceita ? l.valor : 0,
      origemReceita ? 0 : l.valor,
    )

    // 2) destino — código sintético mapeado ao grupo/subgrupo escolhido.
    const codDest = reclassDestinoCodigo(l.grupo, l.subgrupo, l.origem)
    overrides[codDest] = { grupo: l.grupo, subgrupo: l.subgrupo }
    const kD = `D|${l.empresa}|${l.ano}|${codDest}|${l.mes}`
    add(
      kD,
      () => ({ empresa: l.empresa, ano: l.ano, codigo: codDest, nome: `Reclass.: ${l.origemNome || l.origem}`, mes: l.mes, debito: 0, credito: 0 }),
      destinoReceita ? 0 : l.valor,
      destinoReceita ? l.valor : 0,
    )
  }
  return { rows: [...agg.values()], overrides }
}

// Segmentos do DRE: agrupam papéis e definem o subtotal que vem depois.
interface Segmento {
  papeis: Papel[]
  sub?: { key: string; label: string; tipo: 'sub' | 'result' | 'final' }
}
const SEGMENTOS: Segmento[] = [
  { papeis: ['receita_bruta'] },
  { papeis: ['deducao'], sub: { key: 'recliq', label: '= Receita Operacional Líquida', tipo: 'sub' } },
  { papeis: ['custo'], sub: { key: 'lucrobruto', label: '= Lucro Bruto', tipo: 'sub' } },
  { papeis: ['despesa_op', 'outra_desp_op', 'outra_rec_op', 'outras'], sub: { key: 'ebitda', label: '= EBITDA', tipo: 'result' } },
  { papeis: ['depreciacao'], sub: { key: 'ebit', label: '= EBIT (Resultado Operacional)', tipo: 'result' } },
  { papeis: ['rec_fin', 'desp_fin', 'equiv'], sub: { key: 'lair', label: '= Resultado antes do IR/CSLL', tipo: 'result' } },
  { papeis: ['imposto'], sub: { key: 'liquido', label: '= Resultado Líquido do Exercício', tipo: 'final' } },
]

export interface ContaLinha {
  codigo: string
  nome: string
  mes: number[]
  total: number
}
export interface SubgrupoLinha {
  nome: string
  mes: number[]
  total: number
  contas: ContaLinha[]
}
export interface LinhaGrupo {
  tipo: 'grupo'
  key: string
  label: string
  papel: Papel
  sinal: '+' | '–'
  mes: number[]
  total: number
  subgrupos: SubgrupoLinha[]
  contas: ContaLinha[] // contas sem subgrupo (direto no grupo)
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
export type Classificador = (codigo: string, nome: string) => { grupo: string; subgrupo: string }

/**
 * Classificação PADRÃO (código → grupo nível 1 + subgrupo nível 2), reproduzindo
 * a estrutura montada com o cliente. A parte 2 poderá sobrepor por conta.
 */
export function classificarPadrao(codigo: string, nome: string): { grupo: string; subgrupo: string } {
  const N = (nome || '').toUpperCase()
  const has = (p: string) => codigo === p || codigo.startsWith(p + '.')
  const g = (grupo: string, subgrupo = '') => ({ grupo, subgrupo })
  if (codigo === DDL_CODIGO) return g(DDL_GRUPO, DDL_SUBGRUPO)
  if (has('3.1.10')) return g('Receita Operacional Bruta')
  if (has('3.1.20')) return g('Deduções da Receita Bruta')
  if (/DEPRECIA|AMORTIZA/.test(N)) return g('Depreciação e Amortização')
  if (has('4')) return g('Custos dos Serviços Prestados')
  if (has('5.1.10.400')) return g('Outras Receitas Operacionais')
  if (has('5.1.10.300')) return g('Receitas Financeiras')
  if (has('5.1.12')) return g('Despesas Financeiras')
  if (has('5.7')) return g('IR / CSLL sobre o Lucro')
  if (has('5.1.11.100')) return g('Despesas Operacionais', 'Pessoal e Encargos')
  if (has('5.1.11.400')) return g('Despesas Operacionais', 'Utilidades e Serviços')
  if (has('5.1.11.500')) return g('Despesas Operacionais', 'Serviços de Terceiros (PJ)')
  if (has('5.1.11.700')) return g('Despesas Operacionais', 'Despesas Gerais')
  if (has('5.1.11.800')) return g('Despesas Operacionais', 'Impostos e Taxas')
  if (has('5.1.11')) return g('Despesas Operacionais', 'Outras')
  return g('Outras contas de resultado')
}

export interface BuildOpts {
  classificar?: Classificador
  catalogo?: GrupoDef[]
}

export function buildDRE(rows: RowLike[], opts: BuildOpts = {}): { linhas: LinhaDRE[] } {
  const classificar = opts.classificar || classificarPadrao
  const catalogo = opts.catalogo && opts.catalogo.length ? opts.catalogo : CATALOGO_PADRAO
  const papelDe = new Map<string, Papel>(catalogo.map((c) => [c.nome, c.papel]))

  interface Acc {
    mes: number[]
    subs: Map<string, { mes: number[]; contas: Map<string, ContaLinha> }>
    diretas: Map<string, ContaLinha>
  }
  const G = new Map<string, Acc>()
  const getG = (nome: string): Acc => {
    let a = G.get(nome)
    if (!a) {
      a = { mes: z12(), subs: new Map(), diretas: new Map() }
      G.set(nome, a)
    }
    return a
  }

  for (const r of rows) {
    const m = r.mes - 1
    if (m < 0 || m > 11) continue
    const { grupo, subgrupo } = classificar(r.codigo, r.nome)
    const papel = papelDe.get(grupo) || 'outras'
    const val = ehReceita(papel) ? r.credito - r.debito : r.debito - r.credito
    const a = getG(grupo)
    a.mes[m] += val
    if (subgrupo) {
      let s = a.subs.get(subgrupo)
      if (!s) {
        s = { mes: z12(), contas: new Map() }
        a.subs.set(subgrupo, s)
      }
      s.mes[m] += val
      let c = s.contas.get(r.codigo)
      if (!c) {
        c = { codigo: r.codigo, nome: r.nome, mes: z12(), total: 0 }
        s.contas.set(r.codigo, c)
      }
      c.mes[m] += val
      c.total += val
    } else {
      let c = a.diretas.get(r.codigo)
      if (!c) {
        c = { codigo: r.codigo, nome: r.nome, mes: z12(), total: 0 }
        a.diretas.set(r.codigo, c)
      }
      c.mes[m] += val
      c.total += val
    }
  }

  const mkGrupo = (def: GrupoDef): LinhaGrupo | null => {
    const a = G.get(def.nome)
    if (!a) return null
    const subgrupos: SubgrupoLinha[] = [...a.subs.entries()]
      .map(([nome, s]) => ({ nome, mes: s.mes, total: sum12(s.mes), contas: [...s.contas.values()].sort((x, y) => y.total - x.total) }))
      .sort((x, y) => y.total - x.total)
    const contas = [...a.diretas.values()].sort((x, y) => y.total - x.total)
    if (Math.abs(sum12(a.mes)) < 0.005 && !subgrupos.length && !contas.length) return null
    return {
      tipo: 'grupo',
      key: 'g:' + def.nome,
      label: def.nome,
      papel: def.papel,
      sinal: ehReceita(def.papel) ? '+' : '–',
      mes: a.mes,
      total: sum12(a.mes),
      subgrupos,
      contas,
    }
  }

  const linhas: LinhaDRE[] = []
  const running = z12()
  for (const seg of SEGMENTOS) {
    for (const def of catalogo) {
      if (!seg.papeis.includes(def.papel)) continue
      const l = mkGrupo(def)
      if (!l) continue
      linhas.push(l)
      const f = ehReceita(def.papel) ? 1 : -1
      for (let i = 0; i < 12; i++) running[i] += f * l.mes[i]
    }
    if (seg.sub) linhas.push({ tipo: seg.sub.tipo, key: seg.sub.key, label: seg.sub.label, mes: running.slice(), total: sum12(running) })
  }
  return { linhas }
}

/* ================== Suporte ao ambiente de reclassificação ================== */
export interface PapelInfo {
  papel: Papel
  label: string // rótulo amigável (o que faz no DRE)
}
// Tipos de grupo (nível 1) na ordem em que aparecem no DRE.
export const PAPEIS: PapelInfo[] = [
  { papel: 'receita_bruta', label: 'Receita bruta (soma)' },
  { papel: 'deducao', label: 'Dedução da receita (subtrai)' },
  { papel: 'custo', label: 'Custo dos serviços (subtrai)' },
  { papel: 'despesa_op', label: 'Despesa operacional (subtrai)' },
  { papel: 'outra_desp_op', label: 'Outra despesa operacional (subtrai)' },
  { papel: 'outra_rec_op', label: 'Outra receita operacional (soma)' },
  { papel: 'depreciacao', label: 'Depreciação / Amortização (subtrai, após EBITDA)' },
  { papel: 'rec_fin', label: 'Receita financeira (soma)' },
  { papel: 'desp_fin', label: 'Despesa financeira (subtrai)' },
  { papel: 'equiv', label: 'Equivalência patrimonial (subtrai)' },
  { papel: 'imposto', label: 'IR / CSLL sobre o lucro (subtrai)' },
]
export const papelLabel = (p: string): string => PAPEIS.find((x) => x.papel === p)?.label ?? p

// Classificador com overrides por conta (sobrepõe a classificação padrão).
export function montarClassificador(overrides: Record<string, { grupo: string; subgrupo: string }>): Classificador {
  return (codigo, nome) => overrides[codigo] ?? classificarPadrao(codigo, nome)
}

// Catálogo = grupos padrão + grupos customizados (sem duplicar nome).
export function montarCatalogo(custom: GrupoDef[]): GrupoDef[] {
  const nomes = new Set(CATALOGO_PADRAO.map((g) => g.nome))
  const extras = custom.filter((g) => g.nome && !nomes.has(g.nome))
  return [...CATALOGO_PADRAO, ...extras]
}

// Ordem canônica dos grupos (nível 1) para exibir no editor: por segmento do DRE.
export function ordemGrupos(catalogo: GrupoDef[]): GrupoDef[] {
  const ordemPapel = PAPEIS.map((p) => p.papel)
  return [...catalogo].sort((a, b) => ordemPapel.indexOf(a.papel) - ordemPapel.indexOf(b.papel))
}
