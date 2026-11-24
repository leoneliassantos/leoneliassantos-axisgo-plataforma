import { useCallback, useEffect, useMemo, useState } from 'react'
import { daysBetween, statusClasse } from './helpers'
import { loadPedidos, isProduzido, ETAPAS, ETAPA_COR, STATUS_LABEL, SITUACAO_REGRA, type Pedido, type StatusProd } from './data'

/* Textos de ajuda (tooltip ⓘ) de cada indicador — explicam o que está sendo medido. */
const DICA = {
  pedidosAtivos: 'Pedidos com pelo menos um item ainda em produção (etapas 1 até “Produção Finalizada”).',
  itensEmProd: 'Itens que ainda não saíram para entrega (da 1ª etapa até “Produção Finalizada”).',
  pecasEmProd: 'Soma das peças (quantidades) dos itens em produção. Um item pode ter várias peças pela grade de tamanhos.',
  atrasados: 'Itens com a previsão de entrega vencida que ainda NÃO chegaram à etapa “Produção Finalizada”. Ao mover o card para Produção Finalizada, o item é considerado pronto e deixa de contar como atraso.',
  leadMedio: 'Tempo médio de atravessamento da produção: média de dias entre a 1ª e a última etapa concluída dos itens. Considera só itens com pelo menos 2 etapas já concluídas.',
  pedidosProduzidos: 'Pedidos cujos itens já saíram para entrega ou foram entregues (100% produzidos).',
  itensProduzidos: 'Itens que já saíram para entrega ou foram entregues.',
  pecasProduzidas: 'Soma das peças dos itens já produzidos (saíram para entrega / entregues).',
  porEtapa: 'Quantos itens estão em cada uma das etapas da produção, do “Pedido de Venda” até “Entregue/Finalizado”.',
  porSituacao: SITUACAO_REGRA,
} as const

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

    // Atraso já respeita a regra nova (item em Produção Finalizada tem status 'ok').
    const atrasados = itens.filter((i) => i.status === 'atrasado').length
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
      <div className="mb-3 flex items-end justify-between">
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted">Operações · Produção</div>
          <h1 className="mt-0.5 font-serif text-2xl font-semibold text-ink">Acompanhamento</h1>
        </div>
        <button onClick={carregar} className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-medium text-muted hover:bg-paper">Atualizar</button>
      </div>

      {m.total === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-surface p-12 text-center text-muted">Sem dados ainda. Lance pedidos no Fluxo de Produção para ver os indicadores.</div>
      ) : (
        <>
          {/* ===== Faixa de KPIs — tudo numa visão só ===== */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
            <Kpi titulo="Pedidos ativos" valor={m.pedidosAtivos} info={DICA.pedidosAtivos} grupo="prod" />
            <Kpi titulo="Itens em produção" valor={m.emProdItens} info={DICA.itensEmProd} grupo="prod" />
            <Kpi titulo="Peças em produção" valor={m.pecasEmProd} info={DICA.pecasEmProd} grupo="prod" destaque="brand" />
            <Kpi titulo="Itens atrasados" valor={m.atrasados} info={DICA.atrasados} grupo="prod" destaque={m.atrasados > 0 ? 'neg' : undefined} />
            <Kpi titulo="Lead time médio" valor={m.leadMedio ? `${m.leadMedio}d` : '—'} info={DICA.leadMedio} grupo="prod" />
            <Kpi titulo="Pedidos produzidos" valor={m.pedidosProduzidos} info={DICA.pedidosProduzidos} grupo="feito" />
            <Kpi titulo="Itens produzidos" valor={m.prodItens} info={DICA.itensProduzidos} grupo="feito" />
            <Kpi titulo="Peças produzidas" valor={m.pecasProduzidas} info={DICA.pecasProduzidas} grupo="feito" destaque="pos" />
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-brand" /> Em produção · até “Produção Finalizada”</span>
            <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-pos" /> Produzidos · de “Saiu para Entrega” em diante</span>
          </div>

          {/* ===== Gráficos ===== */}
          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
            {/* Itens por etapa */}
            <div className="rounded-2xl border border-line bg-surface p-4 lg:col-span-2">
              <h2 className="mb-3 flex items-center font-serif text-base font-semibold text-ink">Itens por etapa<Info texto={DICA.porEtapa} /></h2>
              <div className="space-y-1.5">
                {m.porEtapa.map(({ etapa, n }) => (
                  <div key={etapa.id} className="flex items-center gap-3">
                    <span className="w-40 shrink-0 truncate text-[12px] text-muted">{etapa.label}</span>
                    <div className="h-3.5 flex-1 overflow-hidden rounded bg-paper">
                      <div className="h-full rounded" style={{ width: `${(n / m.maxEtapa) * 100}%`, background: ETAPA_COR[etapa.id], minWidth: n ? 6 : 0 }} />
                    </div>
                    <span className="tnum w-7 text-right text-[12px] font-semibold text-ink">{n}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Por situação */}
            <div className="flex flex-col rounded-2xl border border-line bg-surface p-4">
              <h2 className="mb-3 flex items-center font-serif text-base font-semibold text-ink">Por situação<Info texto={DICA.porSituacao} /></h2>
              <div className="space-y-2.5">
                {(Object.keys(m.porSit) as StatusProd[]).map((s) => {
                  const n = m.porSit[s]
                  const pct = m.total ? Math.round((n / m.total) * 100) : 0
                  return (
                    <div key={s}>
                      <div className="flex items-center justify-between text-sm">
                        <span className={`rounded px-1.5 py-0.5 text-[12px] font-medium ${statusClasse(s)}`}>{STATUS_LABEL[s]}</span>
                        <span className="tnum text-muted">{n} · {pct}%</span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-paper"><div className="h-full rounded-full bg-ink" style={{ width: `${pct}%` }} /></div>
                    </div>
                  )
                })}
              </div>
              <div className="mt-auto border-t border-line pt-3 text-[13px] text-muted">
                Produzidos: <b className="text-ink">{m.prodItens}</b> de <b className="text-ink">{m.total}</b> itens · <b className="text-ink">{m.pecasProduzidas}</b> peças
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/* Ícone ⓘ com tooltip nativo (mesmo padrão `title` usado no resto do módulo). */
function Info({ texto }: { texto: string }) {
  return (
    <span
      title={texto}
      aria-label={texto}
      className="ml-1.5 inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center rounded-full border border-line text-[10px] font-bold leading-none text-muted"
    >i</span>
  )
}

function Kpi({ titulo, valor, info, destaque, grupo }: {
  titulo: string; valor: number | string; info: string
  destaque?: 'neg' | 'pos' | 'brand'; grupo: 'prod' | 'feito'
}) {
  const cor = destaque === 'neg' ? 'text-neg' : destaque === 'pos' ? 'text-pos' : destaque === 'brand' ? 'text-brand' : 'text-ink'
  const topo = grupo === 'feito' ? 'before:bg-pos' : 'before:bg-brand'
  return (
    <div className={`relative overflow-hidden rounded-xl border border-line bg-surface p-3.5 shadow-card before:absolute before:inset-x-0 before:top-0 before:h-0.5 ${topo}`}>
      <div className="flex items-start justify-between gap-1">
        <div className="text-[11px] uppercase leading-tight tracking-wide text-muted">{titulo}</div>
        <Info texto={info} />
      </div>
      <div className={`mt-1 font-serif text-[1.7rem] font-semibold leading-none ${cor}`}>{valor}</div>
    </div>
  )
}
