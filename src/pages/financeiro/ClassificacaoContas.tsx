import { Fragment, useMemo, useRef, useState } from 'react'
import {
  montarCatalogo,
  ordemGrupos,
  papelLabel,
  PAPEIS,
  type Classificador,
  type GrupoDef,
  type Papel,
} from './razaoDre'

/* ================================================================== *
 *  Ambiente de reclassificação de contas (admin) — Core reutilizável.
 *  Define, por CÓDIGO de conta, o grupo (nível 1) e subgrupo (nível 2)
 *  do DRE. Permite criar novos grupos (com "papel") e subgrupos. Vale
 *  para todas as empresas (a classificação é por plano de contas).
 * ================================================================== */

export interface ContaUniverso {
  codigo: string
  nome: string
  valor: number
}
type Mapa = Record<string, { grupo: string; subgrupo: string }>

const fmt = (v: number) => (Math.abs(v) < 0.5 ? '—' : (v < 0 ? '(' : '') + Math.abs(Math.round(v)).toLocaleString('pt-BR') + (v < 0 ? ')' : ''))
const sanit = (s: string) => s.replace(/[^a-z0-9]+/gi, '-')

export function ClassificacaoContas({
  contas,
  classificarInicial,
  customIniciais,
  onSalvar,
  onFechar,
  salvando,
  somenteLeitura,
}: {
  contas: ContaUniverso[]
  classificarInicial: Classificador
  customIniciais: GrupoDef[]
  onSalvar: (mapa: Mapa, custom: GrupoDef[]) => void
  onFechar: () => void
  salvando: boolean
  somenteLeitura?: boolean
}) {
  const inicial = useRef<Mapa | null>(null)
  if (!inicial.current) {
    const m: Mapa = {}
    for (const c of contas) {
      const r = classificarInicial(c.codigo, c.nome)
      m[c.codigo] = { grupo: r.grupo, subgrupo: r.subgrupo }
    }
    inicial.current = m
  }
  const [mapa, setMapa] = useState<Mapa>(() => ({ ...inicial.current! }))
  const [custom, setCustom] = useState<GrupoDef[]>(customIniciais)
  const [busca, setBusca] = useState('')
  const [novoAberto, setNovoAberto] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [novoPapel, setNovoPapel] = useState<Papel>('despesa_op')
  const [erro, setErro] = useState<string | null>(null)

  const catalogo = useMemo(() => montarCatalogo(custom), [custom])
  const gruposOrd = useMemo(() => ordemGrupos(catalogo), [catalogo])
  const ordIndex = useMemo(() => new Map(gruposOrd.map((g, i) => [g.nome, i])), [gruposOrd])
  const papelDe = useMemo(() => new Map(catalogo.map((g) => [g.nome, g.papel])), [catalogo])

  // subgrupos existentes por grupo (para sugestão no datalist)
  const subsPorGrupo = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const c of contas) {
      const v = mapa[c.codigo]
      if (!v?.subgrupo) continue
      if (!m.has(v.grupo)) m.set(v.grupo, new Set())
      m.get(v.grupo)!.add(v.subgrupo)
    }
    return m
  }, [mapa, contas])

  const alteradas = useMemo(() => contas.filter((c) => {
    const a = inicial.current![c.codigo]
    const b = mapa[c.codigo]
    return a.grupo !== b.grupo || a.subgrupo !== b.subgrupo
  }).length, [mapa, contas])

  // ordem de exibição (congelada no mount): por grupo inicial (canônico) e valor desc
  const ordem = useMemo(() => {
    const arr = [...contas]
    arr.sort((a, b) => {
      const ga = ordIndex.get(inicial.current![a.codigo].grupo) ?? 99
      const gb = ordIndex.get(inicial.current![b.codigo].grupo) ?? 99
      if (ga !== gb) return ga - gb
      return b.valor - a.valor
    })
    return arr
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const termo = busca.trim().toLowerCase()
  const visiveis = termo ? ordem.filter((c) => c.codigo.toLowerCase().includes(termo) || c.nome.toLowerCase().includes(termo)) : ordem

  function setConta(codigo: string, patch: Partial<{ grupo: string; subgrupo: string }>) {
    setMapa((m) => ({ ...m, [codigo]: { ...m[codigo], ...patch } }))
  }
  function addGrupo() {
    const nome = novoNome.trim()
    if (!nome) { setErro('Dê um nome ao grupo.'); return }
    if (catalogo.some((g) => g.nome.toLowerCase() === nome.toLowerCase())) { setErro('Já existe um grupo com esse nome.'); return }
    setCustom((c) => [...c, { nome, papel: novoPapel }])
    setNovoNome('')
    setNovoAberto(false)
    setErro(null)
  }

  // separador de seção quando muda o grupo inicial na lista congelada
  let grupoAnterior = ''

  return (
    <div className="cls flex flex-col gap-3">
      <ScopedStyle />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-serif text-lg font-semibold text-ink">Reclassificação de contas</h3>
          <p className="text-[12.5px] text-muted">Defina o grupo (nível 1) e o subgrupo (nível 2) de cada conta. Vale para todas as empresas.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!somenteLeitura && (
            <button className="rounded-lg border border-brand/30 bg-brand/10 px-3 py-2 text-[13px] font-bold text-brand hover:bg-brand/20" onClick={() => setNovoAberto((v) => !v)} disabled={salvando}>
              + Novo grupo
            </button>
          )}
          <button className="rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-bold text-ink hover:border-brand" onClick={onFechar} disabled={salvando}>
            {somenteLeitura ? 'Voltar' : 'Cancelar'}
          </button>
          {!somenteLeitura && (
            <button className="rounded-lg bg-brand px-4 py-2 text-[13px] font-bold text-white shadow-brand hover:opacity-90 disabled:opacity-50" onClick={() => onSalvar(mapa, custom)} disabled={salvando || alteradas === 0}>
              {salvando ? 'Salvando…' : `Salvar${alteradas ? ` (${alteradas})` : ''}`}
            </button>
          )}
        </div>
      </div>

      {erro && <div className="rounded-lg border border-neg/30 bg-red-50 px-3 py-2 text-[13px] font-medium text-neg">{erro}</div>}

      {novoAberto && !somenteLeitura && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-brand/30 bg-brand/5 p-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Nome do grupo (nível 1)</span>
            <input className="w-64 rounded-lg border border-line bg-white px-3 py-2 text-[13px] outline-none focus:border-brand" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Ex.: Despesas Administrativas" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Tipo (onde entra no DRE)</span>
            <select className="w-72 rounded-lg border border-line bg-white px-3 py-2 text-[13px] outline-none focus:border-brand" value={novoPapel} onChange={(e) => setNovoPapel(e.target.value as Papel)}>
              {PAPEIS.map((p) => <option key={p.papel} value={p.papel}>{p.label}</option>)}
            </select>
          </label>
          <button className="rounded-lg bg-brand px-4 py-2 text-[13px] font-bold text-white hover:opacity-90" onClick={addGrupo}>Adicionar</button>
        </div>
      )}

      <input
        className="w-full max-w-sm rounded-lg border border-line bg-surface px-3 py-2 text-[13px] outline-none focus:border-brand"
        placeholder="🔎 Buscar por código ou nome da conta…"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />

      {/* datalists de subgrupos por grupo */}
      {[...subsPorGrupo.entries()].map(([g, set]) => (
        <datalist key={g} id={`sub-${sanit(g)}`}>
          {[...set].map((s) => <option key={s} value={s} />)}
        </datalist>
      ))}

      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="clstab">
          <thead>
            <tr>
              <th className="l" style={{ width: '120px' }}>Código</th>
              <th className="l">Conta</th>
              <th className="r" style={{ width: '110px' }}>Valor</th>
              <th className="l" style={{ width: '220px' }}>Grupo (nível 1)</th>
              <th className="l" style={{ width: '200px' }}>Subgrupo (nível 2)</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((c) => {
              const v = mapa[c.codigo]
              const ini = inicial.current![c.codigo]
              const changed = ini.grupo !== v.grupo || ini.subgrupo !== v.subgrupo
              const grupoInicial = ini.grupo
              const mostraSep = !termo && grupoInicial !== grupoAnterior
              grupoAnterior = grupoInicial
              const papel = papelDe.get(v.grupo)
              return (
                <Fragment key={c.codigo}>
                  {mostraSep && (
                    <tr className="sep">
                      <td colSpan={5}>{grupoInicial}{papelDe.get(grupoInicial) ? ` · ${papelLabel(papelDe.get(grupoInicial)!)}` : ''}</td>
                    </tr>
                  )}
                  <tr className={changed ? 'changed' : ''}>
                    <td className="cod mono">{c.codigo}</td>
                    <td className="nome">{c.nome}</td>
                    <td className="r tnum">{fmt(c.valor)}</td>
                    <td>
                      <select className="sel" value={v.grupo} disabled={somenteLeitura} onChange={(e) => setConta(c.codigo, { grupo: e.target.value })}>
                        {gruposOrd.map((g) => <option key={g.nome} value={g.nome}>{g.nome}</option>)}
                      </select>
                      {papel && <span className="papeltag">{papelLabel(papel).replace(/\s*\(.*\)/, '')}</span>}
                    </td>
                    <td>
                      <input
                        className="inp"
                        list={`sub-${sanit(v.grupo)}`}
                        value={v.subgrupo}
                        disabled={somenteLeitura}
                        placeholder="—"
                        onChange={(e) => setConta(c.codigo, { subgrupo: e.target.value })}
                      />
                    </td>
                  </tr>
                </Fragment>
              )
            })}
            {visiveis.length === 0 && (
              <tr><td colSpan={5} className="vazio">Nenhuma conta encontrada para “{busca}”.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[12px] text-muted">
        {contas.length} contas · {alteradas} alterada(s). O subgrupo é livre: digite um nome novo para criar, ou escolha um já usado.
      </p>
    </div>
  )
}

