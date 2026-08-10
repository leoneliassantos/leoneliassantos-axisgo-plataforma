import { useCallback, useEffect, useMemo, useState } from 'react'
import { fmtBR, statusClasse, prioCor } from './helpers'
import { loadPedidos, etapaLabel, ETAPAS, STATUS_LABEL, PRIO_LABEL, type Pedido, type StatusProd } from './data'

interface LinhaProduto {
  pedidoId: string
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
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [busca, setBusca] = useState('')
  const [filtroEtapa, setFiltroEtapa] = useState('')
  const [filtroSit, setFiltroSit] = useState<StatusProd | ''>('')

  const carregar = useCallback(async () => {
    setLoading(true); setErro(null)
    try { setPedidos(await loadPedidos()) }
    catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao carregar.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const linhas = useMemo<LinhaProduto[]>(() => {
    const out: LinhaProduto[] = []
    for (const p of pedidos) for (const it of p.produtos) {
      out.push({
        pedidoId: p.id, cliente: p.clienteNome, uniforme: it.uniformeNome, cor: it.corNome, tecido: it.tecidoNome, qtd: it.qtd,
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
        <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-brand">Operações · Produção</div>
        <h1 className="mt-1 font-serif text-2xl font-semibold text-ink">Ordens de Produção</h1>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"><circle cx="11" cy="11" r="7" strokeWidth="1.8" /><path d="M21 21l-4-4" strokeWidth="1.8" strokeLinecap="round" /></svg>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente, uniforme, cor, pedido…" className="w-full rounded-lg border border-line bg-surface py-2 pl-9 pr-3 text-sm text-ink focus:border-brand focus:outline-none" />
        </div>
        <select value={filtroEtapa} onChange={(e) => setFiltroEtapa(e.target.value)} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none">
          <option value="">Todas as etapas</option>
          {ETAPAS.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
        </select>
        <select value={filtroSit} onChange={(e) => setFiltroSit(e.target.value as StatusProd | '')} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none">
          <option value="">Todas as situações</option>
          <option value="ok">No prazo</option><option value="atrasado">Atrasado</option>
          <option value="alerta">Alerta</option><option value="aguardando">Aguardando</option>
        </select>
        <span className="text-sm text-muted">{visiveis.length} itens</span>
      </div>

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
              </tr>
            </thead>
            <tbody>
              {visiveis.map((l, i) => (
                <tr key={i} className="border-t border-line-2 hover:bg-paper">
                  <td className={`${td} font-medium`}>{l.cliente || '—'}</td>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
