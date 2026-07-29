import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../auth/AuthContext'
import { readFirstSheetAOA } from '../../lib/xls'
import {
  apelidoEmpresa,
  buildDRE,
  ddlParaRows,
  MESES,
  montarCatalogo,
  montarClassificador,
  parseRazaoAOA,
  reclassParaRows,
  type ContaLinha,
  type GrupoDef,
  type LinhaDRE,
  type LinhaGrupo,
  type Papel,
  type ReclassLanc,
  type SubgrupoLinha,
} from './razaoDre'
import { ClassificacaoContas, type ContaUniverso } from './ClassificacaoContas'
import { Ddl, type DdlEntry } from './Ddl'
import { AjustesReclass, type ReclassSaveRow } from './AjustesReclass'

/* ================================================================== *
 *  DRE — Demonstração do Resultado do Exercício (multiempresa)
 *  Fonte: RAZÃO CONTÁBIL. O admin sobe o Razão (.xls/.xlsx) de cada
 *  empresa; o módulo detecta a empresa pelo CNPJ e guarda os movimentos
 *  das contas de resultado (classes 3/4/5) no Supabase, agregados por
 *  conta e mês. O DRE é montado a partir do plano de contas.
 *  Leitura: todo autenticado · Escrita (upload): admin.
 * ================================================================== */

interface Lanc {
  empresa: string
  codigo: string
  nome: string
  ano: number
  mes: number // 1..12
  debito: number
  credito: number
}
const CONSOLIDADO = '__consolidado__'
// Equivalência patrimonial: participação de uma empresa do grupo em outra. No
// consolidado ela duplica o resultado (a empresa "espelha" o resultado da outra),
// então oferecemos o flag para excluí-la. Identificada pelo nome da conta.
const ehEquiv = (nome: string) => /EQUIVAL/i.test(nome || '')

/* ------------------------------- utils ------------------------------- */
function fmt(v: number): string {
  if (Math.abs(v) < 0.5) return '—'
  const s = Math.round(Math.abs(v)).toLocaleString('pt-BR')
  return v < 0 ? `(${s})` : s
}
const clsNum = (v: number) => (Math.abs(v) < 0.5 ? 'zero' : v < 0 ? 'neg' : '')
// Degradê quente (âmbar → laranja → vermelho-laranja) — barrinha dos KPIs, estilo MC
const GRAD_KPI = 'linear-gradient(180deg, #FE9F2E 0%, #FB5403 55%, #F5390A 100%)'

