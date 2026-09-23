import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { podeExcluirProducao } from '../../auth/types'
import { FiltrosToggle } from '../../components/FiltrosToggle'
import { fmtBR, statusClasse, prioCor, ANO_MIN, ANO_MAX } from './helpers'
import { loadPedidos, excluirPedido, reativarPedido, etapaLabel, ETAPAS, STATUS_LABEL, PRIO_LABEL, type Pedido, type StatusProd } from './data'

interface LinhaProduto {
  pedidoId: string
  produtoId: string
  cliente: string
  uniforme: string
  cor: string
  tecido: string
  qtd: number
  numeroPedido: string
  vendedor: string
  etapaId: string
  status: StatusProd
  prioridade: 'alta' | 'media' | 'baixa'
  previsao: string
  responsavel: string
  excluido: boolean
  excluidoEm: string
  excluidoPor: string
}

/** Valores distintos e não-vazios de um campo, ordenados alfabeticamente. */
function opcoesDistintas<T>(itens: T[], campo: (item: T) => string): string[] {
  const set = new Set(itens.map(campo).filter(Boolean))
  return [...set].sort((a, b) => a.localeCompare(b))
}

const SIT_EXCLUIDO = 'Excluído'
/** Opções do filtro combinado de situação — as 4 situações do item + "Excluído" (situação do pedido). */
const SITUACAO_OPCOES = [...Object.values(STATUS_LABEL), SIT_EXCLUIDO]
function situacaoLabel(l: LinhaProduto): string {
  return l.excluido ? SIT_EXCLUIDO : STATUS_LABEL[l.status]
}

