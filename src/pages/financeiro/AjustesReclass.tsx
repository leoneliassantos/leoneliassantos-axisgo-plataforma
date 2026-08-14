import { Fragment, useMemo, useState } from 'react'
import { MESES, ordemGrupos, type GrupoDef, type ReclassLanc } from './razaoDre'

/* ================================================================== *
 *  Ajustes gerenciais — reclassificação de VALORES (de-para).
 *  Move parte do valor de uma conta de origem para outro grupo/subgrupo
 *  do DRE, por empresa e ano, numa grade (de-para × 12 meses). NÃO altera
 *  a base contábil: os ajustes entram como linhas sintéticas no DRE.
 *  Leitura: todo autenticado · Escrita: admin. Core reutilizável.
 * ================================================================== */

export interface ContaOpt {
  codigo: string
  nome: string
  valor: number // total (módulo) da conta na base — para o resumo/alerta
}
export interface EmpresaOpt {
  empresa: string
  apelido: string
}
export interface ReclassSaveRow {
  origem: string
  origem_nome: string
  grupo: string
  subgrupo: string
  mes: number
  valor: number
}

interface Linha {
  id: string
  origem: string
  origemNome: string
  grupo: string
  subgrupo: string
  vals: number[] // 12
}

const z12 = () => new Array(12).fill(0) as number[]
const sum = (a: number[]) => a.reduce((s, v) => s + v, 0)
const fmt = (v: number) => (Math.abs(v) < 0.5 ? '—' : Math.round(v).toLocaleString('pt-BR'))
const keyOf = (empresa: string, ano: number) => `${empresa}|${ano}`

/** Monta a grade (uma linha por de-para) a partir dos ajustes salvos. */
function baseline(entries: ReclassLanc[], empresa: string, ano: number): Linha[] {
  const m = new Map<string, Linha>()
  for (const e of entries) {
    if (e.empresa !== empresa || e.ano !== ano) continue
    const k = `${e.origem}|${e.grupo}|${e.subgrupo}`
    let l = m.get(k)
    if (!l) {
      l = { id: 'r:' + k, origem: e.origem, origemNome: e.origemNome || '', grupo: e.grupo, subgrupo: e.subgrupo, vals: z12() }
      m.set(k, l)
    }
    if (e.mes >= 1 && e.mes <= 12) l.vals[e.mes - 1] += e.valor
  }
  return [...m.values()].sort((a, b) => sum(b.vals) - sum(a.vals))
}