/* ============================ Componente ============================ */
export function Dre() {
  const { user, mode } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [rows, setRows] = useState<Lanc[]>([])
  const [ddl, setDdl] = useState<DdlEntry[]>([])
  const [reclass, setReclass] = useState<ReclassLanc[]>([])
  const [overrides, setOverrides] = useState<Record<string, { grupo: string; subgrupo: string }>>({})
  const [customGrupos, setCustomGrupos] = useState<GrupoDef[]>([])
  const [empresaSel, setEmpresaSel] = useState<string>(CONSOLIDADO)
  const [mesDe, setMesDe] = useState(0)
  const [mesAte, setMesAte] = useState(11)
  const [semEquiv, setSemEquiv] = useState(true)
  const [view, setView] = useState<'anual' | 'mensal'>('mensal')
  const [modo, setModo] = useState<'dre' | 'classificar' | 'ddl' | 'reclass'>('dre')
  const [salvandoCls, setSalvandoCls] = useState(false)
  const [salvandoDdl, setSalvandoDdl] = useState(false)
  const [salvandoRcl, setSalvandoRcl] = useState(false)
  const [open, setOpen] = useState<Record<string, boolean>>({})
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
      setLoading(false)
      return
    }
    const { data, error } = await supabase
      .from('dre_lancamentos')
      .select('empresa, codigo, nome, ano, mes, debito, credito')
      .order('empresa')
    if (error) {
      setErro('Não foi possível carregar a base. Verifique se a tabela dre_lancamentos foi criada no Supabase.')
      setLoading(false)
      return
    }
    setRows(
      (data ?? []).map((r) => ({
        empresa: (r.empresa ?? '').toString(),
        codigo: (r.codigo ?? '').toString(),
        nome: (r.nome ?? '').toString(),
        ano: Number(r.ano) || 0,
        mes: Number(r.mes) || 0,
        debito: Number(r.debito) || 0,
        credito: Number(r.credito) || 0,
      })),
    )
    // classificação + grupos customizados + DDL (tolera tabelas ausentes = usa padrão)
    const [cls, grp, ddlRes, rclRes] = await Promise.all([
      supabase.from('dre_classificacao').select('codigo, grupo, subgrupo'),
      supabase.from('dre_grupos').select('nome, papel, ordem').order('ordem'),
      supabase.from('dre_ddl').select('empresa, socio, ano, mes, valor'),
      supabase.from('dre_reclass').select('empresa, ano, mes, origem, origem_nome, grupo, subgrupo, valor'),
    ])
    const ov: Record<string, { grupo: string; subgrupo: string }> = {}
    for (const c of cls.data ?? []) ov[(c.codigo ?? '').toString()] = { grupo: (c.grupo ?? '').toString(), subgrupo: (c.subgrupo ?? '').toString() }
    setOverrides(ov)
    setCustomGrupos((grp.data ?? []).map((g) => ({ nome: (g.nome ?? '').toString(), papel: (g.papel ?? 'despesa_op') as GrupoDef['papel'] })))
    setDdl((ddlRes.data ?? []).map((d) => ({
      empresa: (d.empresa ?? '').toString(),
      socio: (d.socio ?? '').toString(),
      ano: Number(d.ano) || 0,
      mes: Number(d.mes) || 0,
      valor: Number(d.valor) || 0,
    })))
    setReclass((rclRes.data ?? []).map((r) => ({
      empresa: (r.empresa ?? '').toString(),
      ano: Number(r.ano) || 0,
      mes: Number(r.mes) || 0,
      origem: (r.origem ?? '').toString(),
      origemNome: (r.origem_nome ?? '').toString(),
      grupo: (r.grupo ?? '').toString(),
      subgrupo: (r.subgrupo ?? '').toString(),
      valor: Number(r.valor) || 0,
    })))
    setLoading(false)
  }, [mode])

  useEffect(() => {
    carregar()
  }, [carregar])

  /* ---------- empresas disponíveis ---------- */
  const empresas = useMemo(() => {
    const map = new Map<string, string>() // empresa -> apelido
    for (const r of rows) if (!map.has(r.empresa)) map.set(r.empresa, apelidoEmpresa(r.empresa))
    return [...map.entries()].map(([empresa, apelido]) => ({ empresa, apelido })).sort((a, b) => a.apelido.localeCompare(b.apelido))
  }, [rows])

  // se a empresa selecionada sumir (base recarregada), volta pro consolidado
  useEffect(() => {
    if (empresaSel !== CONSOLIDADO && !empresas.some((e) => e.empresa === empresaSel)) setEmpresaSel(CONSOLIDADO)
  }, [empresas, empresaSel])

  /* ---------- classificação efetiva ---------- */
  const classificar = useMemo(() => montarClassificador(overrides), [overrides])
  const catalogo = useMemo(() => montarCatalogo(customGrupos), [customGrupos])
  const papelDeGrupo = useMemo(() => {
    const m = new Map(catalogo.map((g) => [g.nome, g.papel]))
    return (grupo: string): Papel => m.get(grupo) ?? 'outras'
  }, [catalogo])

  /* ---------- DDL: linha sintética por empresa/mês (Pessoal e Encargos) ---------- */
  const ddlLancs = useMemo<Lanc[]>(
    () => ddlParaRows(ddl).map((r) => ({ empresa: r.empresa, codigo: r.codigo, nome: r.nome, ano: r.ano, mes: r.mes, debito: r.debito, credito: r.credito })),
    [ddl],
  )

  /* ---------- Ajustes gerenciais: linhas sintéticas (contra na origem + destino) ---------- */
  const reclassData = useMemo(() => reclassParaRows(reclass, papelDeGrupo, classificar), [reclass, papelDeGrupo, classificar])
  const reclassLancs = useMemo<Lanc[]>(
    () => reclassData.rows.map((r) => ({ empresa: r.empresa, codigo: r.codigo, nome: r.nome, ano: r.ano, mes: r.mes, debito: r.debito, credito: r.credito })),
    [reclassData],
  )
  // classificador do DRE = overrides de conta + destinos sintéticos da reclassificação
  const classificarDRE = useMemo(() => montarClassificador({ ...overrides, ...reclassData.overrides }), [overrides, reclassData])

  /* ---------- recorte por empresa + período (mês De/Até) ---------- */
  // rows reais + DDL + ajustes gerenciais (sintéticos entram no cálculo do DRE,
  // mas ficam fora do universo de reclassificação e do download da base).
  const baseRows = useMemo(() => [...rows, ...ddlLancs, ...reclassLancs], [rows, ddlLancs, reclassLancs])
  const rowsEmpresa = useMemo(() => (empresaSel === CONSOLIDADO ? baseRows : baseRows.filter((r) => r.empresa === empresaSel)), [baseRows, empresaSel])
  const mesesDisponiveis = useMemo(() => {
    const set = new Set<number>()
    for (const r of rowsEmpresa) if (r.mes >= 1 && r.mes <= 12) set.add(r.mes - 1)
    return [...set].sort((a, b) => a - b)
  }, [rowsEmpresa])
  // ajusta o período para a faixa disponível quando a base/empresa muda
  useEffect(() => {
    if (!mesesDisponiveis.length) return
    const min = mesesDisponiveis[0]
    const max = mesesDisponiveis[mesesDisponiveis.length - 1]
    setMesDe((d) => (d < min || d > max ? min : d))
    setMesAte((a) => (a < min || a > max ? max : a))
  }, [mesesDisponiveis])

  const temEquiv = useMemo(() => rowsEmpresa.some((r) => ehEquiv(r.nome)), [rowsEmpresa])
  const filtro = useMemo(
    () => rowsEmpresa.filter((r) => r.mes - 1 >= mesDe && r.mes - 1 <= mesAte && !(semEquiv && ehEquiv(r.nome))),
    [rowsEmpresa, mesDe, mesAte, semEquiv],
  )
  const { linhas } = useMemo(() => buildDRE(filtro, { classificar: classificarDRE, catalogo }), [filtro, classificarDRE, catalogo])
  const mesesVis = useMemo(() => {
    const a: number[] = []
    for (let m = mesDe; m <= mesAte; m++) a.push(m)
    return a
  }, [mesDe, mesAte])
  const umMes = mesDe === mesAte

  /* ---------- universo de contas (para o editor de classificação) ---------- */
  const universo = useMemo<ContaUniverso[]>(() => {
    const m = new Map<string, { codigo: string; nome: string; cred: number; deb: number }>()
    for (const r of rows) {
      const e = m.get(r.codigo) ?? { codigo: r.codigo, nome: r.nome, cred: 0, deb: 0 }
      e.cred += r.credito
      e.deb += r.debito
      if (!e.nome && r.nome) e.nome = r.nome
      m.set(r.codigo, e)
    }
    return [...m.values()].map((e) => ({ codigo: e.codigo, nome: e.nome, valor: Math.abs(e.cred - e.deb) }))
  }, [rows])

  async function salvarClassificacao(mapa: Record<string, { grupo: string; subgrupo: string }>, custom: GrupoDef[]) {
    setSalvandoCls(true)
    setErro(null)
    try {
      if (mode === 'supabase' && supabase) {
        const agora = new Date().toISOString()
        const clsRows = Object.entries(mapa).map(([codigo, v]) => ({ codigo, grupo: v.grupo, subgrupo: v.subgrupo, updated_at: agora }))
        const { error: e1 } = await supabase.from('dre_classificacao').upsert(clsRows)
        if (e1) throw new Error(e1.message)
        if (custom.length) {
          const grpRows = custom.map((g, i) => ({ nome: g.nome, papel: g.papel, ordem: i, updated_at: agora }))
          const { error: e2 } = await supabase.from('dre_grupos').upsert(grpRows)
          if (e2) throw new Error(e2.message)
        }
        await carregar()
      } else {
        setOverrides(mapa)
        setCustomGrupos(custom)
      }
      setModo('dre')
      setAviso('Classificação salva. O DRE foi reorganizado.')
    } catch (e) {
      setErro(`Não consegui salvar a classificação: ${(e as Error).message}. Rode o SQL de classificação no Supabase (setup/dre-classificacao-sql.html).`)
    } finally {
      setSalvandoCls(false)
    }
  }
  const anos = useMemo(() => [...new Set(filtro.map((r) => r.ano))].filter(Boolean).sort(), [filtro])
  // anos para o editor de DDL: todos os anos com base + os já lançados em DDL
  const anosDisponiveis = useMemo(
    () => [...new Set<number>([...rows.map((r) => r.ano), ...ddl.map((d) => d.ano), ...reclass.map((r) => r.ano)])].filter(Boolean).sort((a, b) => a - b),
    [rows, ddl, reclass],
  )

  async function salvarDdl(empresa: string, ano: number, ddlRows: { socio: string; mes: number; valor: number }[]) {
    setSalvandoDdl(true)
    setErro(null)
    try {
      if (mode === 'supabase' && supabase) {
        const { error } = await supabase.rpc('dre_ddl_replace', { p_empresa: empresa, p_ano: ano, p_rows: ddlRows })
        if (error) throw new Error(error.message)
        await carregar()
      } else {
        // modo demo: substitui em memória os lançamentos da empresa+ano
        setDdl((prev) => [
          ...prev.filter((d) => !(d.empresa === empresa && d.ano === ano)),
          ...ddlRows.map((r) => ({ empresa, socio: r.socio, ano, mes: r.mes, valor: r.valor })),
        ])
      }
      setModo('dre')
      setAviso('DDL salvo. A linha DDL do DRE foi atualizada.')
    } catch (e) {
      setErro(`Não consegui salvar o DDL: ${(e as Error).message}. Rode o SQL do DDL no Supabase (setup/dre-ddl-sql.html).`)
    } finally {
      setSalvandoDdl(false)
    }
  }

  async function salvarReclass(empresa: string, ano: number, rclRows: ReclassSaveRow[]) {
    setSalvandoRcl(true)
    setErro(null)
    try {
      if (mode === 'supabase' && supabase) {
        const { error } = await supabase.rpc('dre_reclass_replace', { p_empresa: empresa, p_ano: ano, p_rows: rclRows })
        if (error) throw new Error(error.message)
        await carregar()
      } else {
        // modo demo: substitui em memória os ajustes da empresa+ano
        setReclass((prev) => [
          ...prev.filter((r) => !(r.empresa === empresa && r.ano === ano)),
          ...rclRows.map((r) => ({ empresa, ano, mes: r.mes, origem: r.origem, origemNome: r.origem_nome, grupo: r.grupo, subgrupo: r.subgrupo, valor: r.valor })),
        ])
      }
      setModo('dre')
      setAviso('Ajustes gerenciais salvos. O DRE foi recalculado.')
    } catch (e) {
      setErro(`Não consegui salvar os ajustes: ${(e as Error).message}. Rode o SQL no Supabase (setup/dre-reclass-sql.html).`)
    } finally {
      setSalvandoRcl(false)
    }
  }

  /* ---------- KPIs ---------- */
  const byKey = (k: string) => linhas.find((l) => l.key === k)
  const recBruta = linhas.find((l) => l.tipo === 'grupo' && l.papel === 'receita_bruta')?.total ?? 0
  const recLiq = byKey('recliq')?.total ?? 0
  const ebitda = byKey('ebitda')?.total ?? 0
  const liquido = byKey('liquido')?.total ?? 0
  const margem = recBruta > 0 ? (liquido / recBruta) * 100 : null

  const vazio = rows.length === 0

  /* ---------- upload ---------- */
  async function handleFile(file: File) {
    setErro(null)
    setAviso(null)
    setBusy(true)
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const aoa = readFirstSheetAOA(XLSX, buf)
      if (!aoa.length) throw new Error('não consegui ler a planilha (arquivo vazio ou formato não suportado).')
      const parsed = parseRazaoAOA(aoa)
      if (!parsed.empresa) throw new Error('não encontrei a empresa no cabeçalho do Razão (linha "Empresa:").')
      if (!parsed.rows.length) throw new Error('não encontrei lançamentos de contas de resultado (classes 3, 4 e 5) no Razão.')

      if (mode === 'supabase' && supabase) {
        const payload = parsed.rows.map((r) => ({ codigo: r.codigo, nome: r.nome, ano: r.ano, mes: r.mes, debito: r.debito, credito: r.credito }))
        const { error } = await supabase.rpc('dre_upload', { p_empresa: parsed.empresa, p_cnpj: parsed.cnpj, p_rows: payload })
        if (error) throw new Error(error.message)
        await carregar()
      } else {
        // modo demo: substitui em memória os meses da empresa
        const meses = new Set(parsed.rows.map((r) => `${r.ano}-${r.mes}`))
        setRows((prev) => [
          ...prev.filter((r) => !(r.empresa === parsed.empresa && meses.has(`${r.ano}-${r.mes}`))),
          ...parsed.rows.map((r) => ({ empresa: parsed.empresa, ...r })),
        ])
      }
      setEmpresaSel(parsed.empresa)
      setOpen({})
      const nomeMeses = parsed.meses.map((m) => MESES[m - 1]).join(', ')
      setAviso(`${apelidoEmpresa(parsed.empresa)}: base atualizada — ${parsed.rows.length} contas·mês (${nomeMeses}).`)
    } catch (e) {
      setErro(`Não consegui importar o Razão: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  async function baixarBase() {
    try {
      setBusy(true)
      const XLSX = await import('xlsx')
      const head = ['EMPRESA', 'CÓDIGO', 'CONTA', 'ANO', 'MÊS', 'DÉBITO', 'CRÉDITO']
      const aoa: unknown[][] = [head]
      for (const r of rows) aoa.push([apelidoEmpresa(r.empresa), r.codigo, r.nome, r.ano, r.mes, r.debito, r.credito])
      const ws = XLSX.utils.aoa_to_sheet(aoa)
      ws['!cols'] = [{ wch: 12 }, { wch: 18 }, { wch: 40 }, { wch: 7 }, { wch: 6 }, { wch: 14 }, { wch: 14 }]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'DRE')
      const h = new Date()
      const z = (n: number) => `${n < 10 ? '0' : ''}${n}`
      XLSX.writeFile(wb, `Base DRE - ${h.getFullYear()}${z(h.getMonth() + 1)}${z(h.getDate())}.xlsx`)
    } catch (e) {
      setErro(`Erro ao baixar a base: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }))

  /* ---------- render ---------- */
  return (
    <div
      className="dre-mod flex flex-col gap-3"
      style={{ width: 'min(1400px, 95vw)', position: 'relative', left: '50%', transform: 'translateX(-50%)' }}
    >
      <ScopedStyle />

      {/* Cabeçalho do módulo */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-lg font-semibold text-ink">DRE — Demonstração do Resultado</h2>
          <p className="text-[13px] text-muted">
            Regime de competência · a partir do Razão Contábil{anos.length ? ` · ${anos.join('/')}` : ''} · negativos entre parênteses
          </p>
        </div>
        {modo === 'dre' && (
          <div className="flex flex-wrap items-end gap-2">
            {isAdmin && (
              <button
                className="inline-flex items-center gap-2 rounded-lg border border-brand/30 bg-brand/10 px-4 py-2.5 text-[13px] font-bold text-brand transition hover:bg-brand/20 disabled:opacity-50"
                onClick={() => setModo('classificar')}
                disabled={busy || vazio}
                title="Definir grupos e subgrupos do DRE por conta"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M3 12h18M3 18h18" /><circle cx="8" cy="6" r="1.6" fill="currentColor" stroke="none" /><circle cx="16" cy="12" r="1.6" fill="currentColor" stroke="none" /><circle cx="10" cy="18" r="1.6" fill="currentColor" stroke="none" /></svg>
                Reclassificar contas
              </button>
            )}
            <button
              className="inline-flex items-center gap-2 rounded-lg border border-brand/30 bg-brand/10 px-4 py-2.5 text-[13px] font-bold text-brand transition hover:bg-brand/20 disabled:opacity-50"
              onClick={() => setModo('ddl')}
              disabled={busy || vazio}
              title="Antecipação de lucros dos sócios (DDL) — lançar/consultar por sócio"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3" /><path d="M2 20c0-3.3 3.1-5 7-5s7 1.7 7 5" /><path d="M17 8h5M19.5 5.5v5" /></svg>
              DDL
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-lg border border-brand/30 bg-brand/10 px-4 py-2.5 text-[13px] font-bold text-brand transition hover:bg-brand/20 disabled:opacity-50"
              onClick={() => setModo('reclass')}
              disabled={busy || vazio}
              title="Ajustes gerenciais — reclassificar valores entre contas/grupos (de-para)"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h11" /><path d="m12 4 3 3-3 3" /><path d="M20 17H9" /><path d="m12 20-3-3 3-3" /></svg>
              Ajustes
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-lg border border-brand/30 bg-brand/10 px-4 py-2.5 text-[13px] font-bold text-brand transition hover:bg-brand/20 disabled:opacity-50"
              onClick={baixarBase}
              disabled={busy || vazio}
              title="Baixar a base atual em Excel"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>
              Baixar base
            </button>
            {isAdmin && (
              <button
                className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-[13px] font-bold text-white shadow-brand transition hover:opacity-90 disabled:opacity-50"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                title="Enviar o Razão Contábil (.xls/.xlsx) de uma empresa"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21V9" /><path d="m7 14 5-5 5 5" /><path d="M5 3h14" /></svg>
                {busy ? 'Processando…' : 'Subir Razão'}
              </button>
            )}
            <input ref={fileRef} type="file" accept=".xls,.xlsx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} />
          </div>
        )}
      </div>

      {erro && <Alerta tipo="erro" texto={erro} onClose={() => setErro(null)} />}
      {aviso && <Alerta tipo="ok" texto={aviso} onClose={() => setAviso(null)} />}

      {modo === 'classificar' ? (
        <ClassificacaoContas
          contas={universo}
          classificarInicial={classificar}
          customIniciais={customGrupos}
          onSalvar={salvarClassificacao}
          onFechar={() => setModo('dre')}
          salvando={salvandoCls}
        />
      ) : modo === 'ddl' ? (
        <Ddl
          entries={ddl}
          empresas={empresas}
          anos={anosDisponiveis}
          onSalvar={salvarDdl}
          onFechar={() => setModo('dre')}
          salvando={salvandoDdl}
          somenteLeitura={!isAdmin}
        />
      ) : modo === 'reclass' ? (
        <AjustesReclass
          entries={reclass}
          contas={universo}
          catalogo={catalogo}
          empresas={empresas}
          anos={anosDisponiveis}
          onSalvar={salvarReclass}
          onFechar={() => setModo('dre')}
          salvando={salvandoRcl}
          somenteLeitura={!isAdmin}
        />
      ) : (
        <>
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi lbl="Receita Líquida" val={recLiq} accent="band" foot="após deduções" />
        <Kpi lbl="EBITDA" val={ebitda} accent={ebitda >= 0 ? 'pos' : 'neg'} foot="antes de deprec. e financeiro" signed />
        <Kpi lbl="Resultado Líquido" val={liquido} accent={liquido >= 0 ? 'pos' : 'neg'} foot="após IR/CSLL" signed />
        <Kpi lbl="Margem Líquida" val={margem} isPct foot="resultado ÷ receita bruta" signed accent={margem !== null && margem < 0 ? 'neg' : 'pos'} />
      </div>

      {/* Tabela do DRE */}
      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          {/* seletor de empresa */}
          <div className="seg flex-wrap">
            <button className={empresaSel === CONSOLIDADO ? 'on' : ''} onClick={() => setEmpresaSel(CONSOLIDADO)} title="Soma de todas as empresas">
              Consolidado
            </button>
            {empresas.map((e) => (
              <button key={e.empresa} className={empresaSel === e.empresa ? 'on' : ''} onClick={() => setEmpresaSel(e.empresa)} title={e.empresa}>
                {e.apelido}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-[12px] text-muted">
              <span className="text-[10px] font-bold uppercase tracking-wider">Período</span>
              <select className="periodo-sel" value={mesDe} onChange={(e) => { const v = +e.target.value; setMesDe(v); if (v > mesAte) setMesAte(v) }} title="Mês inicial">
                {mesesDisponiveis.map((m) => <option key={m} value={m}>{MESES[m]}</option>)}
              </select>
              <span>a</span>
              <select className="periodo-sel" value={mesAte} onChange={(e) => { const v = +e.target.value; setMesAte(v); if (v < mesDe) setMesDe(v) }} title="Mês final">
                {mesesDisponiveis.map((m) => <option key={m} value={m}>{MESES[m]}</option>)}
              </select>
            </div>
            {temEquiv && (
              <label
                className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12px] font-semibold text-muted transition hover:border-brand"
                title="A equivalência patrimonial (participação societária entre empresas do grupo) duplica o resultado no consolidado. Marque para excluí-la do DRE."
              >
                <input type="checkbox" checked={semEquiv} onChange={(e) => setSemEquiv(e.target.checked)} style={{ accentColor: 'rgb(var(--brand))', width: 15, height: 15 }} />
                Sem equivalência patrimonial
              </label>
            )}
            <div className="seg">
              <button className={view === 'anual' ? 'on' : ''} onClick={() => setView('anual')}>Acumulado</button>
              <button className={view === 'mensal' ? 'on' : ''} onClick={() => setView('mensal')}>Mensal</button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="grid place-items-center py-16 text-sm text-muted">Carregando base…</div>
        ) : vazio ? (
          <div className="grid place-items-center gap-2 px-6 py-16 text-center">
            <p className="font-serif text-lg text-ink">A base ainda não foi carregada.</p>
            <p className="max-w-md text-sm text-muted">
              {isAdmin
                ? 'Clique em “Subir Razão” e envie o Razão Contábil de cada empresa (.xls do sistema contábil). O DRE é gerado automaticamente.'
                : 'Assim que um administrador enviar o Razão, o DRE aparecerá aqui.'}
            </p>
          </div>
        ) : (
          <div className="dre-scroller">
            <table className={`dre tnum${view === 'mensal' ? ' mensal' : ''}`}>
              <thead>
                <tr>
                  <th className="rowlabel">Conta</th>
                  {view === 'mensal' && mesesVis.map((i) => <th key={i}>{MESES[i]}</th>)}
                  <th className="col-total">{view === 'mensal' ? (umMes ? 'Mês' : 'Período') : umMes ? MESES[mesDe] : 'Período'}</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) =>
                  l.tipo === 'grupo' ? (
                    <Grupo key={l.key} l={l} view={view} mesesVis={mesesVis} open={open} toggle={toggle} />
                  ) : (
                    <LinhaSubtotal key={l.key} l={l} view={view} mesesVis={mesesVis} />
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Rodapé de dicas */}
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
        <span className="rounded-full border border-line bg-surface px-2.5 py-1 font-medium">💡 Clique numa conta para ver o detalhamento</span>
        {!vazio && (
          <span className="rounded-full border border-line bg-surface px-2.5 py-1 font-medium">
            Período: {umMes ? MESES[mesDe] : `${MESES[mesDe]} a ${MESES[mesAte]}`}{anos.length ? ` / ${anos.join(', ')}` : ''}
          </span>
        )}
        {semEquiv && <span className="rounded-full border border-brand/40 bg-brand/10 px-2.5 py-1 font-bold text-brand">Equivalência patrimonial excluída do resultado</span>}
        <span className="rounded-full border border-line bg-surface px-2.5 py-1 font-medium">Contas de Balanço (1 e 2) e Apuração (5.8) não entram no DRE</span>
        {isAdmin && <span className="rounded-full border border-line bg-surface px-2.5 py-1 font-medium">Admin: use “Reclassificar contas” para ajustar grupos e subgrupos</span>}
        {!isAdmin && <span className="rounded-full border border-line bg-surface px-2.5 py-1 font-medium">Somente administradores atualizam a base</span>}
        {mode !== 'supabase' && <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 font-medium text-amber-700">Modo demonstração (dados não persistem)</span>}
      </div>
        </>
      )}
    </div>
  )
}

/* --------------------------- subcomponentes --------------------------- */
function Cells({ mes, total, view, mesesVis }: { mes: number[]; total: number; view: 'anual' | 'mensal'; mesesVis: number[] }) {
  return (
    <>
      {view === 'mensal' && mesesVis.map((i) => <td key={i} className={`num ${clsNum(mes[i])}`}>{fmt(mes[i])}</td>)}
      <td className={`num col-total ${clsNum(total)}`}>{fmt(total)}</td>
    </>
  )
}
function Grupo({ l, view, mesesVis, open, toggle }: { l: LinhaGrupo; view: 'anual' | 'mensal'; mesesVis: number[]; open: Record<string, boolean>; toggle: (k: string) => void }) {
  const temFilhos = l.subgrupos.length > 0 || l.contas.length > 0
  const aberto = !!open[l.key]
  return (
    <>
      <tr className={`grupo${aberto ? ' open' : ''}${temFilhos ? '' : ' semdet'}`} onClick={temFilhos ? () => toggle(l.key) : undefined}>
        <td className="rowlabel">
          {temFilhos && <span className="caret">▶</span>}
          <span className={`op ${l.sinal === '+' ? 'pos' : ''}`}>({l.sinal})</span> {l.label}
        </td>
        <Cells mes={l.mes} total={l.total} view={view} mesesVis={mesesVis} />
      </tr>
      {aberto && (
        <>
          {l.subgrupos.map((s: SubgrupoLinha) => (
            <Subgrupo key={s.nome} gkey={l.key} s={s} view={view} mesesVis={mesesVis} open={open} toggle={toggle} />
          ))}
          {l.contas.map((c: ContaLinha) => (
            <ContaRow key={c.codigo} c={c} view={view} mesesVis={mesesVis} nivel={1} />
          ))}
        </>
      )}
    </>
  )
}
function Subgrupo({ gkey, s, view, mesesVis, open, toggle }: { gkey: string; s: SubgrupoLinha; view: 'anual' | 'mensal'; mesesVis: number[]; open: Record<string, boolean>; toggle: (k: string) => void }) {
  const k = `sub:${gkey}|${s.nome}`
  const aberto = !!open[k]
  return (
    <>
      <tr className={`subgrupo${aberto ? ' open' : ''}`} onClick={() => toggle(k)}>
        <td className="rowlabel">
          <span className="caret">▶</span> {s.nome}
        </td>
        <Cells mes={s.mes} total={s.total} view={view} mesesVis={mesesVis} />
      </tr>
      {aberto && s.contas.map((c: ContaLinha) => <ContaRow key={c.codigo} c={c} view={view} mesesVis={mesesVis} nivel={2} />)}
    </>
  )
}
function ContaRow({ c, view, mesesVis, nivel }: { c: ContaLinha; view: 'anual' | 'mensal'; mesesVis: number[]; nivel: 1 | 2 }) {
  return (
    <tr className={`detail n${nivel}`}>
      <td className="rowlabel">
        <span className="cod">{c.codigo}</span> {c.nome}
      </td>
      <Cells mes={c.mes} total={c.total} view={view} mesesVis={mesesVis} />
    </tr>
  )
}
function LinhaSubtotal({ l, view, mesesVis }: { l: Exclude<LinhaDRE, LinhaGrupo>; view: 'anual' | 'mensal'; mesesVis: number[] }) {
  const cls = l.tipo === 'final' ? 'result final' : l.tipo === 'result' ? 'result' : 'sub'
  return (
    <tr className={cls}>
      <td className="rowlabel">{l.label}</td>
      <Cells mes={l.mes} total={l.total} view={view} mesesVis={mesesVis} />
    </tr>
  )
}
function Kpi({
  lbl, val, accent, foot, signed, isPct,
}: {
  lbl: string
  val: number | null
  accent: 'pos' | 'neg' | 'band'
  foot: string
  signed?: boolean
  isPct?: boolean
}) {
  const cor = val === null ? 'text-ink' : signed ? (val < 0 ? 'text-neg' : accent === 'band' ? 'text-ink' : 'text-pos') : accent === 'pos' ? 'text-pos' : accent === 'neg' ? 'text-neg' : 'text-ink'
  const texto = val === null ? '—' : isPct ? `${val.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : `R$ ${fmt(val)}`
  return (
    <div className="relative flex min-h-[74px] flex-col justify-center overflow-hidden rounded-xl border border-line bg-surface px-4 py-2.5">
      <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: GRAD_KPI }} />
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted">{lbl}</div>
      <div className={`mt-1 text-[20px] font-extrabold tnum ${cor}`}>{texto}</div>
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
.dre-mod .dre-scroller{overflow-x:auto}
.dre-mod table.dre{border-collapse:separate;border-spacing:0;width:100%;table-layout:fixed}
.dre-mod table.dre.mensal{min-width:1100px}
.dre-mod table.dre th,.dre-mod table.dre td{padding:7px 8px;text-align:right;white-space:nowrap;border-bottom:1px solid #F0EEEC;font-size:clamp(10px,0.9vw,13px);overflow:hidden}
.dre-mod table.dre thead th{position:sticky;top:0;z-index:3;background:#fff;color:#4B5563;font-size:11px;text-transform:uppercase;letter-spacing:.5px;font-weight:700;border-bottom:2px solid #E7E3DF}
.dre-mod table.dre th.rowlabel,.dre-mod table.dre td.rowlabel{text-align:left;position:sticky;left:0;z-index:2;background:#fff;width:38%;white-space:normal;word-break:break-word;line-height:1.2;font-weight:600;box-shadow:1px 0 0 #E7E3DF}
.dre-mod table.dre.mensal th.rowlabel,.dre-mod table.dre.mensal td.rowlabel{width:24%}
.dre-mod table.dre thead th.rowlabel{z-index:4}
.dre-mod table.dre th.col-total,.dre-mod table.dre td.col-total{background:rgb(var(--brand)/0.06);font-weight:800;border-left:1px solid rgb(var(--brand)/0.18)}
.dre-mod table.dre thead th.col-total{background:rgb(var(--brand)/0.14);color:rgb(var(--brand))}
.dre-mod td.num{color:#1F2937}.dre-mod td.num.neg{color:#C0392B}.dre-mod td.num.zero{color:#C7C2BC}
.dre-mod .op{display:inline-block;width:28px;color:#9aa0a6;font-weight:700}
.dre-mod .op.pos{color:#15734F}
/* Grupos de conta (clicáveis) */
.dre-mod tr.grupo{cursor:pointer}
.dre-mod tr.grupo.semdet{cursor:default}
.dre-mod tr.grupo td{font-weight:600}
.dre-mod tr.grupo:hover:not(.semdet) td{background:#FCFBFA}
.dre-mod tr.grupo td.rowlabel .caret{display:inline-block;width:14px;color:rgb(var(--brand));font-size:10px;transition:transform .15s}
.dre-mod tr.grupo.open td.rowlabel .caret{transform:rotate(90deg)}
/* Subgrupos (nível 2) */
.dre-mod tr.subgrupo{cursor:pointer}
.dre-mod tr.subgrupo td{background:#FFF8F3;font-weight:700;color:#8a5a3c;border-bottom:1px solid #F3E7DE}
.dre-mod tr.subgrupo td.rowlabel{background:#FFF8F3;padding-left:24px}
.dre-mod tr.subgrupo:hover td{background:#FEEFE4}
.dre-mod tr.subgrupo td.rowlabel .caret{display:inline-block;width:14px;color:rgb(var(--brand));font-size:10px;transition:transform .15s}
.dre-mod tr.subgrupo.open td.rowlabel .caret{transform:rotate(90deg)}
.dre-mod tr.detail td{background:#FBFAF9;color:#4B5563;font-size:clamp(9px,0.8vw,12px);border-bottom:1px solid #F3F1EF}
.dre-mod tr.detail td.rowlabel{background:#FBFAF9;padding-left:24px;font-weight:500;white-space:normal}
.dre-mod tr.detail.n2 td.rowlabel{padding-left:44px}
.dre-mod tr.detail td.rowlabel .cod{color:#9aa0a6;font-variant-numeric:tabular-nums;margin-right:6px;font-size:.92em}
/* Subtotais (Receita líquida, Lucro bruto) */
.dre-mod tr.sub td{background:#FFF1E8;font-weight:800;color:#9a4a24;border-top:1px solid #F6D9C9;border-bottom:1px solid #F6D9C9}
.dre-mod tr.sub td.rowlabel{background:#FFF1E8}
/* Resultados (EBIT, LAIR) e Resultado líquido (final) */
.dre-mod tr.result td{background:#F3F4F6;color:#0B2545;font-weight:800}
.dre-mod tr.result td.rowlabel{background:#F3F4F6}
.dre-mod tr.result.final td{background:#0B2545;color:#fff;font-size:clamp(11px,0.95vw,14px)}
.dre-mod tr.result.final td.rowlabel{background:#0B2545;color:#fff}
.dre-mod tr.result td.num.neg{color:#C0392B}
.dre-mod tr.result.final td.num.neg{color:#FF9B8A}
.dre-mod tr.result.final td.col-total{background:#0a1f3d;border-left:1px solid #24406a}
/* Segmented controls */
.dre-mod .seg{display:inline-flex;background:#EEEAE3;border-radius:9px;padding:3px;gap:2px}
.dre-mod .seg button{border:0;background:transparent;font:inherit;font-size:12px;font-weight:700;color:#7a756c;padding:5px 13px;border-radius:7px;cursor:pointer;white-space:nowrap}
.dre-mod .seg button.on{background:#fff;color:#1F2937;box-shadow:0 1px 2px rgba(0,0,0,.08)}
.dre-mod .periodo-sel{font:inherit;font-size:12px;font-weight:700;color:#1F2937;background:#fff;border:1px solid #E7E3DF;border-radius:7px;padding:4px 6px;cursor:pointer}
.dre-mod .periodo-sel:focus{outline:2px solid rgb(var(--brand));border-color:rgb(var(--brand))}
`}</style>
  )
}
