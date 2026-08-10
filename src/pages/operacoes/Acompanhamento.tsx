import { useCallback, useEffect, useMemo, useState } from 'react'
import { daysBetween, statusClasse } from './helpers'
import { loadPedidos, isProduzido, ETAPAS, ETAPA_COR, STATUS_LABEL, type Pedido, type StatusProd } from './data'

export function Acompanhamento() {
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [pedidos, setPedidos] = useState<Pedido[]>([])

  const carregar = useCallback(async () => {
    setLoading(true); setErro(null)
    try { setPedidos(await loadPedidos()) }
    catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao carregar.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const m = useMemo(() => {
    const itens = pedidos.flatMap((p) => p.produtos)
    const total = itens.length
    // Em produção = até "Produção Finalizada". Produzido = "Saiu para Entrega" em diante.
    const emProd = itens.filter((i) => !isProduzido(i.etapaId))
    const prod = itens.filter((i) => isProduzido(i.etapaId))
    const soma = (arr: typeof itens) => arr.reduce((s, i) => s + (i.qtd || 0), 0)

    const atrasados = emProd.filter((i) => i.status === 'atrasado').length
    const pedidosAtivos = pedidos.filter((p) => p.produtos.some((i) => !isProduzido(i.etapaId))).length
    const pedidosProduzidos = pedidos.filter((p) => p.produtos.length > 0 && p.produtos.every((i) => isProduzido(i.etapaId))).length

    const porEtapa = ETAPAS.map((e) => ({ etapa: e, n: itens.filter((i) => i.etapaId === e.id).length }))
    const porSit: Record<StatusProd, number> = { ok: 0, atrasado: 0, alerta: 0, aguardando: 0 }
    for (const i of itens) porSit[i.status]++

    const leads: number[] = []
    for (const i of itens) {
      const ds = ETAPAS.map((e) => i.datas[e.id]).filter(Boolean).sort()
      if (ds.length >= 2) leads.push(daysBetween(ds[0], ds[ds.length - 1]))
    }
    const leadMedio = leads.length ? Math.round(leads.reduce((a, b) => a + b, 0) / leads.length) : 0
    const maxEtapa = Math.max(1, ...porEtapa.map((x) => x.n))

    return {
      total,
      emProdItens: emProd.length, pecasEmProd: soma(emProd),
      prodItens: prod.length, pecasProduzidas: soma(prod),
      atrasados, pedidosAtivos, pedidosProduzidos, porEtapa, porSit, leadMedio, maxEtapa,
    }
  }, [pedidos])

  if (loading) return <div className="py-20 text-center text-muted">Carregando…</div>
  if (erro) return <div className="mx-auto mt-10 max-w-lg rounded-xl border border-neg/30 bg-neg/5 p-5 text-center text-neg">{erro}</div>

  return (
    <div>
      <div className="mb-5">
        <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-brand">Operações · Produção</div>
        <h1 className="mt-1 font-serif text-2xl font-semibold text-ink">Acompanhamento</h1>
      </div>

      {m.total === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-surface p-12 text-center text-muted">Sem dados ainda. Lance pedidos no Fluxo de Produção para ver os indicadores.</div>
      ) : (
        <>
          {/* Em produção (até Produção Finalizada) */}
          <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">Em produção <span className="font-normal normal-case">· até “Produção Finalizada”</span></div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <Kpi titulo="Pedidos ativos" valor={m.pedidosAtivos} />
            <Kpi titulo="Itens em produção" valor={m.emProdItens} />
            <Kpi titulo="Peças em produção" valor={m.pecasEmProd} destaque="brand" />
            <Kpi titulo="Itens atrasados" valor={m.atrasados} destaque={m.atrasados > 0 ? 'neg' : undefined} />
            <Kpi titulo="Lead time médio" valor={m.leadMedio ? `${m.leadMedio} dias` : '—'} />
          </div>

          {/* Produzidos (Saiu para Entrega em diante) */}
          <div className="mb-2 mt-6 text-[12px] font-semibold uppercase tracking-wide text-muted">Produzidos <span className="font-normal normal-case">· de “Saiu para Entrega” em diante</span></div>
          <div className="grid grid-cols-3 gap-4">
            <Kpi titulo="Pedidos produzidos" valor={m.pedidosProduzidos} />
            <Kpi titulo="Itens produzidos" valor={m.prodItens} />
            <Kpi titulo="Peças produzidas" valor={m.pecasProduzidas} destaque="pos" />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Itens por etapa */}
            <div className="rounded-2xl border border-line bg-surface p-5 lg:col-span-2">
              <h2 className="mb-4 font-serif text-base font-semibold text-ink">Itens por etapa</h2>
              <div className="space-y-2.5">
                {m.porEtapa.map(({ etapa, n }) => (
                  <div key={etapa.id} className="flex items-center gap-3">
                    <span className="w-44 shrink-0 text-[13px] text-muted">{etapa.label}</span>
                    <div className="h-5 flex-1 overflow-hidden rounded bg-paper">
                      <div className="h-full rounded" style={{ width: `${(n / m.maxEtapa) * 100}%`, background: ETAPA_COR[etapa.id], minWidth: n ? 6 : 0 }} />
                    </div>
                    <span className="tnum w-8 text-right text-[13px] font-semibold text-ink">{n}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Por situação */}
            <div className="rounded-2xl border border-line bg-surface p-5">
              <h2 className="mb-4 font-serif text-base font-semibold text-ink">Por situação</h2>
              <div className="space-y-3">
                {(Object.keys(m.porSit) as StatusProd[]).map((s) => {
                  const n = m.porSit[s]
                  const pct = m.total ? Math.round((n / m.total) * 100) : 0
                  return (
                    <div key={s}>
                      <div className="flex items-center justify-between text-sm">
                        <span className={`rounded px-1.5 py-0.5 text-[12px] font-medium ${statusClasse(s)}`}>{STATUS_LABEL[s]}</span>
                        <span className="tnum text-muted">{n} · {pct}%</span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-paper"><div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} /></div>
                    </div>
                  )
                })}
              </div>
              <div className="mt-5 border-t border-line pt-3 text-sm text-muted">
                Produzidos: <b className="text-ink">{m.prodItens}</b> de <b className="text-ink">{m.total}</b> itens · <b className="text-ink">{m.pecasProduzidas}</b> peças
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Kpi({ titulo, valor, destaque }: { titulo: string; valor: number | string; destaque?: 'neg' | 'pos' | 'brand' }) {
  const cor = destaque === 'neg' ? 'text-neg' : destaque === 'pos' ? 'text-pos' : destaque === 'brand' ? 'text-brand' : 'text-ink'
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
      <div className="text-[12px] uppercase tracking-wide text-muted">{titulo}</div>
      <div className={`mt-1 font-serif text-3xl font-semibold ${cor}`}>{valor}</div>
    </div>
  )
}