function ScopedStyle() {
  return (
    <style>{`
.cls table.clstab{border-collapse:separate;border-spacing:0;width:100%;min-width:820px}
.cls table.clstab th,.cls table.clstab td{padding:7px 12px;border-bottom:1px solid #F0EEEC;font-size:13px;text-align:left;vertical-align:middle}
.cls table.clstab th{position:sticky;top:0;background:#FAF8F5;color:#6E6960;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;font-weight:700;z-index:1}
.cls table.clstab th.r,.cls table.clstab td.r{text-align:right}
.cls .mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;color:#6E6960;white-space:nowrap}
.cls td.nome{font-weight:500;color:#1B1A16;line-height:1.2}
.cls td.tnum{font-variant-numeric:tabular-nums;color:#1B1A16;white-space:nowrap}
.cls tr.sep td{background:#FFF1E8;color:#9a4a24;font-weight:800;font-size:11px;text-transform:uppercase;letter-spacing:.5px;padding:6px 12px}
.cls tr.changed td{background:#FCEEE5}
.cls tr.changed td:first-child{box-shadow:inset 3px 0 0 rgb(var(--brand))}
.cls .sel{width:100%;font:inherit;font-size:12.5px;font-weight:600;color:#1B1A16;background:#fff;border:1px solid #E6E1DA;border-radius:7px;padding:5px 7px;cursor:pointer}
.cls .sel:focus{outline:2px solid rgb(var(--brand));border-color:rgb(var(--brand))}
.cls .sel:disabled{background:transparent;cursor:default}
.cls .inp{width:100%;font:inherit;font-size:12.5px;color:#1B1A16;background:#fff;border:1px solid #E6E1DA;border-radius:7px;padding:5px 7px}
.cls .inp:focus{outline:2px solid rgb(var(--brand));border-color:rgb(var(--brand))}
.cls .papeltag{display:inline-block;margin-top:3px;font-size:9.5px;color:#8a5a3c;background:#FFF3EA;border:1px solid #F3D9C6;border-radius:5px;padding:0 5px;font-weight:700}
.cls td.vazio{text-align:center;color:#6E6960;padding:26px}
`}</style>
  )
}