export function AjustesReclass({
  entries,
  contas,
  catalogo,
  subgruposPorGrupo,
  empresas,
  anos,
  onSalvar,
  onFechar,
  salvando,
  somenteLeitura,
}: {
  entries: ReclassLanc[]
  contas: ContaOpt[]
  catalogo: GrupoDef[]
  subgruposPorGrupo: Map<string, string[]>
  empresas: EmpresaOpt[]
  anos: number[]
  onSalvar: (empresa: string, ano: number, rows: ReclassSaveRow[]) => void
  onFechar: () => void
  salvando: boolean
  somenteLeitura?: boolean
}) {
  const [empresaSel, setEmpresaSel] = useState(() => empresas[0]?.empresa ?? '')
  const [anoSel, setAnoSel] = useState(() => anos[anos.length - 1] ?? new Date().getFullYear())
  // rascunhos por (empresa, ano) — preservam edições ao trocar de aba
  const [drafts, setDrafts] = useState<Record<string, Linha[]>>({})
  const [erro, setErro] = useState<string | null>(null)

  const gruposOrd = useMemo(() => ordemGrupos(catalogo), [catalogo])
  const nomeConta = useMemo(() => new Map(contas.map((c) => [c.codigo, c.nome])), [contas])
  const valorConta = useMemo(() => new Map(contas.map((c) => [c.codigo, c.valor])), [contas])

  const key = keyOf(empresaSel, anoSel)
  const base = useMemo(() => baseline(entries, empresaSel, anoSel), [entries, empresaSel, anoSel])
  const linhas = drafts[key] ?? base

  const dirty = useMemo(() => {
    const d = drafts[key]
    if (!d) return false
    const norm = (arr: Linha[]) =>
      JSON.stringify(arr.map((l) => ({ o: l.origem, g: l.grupo, s: l.subgrupo.trim(), v: l.vals })))
    return norm(d) !== norm(base)
  }, [drafts, key, base])

  function setLinhas(next: Linha[]) {
    setDrafts((d) => ({ ...d, [key]: next }))
  }
  function patch(id: string, p: Partial<Linha>) {
    setLinhas(linhas.map((l) => (l.id === id ? { ...l, ...p } : l)))
  }
  function setOrigem(id: string, codigo: string) {
    patch(id, { origem: codigo, origemNome: nomeConta.get(codigo) || '' })
  }
  function setCelula(id: string, mes: number, valor: number) {
    patch(id, { vals: (linhas.find((l) => l.id === id)?.vals ?? z12()).map((v, i) => (i === mes ? valor : v)) })
  }
  function addLinha() {
    setLinhas([...linhas, { id: 'n:' + linhas.length + ':' + Math.round(sum(linhas.flatMap((l) => l.vals))), origem: '', origemNome: '', grupo: gruposOrd[0]?.nome ?? '', subgrupo: '', vals: z12() }])
  }
  function removerLinha(id: string) {
    setLinhas(linhas.filter((l) => l.id !== id))
  }

  function salvar() {
    const comValor = linhas.filter((l) => sum(l.vals) !== 0)
    if (comValor.some((l) => !l.origem)) {
      setErro('Há valores lançados numa linha sem conta de origem.')
      return
    }
    if (comValor.some((l) => !l.grupo)) {
      setErro('Há valores lançados numa linha sem grupo de destino.')
      return
    }
    const rows: ReclassSaveRow[] = []
    for (const l of comValor) {
      l.vals.forEach((v, i) => {
        if (v) rows.push({ origem: l.origem, origem_nome: l.origemNome || nomeConta.get(l.origem) || '', grupo: l.grupo, subgrupo: l.subgrupo.trim(), mes: i + 1, valor: v })
      })
    }
    setErro(null)
    onSalvar(empresaSel, anoSel, rows)
  }

  // totais por mês
  const totMes = useMemo(() => {
    const t = z12()
    for (const l of linhas) l.vals.forEach((v, i) => (t[i] += v))
    return t
  }, [linhas])

  // resumo por conta de origem (auditoria: o que e quanto saiu de cada conta)
  const resumo = useMemo(() => {
    const m = new Map<string, { origem: string; nome: string; saiu: number; base: number }>()
    for (const l of linhas) {
      if (!l.origem) continue
      const e = m.get(l.origem) ?? { origem: l.origem, nome: l.origemNome || nomeConta.get(l.origem) || l.origem, saiu: 0, base: Math.abs(valorConta.get(l.origem) ?? 0) }
      e.saiu += sum(l.vals)
      m.set(l.origem, e)
    }
    return [...m.values()].filter((r) => r.saiu !== 0).sort((a, b) => b.saiu - a.saiu)
  }, [linhas, nomeConta, valorConta])

  const anosSel = useMemo(() => {
    const s = new Set<number>(anos)
    s.add(anoSel)
    return [...s].sort((a, b) => a - b)
  }, [anos, anoSel])

  // TODOS os subgrupos existentes no sistema (de qualquer grupo, vindos da base
  // do Razão + criados na plataforma). Ambiente de ajustes gerenciais = liberdade
  // total: qualquer subgrupo pode ser destino de qualquer grupo. Criar é em
  // "Reclassificar contas"; aqui só se SELECIONA.
  const todosSubgrupos = useMemo(() => {
    const s = new Set<string>()
    for (const arr of subgruposPorGrupo.values()) for (const sg of arr) if (sg) s.add(sg)
    return [...s].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [subgruposPorGrupo])
  function opcoesSub(atual: string): string[] {
    // preserva o valor já gravado mesmo se ainda não estiver na lista
    return atual && !todosSubgrupos.includes(atual) ? [...todosSubgrupos, atual] : todosSubgrupos
  }

  const apelidoSel = empresas.find((e) => e.empresa === empresaSel)?.apelido ?? 'empresa'

  return (
    <div className="rcl flex flex-col gap-3">
      <ScopedStyle />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-serif text-lg font-semibold text-ink">Ajustes gerenciais — reclassificação de valores</h3>
          <p className="text-[12.5px] text-muted">
            Tire parte do valor de uma <b>conta de origem</b> e leve para outro <b>grupo/subgrupo</b> do DRE. A base contábil não muda — o de-para fica auditável e reversível.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-bold text-ink hover:border-ink/30" onClick={onFechar} disabled={salvando}>
            {somenteLeitura ? 'Voltar' : 'Fechar'}
          </button>
          {!somenteLeitura && (
            <button className="rounded-lg bg-ink px-4 py-2 text-[13px] font-bold text-white shadow-brand hover:brightness-125 disabled:opacity-50" onClick={salvar} disabled={salvando || !dirty}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          )}
        </div>
      </div>

      {erro && <div className="rounded-lg border border-neg/30 bg-red-50 px-3 py-2 text-[13px] font-medium text-neg">{erro}</div>}

      {/* seletores empresa + ano */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="seg flex-wrap">
          {empresas.length === 0 && <span className="px-2 py-1 text-[12px] text-muted">Nenhuma empresa (suba um Razão antes).</span>}
          {empresas.map((e) => (
            <button key={e.empresa} className={empresaSel === e.empresa ? 'on' : ''} onClick={() => setEmpresaSel(e.empresa)} title={e.empresa}>
              {e.apelido}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 text-[12px] text-muted">
          <span className="text-[10px] font-bold uppercase tracking-wider">Ano</span>
          <select className="anosel" value={anoSel} onChange={(e) => setAnoSel(+e.target.value)}>
            {anosSel.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="rcltab tnum">
          <thead>
            <tr>
              <th className="l origem">Conta de origem</th>
              <th className="l destino">Destino (grupo · subgrupo)</th>
              {MESES.map((m) => <th key={m} className="r">{m}</th>)}
              <th className="r tot">Total</th>
              {!somenteLeitura && <th className="acao" />}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id}>
                <td className="origem">
                  {somenteLeitura ? (
                    <span className="nomero" title={l.origem}>{l.origemNome || l.origem || '—'}</span>
                  ) : (
                    <select className="selorig" value={l.origem} onChange={(e) => setOrigem(l.id, e.target.value)}>
                      <option value="">— escolha a conta —</option>
                      {contas.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} — {c.nome}</option>)}
                    </select>
                  )}
                </td>
                <td className="destino">
                  {somenteLeitura ? (
                    <span className="nomero">{l.grupo}{l.subgrupo ? ` · ${l.subgrupo}` : ''}</span>
                  ) : (
                    <div className="destwrap">
                      <select className="selgrp" value={l.grupo} onChange={(e) => patch(l.id, { grupo: e.target.value })}>
                        {gruposOrd.map((g) => <option key={g.nome} value={g.nome}>{g.nome}</option>)}
                      </select>
                      <select className="selgrp" value={l.subgrupo} onChange={(e) => patch(l.id, { subgrupo: e.target.value })}>
                        <option value="">— sem subgrupo —</option>
                        {opcoesSub(l.subgrupo).map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  )}
                </td>
                {l.vals.map((v, i) => (
                  <td key={i} className="r cel">
                    {somenteLeitura ? (
                      <span className={v ? '' : 'zero'}>{fmt(v)}</span>
                    ) : (
                      <input
                        className="valinp"
                        type="number"
                        min={0}
                        step={100}
                        value={v || ''}
                        placeholder="—"
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => setCelula(l.id, i, Math.max(0, Number(e.target.value) || 0))}
                      />
                    )}
                  </td>
                ))}
                <td className="r tot tnum">{fmt(sum(l.vals))}</td>
                {!somenteLeitura && (
                  <td className="acao">
                    <button className="del" title="Remover ajuste" onClick={() => removerLinha(l.id)}>✕</button>
                  </td>
                )}
              </tr>
            ))}
            {linhas.length === 0 && (
              <tr><td colSpan={16} className="vazio">Nenhum ajuste lançado para {apelidoSel} em {anoSel}.</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr className="totrow">
              <td className="origem" colSpan={2}>Total reclassificado</td>
              {totMes.map((v, i) => <td key={i} className="r tnum">{fmt(v)}</td>)}
              <td className="r tot tnum">{fmt(sum(totMes))}</td>
              {!somenteLeitura && <td className="acao" />}
            </tr>
          </tfoot>
        </table>
      </div>

      {!somenteLeitura && (
        <div className="flex flex-wrap items-center gap-3">
          <button className="rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-bold text-ink hover:bg-paper" onClick={addLinha}>
            + Adicionar ajuste
          </button>
          <p className="text-[12px] text-muted">
            Valores em reais, por mês. Salvar substitui os ajustes de <b>{apelidoSel} · {anoSel}</b>. A contrapartida reduz a conta de origem na sua posição original.
          </p>
        </div>
      )}

      {/* Resumo por conta de origem — o que e quanto saiu de cada conta */}
      {resumo.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="rcltab resumo">
            <thead>
              <tr>
                <th className="l">Conta de origem</th>
                <th className="r">Total na base</th>
                <th className="r">Saiu (reclass.)</th>
                <th className="r">Restante na conta</th>
              </tr>
            </thead>
            <tbody>
              {resumo.map((r) => {
                const restante = r.base - r.saiu
                const estouro = r.base > 0.5 && restante < -0.5
                return (
                  <Fragment key={r.origem}>
                    <tr className={estouro ? 'alerta' : ''}>
                      <td className="l"><span className="mono">{r.origem}</span> {r.nome}</td>
                      <td className="r tnum">{r.base > 0.5 ? fmt(r.base) : '—'}</td>
                      <td className="r tnum">{fmt(r.saiu)}</td>
                      <td className="r tnum">{r.base > 0.5 ? fmt(restante) : '—'}{estouro ? ' ⚠' : ''}</td>
                    </tr>
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ScopedStyle() {
  return (
    <style>{`
.rcl table.rcltab{border-collapse:separate;border-spacing:0;width:100%;min-width:1120px}
.rcl table.rcltab th,.rcl table.rcltab td{padding:6px 8px;border-bottom:1px solid #EEF2F7;font-size:12.5px;text-align:right;white-space:nowrap;vertical-align:middle}
.rcl table.rcltab th{position:sticky;top:0;background:#EEF3F9;color:#64748B;font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;font-weight:700;z-index:1}
.rcl table.rcltab th.l,.rcl table.rcltab td.l{text-align:left}
.rcl th.origem,.rcl td.origem{position:sticky;left:0;background:#fff;z-index:2;min-width:220px;text-align:left;box-shadow:1px 0 0 #DBE4EF}
.rcl thead th.origem{z-index:3;background:#EEF3F9}
.rcl th.destino,.rcl td.destino{text-align:left;min-width:260px}
.rcl td.tot,.rcl th.tot{background:rgb(18 34 56 / 0.05);font-weight:800;border-left:1px solid #DBE4EF}
.rcl thead th.tot{background:#E4ECF5;color:#122238}
.rcl .selorig,.rcl .selgrp{width:100%;font:inherit;font-size:12px;font-weight:600;color:#122238;background:#fff;border:1px solid #DBE4EF;border-radius:7px;padding:5px 7px;cursor:pointer}
.rcl .selorig:focus,.rcl .selgrp:focus{outline:2px solid #122238;border-color:#122238}
.rcl .destwrap{display:flex;flex-direction:column;gap:4px}
.rcl .subinp{width:100%;font:inherit;font-size:12px;color:#122238;background:#fff;border:1px solid #DBE4EF;border-radius:7px;padding:4px 7px}
.rcl .subinp:focus{outline:2px solid #122238;border-color:#122238}
.rcl .nomero{font-weight:600;color:#122238}
.rcl .valinp{width:76px;font:inherit;font-size:12.5px;text-align:right;color:#122238;background:#fff;border:1px solid #DBE4EF;border-radius:6px;padding:4px 6px;font-variant-numeric:tabular-nums}
.rcl .valinp:focus{outline:2px solid #122238;border-color:#122238;background:#F8FAFC}
.rcl .valinp::-webkit-outer-spin-button,.rcl .valinp::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.rcl .valinp{-moz-appearance:textfield}
.rcl td.cel .zero{color:#C7C2BC}
.rcl td.tnum,.rcl td.r{font-variant-numeric:tabular-nums;color:#1B1A16}
.rcl td.acao,.rcl th.acao{width:34px;text-align:center}
.rcl .del{border:0;background:transparent;color:#b9b3aa;font-size:13px;cursor:pointer;padding:2px 6px;border-radius:6px}
.rcl .del:hover{background:#FCEEE5;color:#C0392B}
.rcl tfoot tr.totrow td{background:#EEF3F9;color:#122238;font-weight:800;border-top:1px solid #DBE4EF;border-bottom:none}
.rcl tfoot tr.totrow td.origem{background:#EEF3F9}
.rcl td.vazio{text-align:center;color:#64748B;padding:24px}
.rcl .seg{display:inline-flex;background:#EEF3F9;border-radius:9px;padding:3px;gap:2px}
.rcl .seg button{border:0;background:transparent;font:inherit;font-size:12px;font-weight:700;color:#64748B;padding:5px 13px;border-radius:7px;cursor:pointer;white-space:nowrap}
.rcl .seg button.on{background:#fff;color:#1F2937;box-shadow:0 1px 2px rgba(0,0,0,.08)}
.rcl .anosel{font:inherit;font-size:12px;font-weight:700;color:#1F2937;background:#fff;border:1px solid #DBE4EF;border-radius:7px;padding:4px 8px;cursor:pointer}
.rcl .anosel:focus{outline:2px solid #122238;border-color:#122238}
.rcl table.resumo{min-width:520px}
.rcl table.resumo .mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11.5px;color:#6E6960}
.rcl table.resumo tr.alerta td{background:#FCEEE5;color:#9a3412;font-weight:700}
`}</style>
  )
}