export function OrdensProducao() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const podeExcluir = user ? podeExcluirProducao(user.role) : false
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [busca, setBusca] = useState('')
  const [filtroEtapa, setFiltroEtapa] = useState('')
  const [filtroSit, setFiltroSit] = useState<Set<string> | null>(null)
  const [filtroCliente, setFiltroCliente] = useState<Set<string> | null>(null)
  const [filtroVendedor, setFiltroVendedor] = useState<Set<string> | null>(null)
  const [previsaoDe, setPrevisaoDe] = useState('')
  const [previsaoAte, setPrevisaoAte] = useState('')
  const [excluindo, setExcluindo] = useState(false)
  const [filtrosAbertos, setFiltrosAbertos] = useState(true)

  const carregar = useCallback(async () => {
    setLoading(true); setErro(null)
    try { setPedidos(await loadPedidos({ incluirExcluidos: true })) }
    catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao carregar.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { carregar() }, [carregar])

  function abrirFluxo(pedidoId: string) {
    navigate(`/operacoes/fluxo-producao?op=${pedidoId}`)
  }

  function editarItem(e: React.MouseEvent, l: LinhaProduto) {
    e.stopPropagation()
    navigate(`/operacoes/fluxo-producao?op=${l.pedidoId}&item=${l.produtoId}`)
  }

  async function excluirOP(e: React.MouseEvent, l: LinhaProduto) {
    e.stopPropagation()
    if (!podeExcluir) return
    const ped = pedidos.find((p) => p.id === l.pedidoId)
    const n = ped?.produtos.length ?? 1
    const ok = window.confirm(`Excluir a Ordem de Produção de "${l.cliente || 'cliente'}"?\n\nIsso remove a OP e todos os seus ${n} ${n === 1 ? 'item' : 'itens'} do Fluxo de Produção. Ela continua aparecendo aqui em Ordens de Produção com a situação "Excluído", e pode ser reativada a qualquer momento.`)
    if (!ok) return
    setExcluindo(true)
    try { await excluirPedido(l.pedidoId, user?.nome || user?.email || null); await carregar() }
    catch (err) { alert('Não foi possível excluir a OP: ' + (err instanceof Error ? err.message : '')) }
    finally { setExcluindo(false) }
  }

  async function reativarOP(e: React.MouseEvent, l: LinhaProduto) {
    e.stopPropagation()
    if (!podeExcluir) return
    const ok = window.confirm(`Reativar a Ordem de Produção de "${l.cliente || 'cliente'}"?\n\nEla volta a aparecer normalmente no Fluxo de Produção.`)
    if (!ok) return
    setExcluindo(true)
    try { await reativarPedido(l.pedidoId); await carregar() }
    catch (err) { alert('Não foi possível reativar a OP: ' + (err instanceof Error ? err.message : '')) }
    finally { setExcluindo(false) }
  }

  const linhas = useMemo<LinhaProduto[]>(() => {
    const out: LinhaProduto[] = []
    for (const p of pedidos) for (const it of p.produtos) {
      out.push({
        pedidoId: p.id, produtoId: it.id, cliente: p.clienteNome, uniforme: it.uniformeNome, cor: it.corNome, tecido: it.tecidoNome, qtd: it.qtd,
        numeroPedido: it.numeroPedido || p.numeroProposta, vendedor: it.vendedor || p.vendedor, etapaId: it.etapaId, status: it.status,
        prioridade: it.prioridade, previsao: it.previsaoEntrega, responsavel: it.responsavel,
        excluido: p.excluido, excluidoEm: p.excluidoEm, excluidoPor: p.excluidoPor,
      })
    }
    return out
  }, [pedidos])

  const clientesOpcoes = useMemo(() => opcoesDistintas(linhas, (l) => l.cliente), [linhas])
  const vendedoresOpcoes = useMemo(() => opcoesDistintas(linhas, (l) => l.vendedor), [linhas])

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return linhas.filter((l) => {
      if (filtroEtapa && l.etapaId !== filtroEtapa) return false
      if (filtroSit && !filtroSit.has(situacaoLabel(l))) return false
      if (filtroCliente && !filtroCliente.has(l.cliente)) return false
      if (filtroVendedor && !filtroVendedor.has(l.vendedor)) return false
      if (previsaoDe && (!l.previsao || l.previsao < previsaoDe)) return false
      if (previsaoAte && (!l.previsao || l.previsao > previsaoAte)) return false
      if (t && ![l.cliente, l.uniforme, l.cor, l.tecido, l.numeroPedido].join(' ').toLowerCase().includes(t)) return false
      return true
    })
  }, [linhas, busca, filtroEtapa, filtroSit, filtroCliente, filtroVendedor, previsaoDe, previsaoAte])

  const temFiltro = !!(busca || filtroEtapa || filtroSit || filtroCliente || filtroVendedor || previsaoDe || previsaoAte)
  function limparFiltros() {
    setBusca(''); setFiltroEtapa(''); setFiltroSit(null); setFiltroCliente(null); setFiltroVendedor(null); setPrevisaoDe(''); setPrevisaoAte('')
  }

  if (loading) return <div className="py-20 text-center text-muted">Carregando…</div>
  if (erro) return <div className="mx-auto mt-10 max-w-lg rounded-xl border border-neg/30 bg-neg/5 p-5 text-center text-neg">{erro}</div>

  const th = 'sticky top-0 z-10 bg-paper px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted'
  const td = 'px-3 py-2.5 text-sm text-ink'

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted">Operações · Produção</div>
          <h1 className="mt-1 font-serif text-2xl font-semibold text-ink">Ordens de Produção</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted">{visiveis.length} itens</span>
          {!filtrosAbertos && <FiltrosToggle aberto={filtrosAbertos} onToggle={() => setFiltrosAbertos((v) => !v)} />}
        </div>
      </div>

      {filtrosAbertos && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"><circle cx="11" cy="11" r="7" strokeWidth="1.8" /><path d="M21 21l-4-4" strokeWidth="1.8" strokeLinecap="round" /></svg>
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente, uniforme, cor, pedido…" className="w-full rounded-lg border border-line bg-surface py-2 pl-9 pr-3 text-sm text-ink focus:border-ink/40 focus:outline-none" />
            </div>
            <select value={filtroEtapa} onChange={(e) => setFiltroEtapa(e.target.value)} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-ink/40 focus:outline-none">
              <option value="">Todas as etapas</option>
              {ETAPAS.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
            </select>
            <MultiSelect label="Situação" opcoes={SITUACAO_OPCOES} value={filtroSit} onChange={setFiltroSit} />
            {clientesOpcoes.length > 1 && <MultiSelect label="Cliente" opcoes={clientesOpcoes} value={filtroCliente} onChange={setFiltroCliente} busca />}
            {vendedoresOpcoes.length > 1 && <MultiSelect label="Vendedor" opcoes={vendedoresOpcoes} value={filtroVendedor} onChange={setFiltroVendedor} />}
            <FiltrosToggle aberto={filtrosAbertos} onToggle={() => setFiltrosAbertos((v) => !v)} />
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
            <div className="flex items-center gap-1.5">
              <span>Previsão de entrega:</span>
              <input type="date" value={previsaoDe} onChange={(e) => setPrevisaoDe(e.target.value)} min={`${ANO_MIN}-01-01`} max={`${ANO_MAX}-12-31`} className="rounded-lg border border-line bg-surface px-2.5 py-2 text-sm text-ink focus:border-ink/40 focus:outline-none" />
              <span>até</span>
              <input type="date" value={previsaoAte} onChange={(e) => setPrevisaoAte(e.target.value)} min={`${ANO_MIN}-01-01`} max={`${ANO_MAX}-12-31`} className="rounded-lg border border-line bg-surface px-2.5 py-2 text-sm text-ink focus:border-ink/40 focus:outline-none" />
            </div>
            {temFiltro && <button type="button" onClick={limparFiltros} className="font-medium text-ink hover:underline">Limpar filtros</button>}
          </div>
          <p className="mb-3 text-[12px] text-muted">Clique numa linha para abrir o fluxo do pedido, ou use o lápis para alterar todos os dados do item.</p>
        </>
      )}

      {visiveis.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-surface p-12 text-center text-muted">Nenhum item {temFiltro ? 'com esse filtro' : 'ainda'}.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>Cliente</th><th className={th}>Uniforme</th><th className={th}>Cor</th><th className={th}>Tecido</th>
                <th className={`${th} text-right`}>Qtd</th><th className={th}>Nº Pedido</th><th className={th}>Vendedor</th><th className={th}>Etapa atual</th>
                <th className={th}>Situação</th><th className={th}>Prioridade</th><th className={th}>Previsão</th><th className={th}>Resp.</th>
                <th className={`${th} text-right`}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((l, i) => (
                <tr
                  key={i}
                  onClick={l.excluido ? undefined : () => abrirFluxo(l.pedidoId)}
                  title={l.excluido ? `Excluído${l.excluidoEm ? ` em ${fmtBR(l.excluidoEm)}` : ''}${l.excluidoPor ? ` por ${l.excluidoPor}` : ''}` : 'Abrir o fluxo de produção deste pedido'}
                  className={`border-t border-line-2 ${l.excluido ? 'opacity-60' : 'cursor-pointer hover:bg-paper'}`}
                >
                  <td className={`${td} font-medium text-ink ${l.excluido ? '' : 'underline-offset-2 hover:underline'}`}>{l.cliente || '—'}</td>
                  <td className={td}>{l.uniforme}</td>
                  <td className={td}>{l.cor || '—'}</td>
                  <td className={td}>{l.tecido || '—'}</td>
                  <td className={`${td} tnum text-right`}>{l.qtd}</td>
                  <td className={`${td} text-muted`}>{l.numeroPedido || '—'}</td>
                  <td className={`${td} text-muted`}>{l.vendedor || '—'}</td>
                  <td className={td}>{etapaLabel(l.etapaId)}</td>
                  <td className={td}>
                    {l.excluido
                      ? <span className="rounded px-1.5 py-0.5 text-[11px] font-medium bg-ink/10 text-muted">{SIT_EXCLUIDO}</span>
                      : <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${statusClasse(l.status)}`}>{STATUS_LABEL[l.status]}</span>}
                  </td>
                  <td className={td}><span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: prioCor(l.prioridade) }} />{PRIO_LABEL[l.prioridade]}</span></td>
                  <td className={`${td} tnum text-muted`}>{fmtBR(l.previsao) || '—'}</td>
                  <td className={`${td} text-muted`}>{l.responsavel || '—'}</td>
                  <td className={`${td} text-right`}>
                    <div className="flex items-center justify-end gap-1">
                      {l.excluido ? (
                        podeExcluir && (
                          <button
                            type="button"
                            onClick={(e) => reativarOP(e, l)}
                            disabled={excluindo}
                            title="Reativar esta OP"
                            className="rounded-md p-1.5 text-muted transition hover:bg-pos/10 hover:text-pos disabled:opacity-50"
                            aria-label="Reativar OP"
                          >
                            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor"><path d="M4 11a8 8 0 1 1 2.4 5.7" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /><path d="M4 6v5h5" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          </button>
                        )
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={(e) => editarItem(e, l)}
                            title="Alterar os dados desta OP"
                            className="rounded-md p-1.5 text-muted transition hover:bg-ink/5 hover:text-ink"
                            aria-label="Alterar OP"
                          >
                            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor"><path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /><path d="M13.5 6.5l3 3" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          </button>
                          {podeExcluir && (
                            <button
                              type="button"
                              onClick={(e) => excluirOP(e, l)}
                              disabled={excluindo}
                              title="Excluir esta OP"
                              className="rounded-md p-1.5 text-muted transition hover:bg-neg/10 hover:text-neg disabled:opacity-50"
                              aria-label="Excluir OP"
                            >
                              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** Filtro combinado (checkboxes) — `value=null` significa "todas as opções". */
function MultiSelect({ label, opcoes, value, onChange, busca }: { label: string; opcoes: string[]; value: Set<string> | null; onChange: (s: Set<string> | null) => void; busca?: boolean }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const isAll = value === null
  const has = (c: string) => isAll || value!.has(c)
  const count = isAll ? opcoes.length : value!.size
  const vis = busca && q.trim() ? opcoes.filter((c) => c.toLowerCase().includes(q.trim().toLowerCase())) : opcoes
  function toggle(c: string) {
    const base = isAll ? new Set(opcoes) : new Set(value!)
    if (base.has(c)) base.delete(c); else base.add(c)
    onChange(base.size === opcoes.length ? null : base)
  }
  return (
    <div className="relative text-sm">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 font-medium text-ink transition hover:bg-paper">
        <span className="text-muted">{label}</span>
        <b>{isAll ? 'Todas' : `${count}/${opcoes.length}`}</b>
        <span className="text-[9px] text-muted">▼</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-10 z-50 max-h-[340px] w-56 overflow-hidden rounded-lg border border-line bg-white p-2 shadow-xl">
            <div className="mb-1 flex gap-2 border-b border-line pb-1.5">
              <button type="button" className="rounded px-2 py-0.5 text-[11px] font-semibold text-ink hover:bg-paper" onClick={() => onChange(null)}>Todas</button>
              <button type="button" className="rounded px-2 py-0.5 text-[11px] font-semibold text-muted hover:bg-paper" onClick={() => onChange(new Set())}>Nenhuma</button>
            </div>
            {busca && (
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" className="mb-1 w-full rounded border border-line px-2 py-1 text-[12px] outline-none focus:border-ink/40" />
            )}
            <div className="max-h-[264px] overflow-auto">
              {vis.map((c) => (
                <label key={c} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-paper">
                  <input type="checkbox" checked={has(c)} onChange={() => toggle(c)} className="accent-ink" />
                  <span className="truncate" title={c}>{c}</span>
                </label>
              ))}
              {!vis.length && <div className="px-1.5 py-2 text-[11px] text-muted">Nada encontrado.</div>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
