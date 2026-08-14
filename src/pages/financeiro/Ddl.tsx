import { useMemo, useState } from 'react'
import { MESES } from './razaoDre'

/* ================================================================== *
 *  DDL — Distribuição Desproporcional de Lucros (ambiente analítico)
 *  Lançamento MANUAL da antecipação de lucros dos sócios, por empresa e
 *  ano, numa grade sócio × mês. O total entra no DRE como a linha "DDL"
 *  (subgrupo Pessoal e Encargos). Leitura: todo autenticado · Escrita: admin.
 *  Componente reutilizável do Core.
 * ================================================================== */

export interface DdlEntry {
  empresa: string
  socio: string
  ano: number
  mes: number // 1..12
  valor: number
}
export interface EmpresaOpt {
  empresa: string
  apelido: string
}
interface Linha {
  id: string
  socio: string
  vals: number[] // 12
}

const z12 = () => new Array(12).fill(0) as number[]
const sum = (a: number[]) => a.reduce((s, v) => s + v, 0)
const fmt = (v: number) => (Math.abs(v) < 0.5 ? '—' : Math.round(v).toLocaleString('pt-BR'))
const keyOf = (empresa: string, ano: number) => `${empresa}|${ano}`

/** Monta a grade (uma linha por sócio, 12 meses) a partir dos lançamentos. */
function baseline(entries: DdlEntry[], empresa: string, ano: number): Linha[] {
  const m = new Map<string, Linha>()
  for (const e of entries) {
    if (e.empresa !== empresa || e.ano !== ano) continue
    let l = m.get(e.socio)
    if (!l) {
      l = { id: 's:' + e.socio, socio: e.socio, vals: z12() }
      m.set(e.socio, l)
    }
    if (e.mes >= 1 && e.mes <= 12) l.vals[e.mes - 1] += e.valor
  }
  return [...m.values()].sort((a, b) => sum(b.vals) - sum(a.vals))
}

export function Ddl({
  entries,
  empresas,
  anos,
  onSalvar,
  onFechar,
  salvando,
  somenteLeitura,
}: {
  entries: DdlEntry[]
  empresas: EmpresaOpt[]
  anos: number[]
  onSalvar: (empresa: string, ano: number, rows: { socio: string; mes: number; valor: number }[]) => void
  onFechar: () => void
  salvando: boolean
  somenteLeitura?: boolean
}) {
  const [empresaSel, setEmpresaSel] = useState(() => empresas[0]?.empresa ?? '')
  const [anoSel, setAnoSel] = useState(() => anos[anos.length - 1] ?? new Date().getFullYear())
  // rascunhos por (empresa, ano) — preservam edições ao trocar de aba dentro do modal
  const [drafts, setDrafts] = useState<Record<string, Linha[]>>({})
  const [erro, setErro] = useState<string | null>(null)

  const key = keyOf(empresaSel, anoSel)
  const base = useMemo(() => baseline(entries, empresaSel, anoSel), [entries, empresaSel, anoSel])
  const linhas = drafts[key] ?? base

  const dirty = useMemo(() => {
    const d = drafts[key]
    if (!d) return false
    return JSON.stringify(d.map((l) => ({ s: l.socio.trim(), v: l.vals }))) !==
      JSON.stringify(base.map((l) => ({ s: l.socio.trim(), v: l.vals })))
  }, [drafts, key, base])

  function setLinhas(next: Linha[]) {
    setDrafts((d) => ({ ...d, [key]: next }))
  }
  function setCelula(id: string, mes: number, valor: number) {
    setLinhas(linhas.map((l) => (l.id === id ? { ...l, vals: l.vals.map((v, i) => (i === mes ? valor : v)) } : l)))
  }
  function setSocio(id: string, socio: string) {
    setLinhas(linhas.map((l) => (l.id === id ? { ...l, socio } : l)))
  }
  function addSocio() {
    setLinhas([...linhas, { id: 'n:' + linhas.length + ':' + Math.round(sum(linhas.flatMap((l) => l.vals))), socio: '', vals: z12() }])
  }
  function removerSocio(id: string) {
    setLinhas(linhas.filter((l) => l.id !== id))
  }

  function salvar() {
    const nomes = linhas.map((l) => l.socio.trim().toLowerCase()).filter(Boolean)
    if (new Set(nomes).size !== nomes.length) {
      setErro('Há sócios com o mesmo nome. Use nomes distintos.')
      return
    }
    if (linhas.some((l) => !l.socio.trim() && sum(l.vals) !== 0)) {
      setErro('Há valores lançados numa linha sem nome de sócio.')
      return
    }
    const rows: { socio: string; mes: number; valor: number }[] = []
    for (const l of linhas) {
      const nome = l.socio.trim()
      if (!nome) continue
      l.vals.forEach((v, i) => { if (v) rows.push({ socio: nome, mes: i + 1, valor: v }) })
    }
    setErro(null)
    onSalvar(empresaSel, anoSel, rows)
  }

  // totais
  const totMes = useMemo(() => {
    const t = z12()
    for (const l of linhas) l.vals.forEach((v, i) => (t[i] += v))
    return t
  }, [linhas])
  const totalGeral = sum(totMes)

  const anosSel = useMemo(() => {
    const s = new Set<number>(anos)
    s.add(anoSel)
    return [...s].sort((a, b) => a - b)
  }, [anos, anoSel])

  return (
    <div className="ddl flex flex-col gap-3">
      <ScopedStyle />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-serif text-lg font-semibold text-ink">DDL — Antecipação de lucros dos sócios</h3>
          <p className="text-[12.5px] text-muted">
            Lance o quanto cada sócio retirou por mês. O total vira a linha <b>DDL</b> no DRE (Pessoal e Encargos), por empresa.
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
        <table className="ddltab tnum">
          <thead>
            <tr>
              <th className="l socio">Sócio</th>
              {MESES.map((m) => <th key={m} className="r">{m}</th>)}
              <th className="r tot">Total</th>
              {!somenteLeitura && <th className="acao" />}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id}>
                <td className="socio">
                  {somenteLeitura ? (
                    <span className="nomero">{l.socio || '—'}</span>
                  ) : (
                    <input className="nomeinp" value={l.socio} placeholder="Nome do sócio" onChange={(e) => setSocio(l.id, e.target.value)} />
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
                    <button className="del" title="Remover sócio" onClick={() => removerSocio(l.id)}>✕</button>
                  </td>
                )}
              </tr>
            ))}
            {linhas.length === 0 && (
              <tr><td colSpan={14} className="vazio">Nenhum sócio lançado para {empresas.find((e) => e.empresa === empresaSel)?.apelido ?? 'esta empresa'} em {anoSel}.</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr className="totrow">
              <td className="socio">Total DDL</td>
              {totMes.map((v, i) => <td key={i} className="r tnum">{fmt(v)}</td>)}
              <td className="r tot tnum">{fmt(totalGeral)}</td>
              {!somenteLeitura && <td className="acao" />}
            </tr>
          </tfoot>
        </table>
      </div>

      {!somenteLeitura && (
        <div className="flex flex-wrap items-center gap-3">
          <button className="rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-bold text-ink hover:bg-paper" onClick={addSocio}>
            + Adicionar sócio
          </button>
          <p className="text-[12px] text-muted">
            Valores em reais, sem centavos. Salvar substitui os lançamentos de <b>{empresas.find((e) => e.empresa === empresaSel)?.apelido ?? 'empresa'} · {anoSel}</b>.
          </p>
        </div>
      )}
    </div>
  )
}

