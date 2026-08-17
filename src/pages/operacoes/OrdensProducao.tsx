import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { fmtBR, statusClasse, prioCor } from './helpers'
import { loadPedidos, deletePedido, etapaLabel, ETAPAS, STATUS_LABEL, PRIO_LABEL, type Pedido, type StatusProd } from './data'

interface LinhaProduto {
  pedidoId: string
  produtoId: string
  cliente: string
  uniforme: string
  cor: string
  tecido: string
  qtd: number
  numeroPedido: string
  etapaId: string
  status: StatusProd
  prioridade: 'alta' | 'media' | 'baixa'
  previsao: string
  responsavel: string
}

export function OrdensProducao() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [busca, setBusca] = useState('')
  const [filtroEtapa, setFiltroEtapa] = useState('')
  const [filtroSit, setFiltroSit] = useState<StatusProd | ''>('')
  const [excluindo, setExcluindo] = useState(false)

  const carregar = useCallback(async () => {
    setLoading(true); setErro(null)
    try { setPedidos(await loadPedidos()) }
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
    if (!isAdmin) return
    const ped = pedidos.find((p) => p.id === l.pedidoId)
    const n = ped?.produtos.length ?? 1
    const ok = window.confirm(`Excluir a Ordem de Produção de "${l.cliente || 'cliente'}"?\n\nIsso remove a OP e todos os seus ${n} ${n === 1 ? 'item' : 'itens'}. Esta ação não pode ser desfeita.`)
    if (!ok) return
    setExcluindo(true)
    try { await deletePedido(l.pedidoId); await carregar() }
    catch (err) { alert('Não foi possível excluir a OP: ' + (err instanceof Error ? err.message : '')) }
    finally { setExcluindo(false) }
  }

  const linhas = useMemo<LinhaProduto[]>(() => {
    const out: LinhaProduto[] = []
    for (const p of pedidos) for (const it of p.produtos) {
      out.push({
        pedidoId: p.id, produtoId: it.id, cliente: p.clienteNome, uniforme: it.uniformeNome, cor: it.corNome, tecido: it.tecidoNome, qtd: it.qtd,
        numeroPedido: it.numeroPedido || p.numeroProposta, etapaId: it.etapaId, status: it.status,
        prioridade: it.prioridade, previsao: it.previsaoEntrega, responsavel: it.responsavel,
      })
    }
    return out
  }, [pedidos])

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return linhas.filter((l) => {
      if (filtroEtapa && l.etapaId !== filtroEtapa) return false
      if (filtroSit && l.status !== filtroSit) return false
      if (t && ![l.cliente, l.uniforme, l.cor, l.tecido, l.numeroPedido].join(' ').toLowerCase().includes(t)) return false
      return true
    })
  }, [linhas, busca, filtroEtapa, filtroSit])

  if (loading) return <div className="py-20 text-center text-muted">Carregando…</div>
  if (erro) return <div className="mx-auto mt-10 max-w-lg rounded-xl border border-neg/30 bg-neg/5 p-5 text-center text-neg">{erro}</div>

  const th = 'sticky top-0 z-10 bg-paper px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted'
  const td = 'px-3 py-2.5 text-sm text-ink'

  return (
    <div>
      <div className="mb-5">
        <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted">Operações · Produção</div>
        <h1 className="mt-1 font-serif text-2xl font-semibold text-ink">Ordens de Produção</h1>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"><circle cx="11" cy="11" r="7" strokeWidth="1.8" /><path d="M21 21l-4-4" strokeWidth="1.8" strokeLinecap="round" /></svg>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente, uniforme, cor, pedido…" className="w-full rounded-lg border border-line bg-surface py-2 pl-9 pr-3 text-sm text-ink focus:border-ink/40 focus:outline-none" />
        </div>
        <select value={filtroEtapa} onChange={(e) => setFiltroEtapa(e.target.value)} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-ink/40 focus:outline-none">
          <option value="">Todas as etapas</option>
          {ETAPAS.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
        </select>
        <select value={filtroSit} onChange={(e) => setFiltroSit(e.target.value as StatusProd | '')} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-ink/40 focus:outline-none">
          <option value="">Todas as situações</option>
          <option value="ok">No prazo</option><option value="atrasado">Atrasado</option>
          <option value="alerta">Alerta</option><option value="aguardando">Aguardando</option>
        </select>
        <span className="text-sm text-muted">{visiveis.length} itens</span>
      </div>
      <p className="mb-3 text-[12px] text-muted">Clique numa linha para abrir o fluxo do pedido, ou use o lápis para alterar todos os dados do item.</p>

      {visiveis.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-surface p-12 text-center text-muted">Nenhum item {busca || filtroEtapa || filtroSit ? 'com esse filtro' : 'ainda'}.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>Cliente</th><th className={th}>Uniforme</th><th className={th}>Cor</th><th className={th}>Tecido</th>
                <th className={`${th} text-right`}>Qtd</th><th className={th}>Nº Pedido</th><th className={th}>Etapa atual</th>
                <th className={th}>Situação</th><th className={th}>Prioridade</th><th className={th}>Previsão</th><th className={th}>Resp.</th>
                <th className={`${th} text-right`}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((l, i) => (
                <tr
                  key={i}
                  onClick={() => abrirFluxo(l.pedidoId)}
                  title="Abrir o fluxo de produção deste pedido"
                  className="cursor-pointer border-t border-line-2 hover:bg-paper"
                >
                  <td className={`${td} font-medium text-ink underline-offset-2 hover:underline`}>{l.cliente || '—'}</td>
                  <td className={td}>{l.uniforme}</td>
                  <td className={td}>{l.cor || '—'}</td>
                  <td className={td}>{l.tecido || '—'}</td>
                  <td className={`${td} tnum text-right`}>{l.qtd}</td>
                  <td className={`${td} text-muted`}>{l.numeroPedido || '—'}</td>
                  <td className={td}>{etapaLabel(l.etapaId)}</td>
                  <td className={td}><span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${statusClasse(l.status)}`}>{STATUS_LABEL[l.status]}</span></td>
                  <td className={td}><span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: prioCor(l.prioridade) }} />{PRIO_LABEL[l.prioridade]}</span></td>
                  <td className={`${td} tnum text-muted`}>{fmtBR(l.previsao) || '—'}</td>
                  <td className={`${td} text-muted`}>{l.responsavel || '—'}</td>
                  <td className={`${td} text-right`}>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={(e) => editarItem(e, l)}
                        title="Alterar os dados desta OP"
                        className="rounded-md p-1.5 text-muted transition hover:bg-ink/5 hover:text-ink"
                        aria-label="Alterar OP"
                      >
                        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor"><path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /><path d="M13.5 6.5l3 3" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </button>
                      {isAdmin && (
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