function ScopedStyle() {
  return (
    <style>{`
.ddl table.ddltab{border-collapse:separate;border-spacing:0;width:100%;min-width:980px}
.ddl table.ddltab th,.ddl table.ddltab td{padding:6px 8px;border-bottom:1px solid #EEF2F7;font-size:12.5px;text-align:right;white-space:nowrap;vertical-align:middle}
.ddl table.ddltab th{position:sticky;top:0;background:#EEF3F9;color:#64748B;font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;font-weight:700;z-index:1}
.ddl table.ddltab th.l,.ddl table.ddltab td.l,.ddl td.socio,.ddl th.socio{text-align:left}
.ddl th.socio,.ddl td.socio{position:sticky;left:0;background:#fff;z-index:2;min-width:180px;box-shadow:1px 0 0 #DBE4EF}
.ddl thead th.socio{z-index:3;background:#EEF3F9}
.ddl td.tot,.ddl th.tot{background:rgb(18 34 56 / 0.05);font-weight:800;border-left:1px solid #DBE4EF}
.ddl thead th.tot{background:#E4ECF5;color:#122238}
.ddl .nomeinp{width:100%;font:inherit;font-size:12.5px;font-weight:600;color:#122238;background:#fff;border:1px solid #DBE4EF;border-radius:7px;padding:5px 7px}
.ddl .nomeinp:focus{outline:2px solid #122238;border-color:#122238}
.ddl .nomero{font-weight:600;color:#122238}
.ddl .valinp{width:76px;font:inherit;font-size:12.5px;text-align:right;color:#122238;background:#fff;border:1px solid #DBE4EF;border-radius:6px;padding:4px 6px;font-variant-numeric:tabular-nums}
.ddl .valinp:focus{outline:2px solid #122238;border-color:#122238;background:#F8FAFC}
.ddl .valinp::-webkit-outer-spin-button,.ddl .valinp::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.ddl .valinp{-moz-appearance:textfield}
.ddl td.cel .zero{color:#C7C2BC}
.ddl td.tnum,.ddl td.r{font-variant-numeric:tabular-nums;color:#1B1A16}
.ddl td.acao,.ddl th.acao{width:34px;text-align:center}
.ddl .del{border:0;background:transparent;color:#b9b3aa;font-size:13px;cursor:pointer;padding:2px 6px;border-radius:6px}
.ddl .del:hover{background:#FCEEE5;color:#C0392B}
.ddl tfoot tr.totrow td{background:#EEF3F9;color:#122238;font-weight:800;border-top:1px solid #DBE4EF;border-bottom:none}
.ddl tfoot tr.totrow td.socio{background:#EEF3F9}
.ddl td.vazio{text-align:center;color:#64748B;padding:24px}
.ddl .seg{display:inline-flex;background:#EEF3F9;border-radius:9px;padding:3px;gap:2px}
.ddl .seg button{border:0;background:transparent;font:inherit;font-size:12px;font-weight:700;color:#64748B;padding:5px 13px;border-radius:7px;cursor:pointer;white-space:nowrap}
.ddl .seg button.on{background:#fff;color:#1F2937;box-shadow:0 1px 2px rgba(0,0,0,.08)}
.ddl .anosel{font:inherit;font-size:12px;font-weight:700;color:#1F2937;background:#fff;border:1px solid #DBE4EF;border-radius:7px;padding:4px 8px;cursor:pointer}
.ddl .anosel:focus{outline:2px solid #122238;border-color:#122238}
`}</style>
  )
}
