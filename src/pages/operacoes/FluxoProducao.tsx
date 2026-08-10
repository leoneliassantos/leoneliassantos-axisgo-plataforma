import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NovaOP } from './NovaOP'
import { ItemModal } from './ItemModal'
import { Modal, BtnPrimary, BtnGhost } from './Modal'
import {
  resumoPedido, contagemPorEtapa, statusClasse, prioCor, fmtBR, hojeISO, itemFiltraTexto,
} from './helpers'
import {
  loadCadastros, loadPedidos, addCadastro, createPedido, updateProduto, moveProduto, addObservacao,
  isDemo, ETAPAS, ETAPA_COR, STATUS_LABEL, PRIO_LABEL,
  type Cadastros, type Pedido, type Produto, type ProdutoPatch, type NovoPedidoInput, type StatusProd,
} from './data'

const CADASTROS_VAZIO: Cadastros = { clientes: [], uniformes: [], cores: [], tecidos: [], fornecedores: [] }

interface MoveAlvo { produtoId: string; de: string; para: string }

export function FluxoProducao() {
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [cadastros, setCadastros] = useState<Cadastros>(CADASTROS_VAZIO)
  const [pedidos, setPedidos] = useState<Pedido[]>([])

  const [view, setView] = useState<'list' | 'board'>('list')
  const [orderId, setOrderId] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [filtroSit, setFiltroSit] = useState<StatusProd | ''>('')

  const [showNova, setShowNova] = useState(false)
  const [itemId, setItemId] = useState<string | null>(null)
  const [moveAlvo, setMoveAlvo] = useState<MoveAlvo | null>(null)
  const [saving, setSaving] = useState(false)
  const dragId = useRef<string | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    try {
      const [cad, peds] = await Promise.all([loadCadastros(), loadPedidos()])
      setCadastros(cad)
      setPedidos(peds)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao carregar os dados.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const refreshPedidos = useCallback(async () => { setPedidos(await loadPedidos()) }, [])

  const currentOrder = useMemo(() => pedidos.find((p) => p.id === orderId) ?? null, [pedidos, orderId])
  const itemAberto = useMemo<Produto | null>(() => {
    if (!itemId) return null
    for (const p of pedidos) { const it = p.produtos.find((x) => x.id === itemId); if (it) return it }
    return null
  }, [pedidos, itemId])

  /* ------------------------------ ações ------------------------------ */
  async function handleAddCadastro(tabela: 'clientes' | 'uniformes' | 'cores' | 'tecidos' | 'fornecedores', nome: string) {
    const c = await addCadastro(tabela, nome)
    setCadastros((prev) => ({ ...prev, [tabela]: [...prev[tabela], c].sort((a, b) => a.nome.localeCompare(b.nome)) }))
    return c
  }

  async function handleCreate(input: NovoPedidoInput) {
    setSaving(true)
    try {
      await createPedido(input, cadastros)
      await refreshPedidos()
      setShowNova(false)
    } catch (e) {
      alert('Não foi possível criar a OP: ' + (e instanceof Error ? e.message : ''))
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveDetalhes(patch: ProdutoPatch) {
    if (!itemId) return
    setSaving(true)
    try { await updateProduto(itemId, patch); await refreshPedidos() }
    catch (e) { alert('Não foi possível salvar: ' + (e instanceof Error ? e.message : '')) }
    finally { setSaving(false) }
  }

  async function handleConfirmMove(data: string, obs: string) {
    if (!moveAlvo) return
    setSaving(true)
    try { await moveProduto(moveAlvo.produtoId, moveAlvo.de, moveAlvo.para, data, obs); await refreshPedidos(); setMoveAlvo(null) }
    catch (e) { alert('Não foi possível mover o item: ' + (e instanceof Error ? e.message : '')) }
    finally { setSaving(false) }
  }

  async function handleAddObs(texto: string, data: string) {
    if (!itemId) return
    setSaving(true)
    try { await addObservacao(itemId, data, texto); await refreshPedidos() }
    catch (e) { alert('Não foi possível adicionar a observação: ' + (e instanceof Error ? e.message : '')) }
    finally { setSaving(false) }
  }

  function abrirBoard(id: string) { setOrderId(id); setView('board'); setBusca(''); setFiltroSit('') }
  function pedirMove(produtoId: string, de: string, para: string) {
    if (de === para) return
    setMoveAlvo({ produtoId, de, para })
  }

  /* ------------------------------ render ------------------------------ */
  if (loading) return <div className="py-20 text-center text-muted">Carregando…</div>
  if (erro) return (
    <div className="mx-auto mt-10 max-w-lg rounded-xl border border-neg/30 bg-neg/5 p-5 text-center">
      <p className="font-medium text-neg">{erro}</p>
      <p className="mt-1 text-sm text-muted">Verifique se os SQLs de Operações foram executados no Supabase.</p>
      <BtnGhost onClick={carregar}>Tentar de novo</BtnGhost>
    </div>
  )

  return (
    <div>
      {/* Cabeçalho */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-brand">Operações · Produção</div>
          <h1 className="mt-1 font-serif text-2xl font-semibold text-ink">Fluxo de Produção</h1>
        </div>
        <div className="flex items-center gap-2">
          {isDemo && <span className="rounded-full bg-amber-500/12 px-2.5 py-1 text-[11px] font-medium text-amber-700">Modo demonstração</span>}
          <BtnPrimary onClick={() => setShowNova(true)}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"><path d="M12 5v14M5 12h14" strokeWidth="2" strokeLinecap="round" /></svg>
            Nova OP
          </BtnPrimary>
        </div>
      </div>

      {view === 'list'
        ? <ListaPedidos pedidos={pedidos} busca={busca} setBusca={setBusca} filtroSit={filtroSit} setFiltroSit={setFiltroSit} onAbrir={abrirBoard} onNova={() => setShowNova(true)} />
        : currentOrder && <Quadro order={currentOrder} busca={busca} setBusca={setBusca} onVoltar={() => setView('list')} onAbrirItem={setItemId} dragId={dragId} onSoltar={pedirMove} />}

      {showNova && (
        <NovaOP cadastros={cadastros} saving={saving} onAddCadastro={handleAddCadastro} onCreate={handleCreate} onClose={() => setShowNova(false)} />
      )}
      {itemAberto && (
        <ItemModal produto={itemAberto} saving={saving} onSaveDetalhes={handleSaveDetalhes} onMover={(para) => pedirMove(itemAberto.id, itemAberto.etapaId, para)} onAddObs={handleAddObs} onClose={() => setItemId(null)} />
      )}
      {moveAlvo && (
        <MoveModal alvo={moveAlvo} saving={saving} onConfirm={handleConfirmMove} onClose={() => setMoveAlvo(null)} />
      )}
    </div>
  )
}

/* =========================== Lista de Pedidos =========================== */
function ListaPedidos({
  pedidos, busca, setBusca, filtroSit, setFiltroSit, onAbrir, onNova,
}: {
  pedidos: Pedido[]; busca: string; setBusca: (s: string) => void
  filtroSit: StatusProd | ''; setFiltroSit: (s: StatusProd | '') => void
  onAbrir: (id: string) => void; onNova: () => void
}) {
  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return pedidos.filter((p) => {
      const r = resumoPedido(p)
      if (filtroSit && r.situacao !== filtroSit) return false
      if (t) {
        const hay = [p.clienteNome, p.numeroProposta, ...p.produtos.map((i) => i.uniformeNome)].join(' ').toLowerCase()
        if (!hay.includes(t)) return false
      }
      return true
    })
  }, [pedidos, busca, filtroSit])

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"><circle cx="11" cy="11" r="7" strokeWidth="1.8" /><path d="M21 21l-4-4" strokeWidth="1.8" strokeLinecap="round" /></svg>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por cliente, pedido ou uniforme…" className="w-full rounded-lg border border-line bg-surface py-2 pl-9 pr-3 text-sm text-ink focus:border-brand focus:outline-none" />
        </div>
        <select value={filtroSit} onChange={(e) => setFiltroSit(e.target.value as StatusProd | '')} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none">
          <option value="">Todas as situações</option>
          <option value="ok">No prazo</option><option value="atrasado">Atrasado</option>
          <option value="alerta">Alerta</option><option value="aguardando">Aguardando</option>
        </select>
        <span className="text-sm text-muted">{visiveis.length} pedido{visiveis.length === 1 ? '' : 's'}</span>
      </div>

      {visiveis.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-surface p-12 text-center">
          <p className="text-muted">Nenhum pedido {busca || filtroSit ? 'encontrado com esse filtro' : 'ainda'}.</p>
          {!busca && !filtroSit && <div className="mt-3"><BtnPrimary onClick={onNova}>Lançar o primeiro pedido</BtnPrimary></div>}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {visiveis.map((p) => <LinhaPedido key={p.id} ped={p} onAbrir={onAbrir} />)}
        </div>
      )}
    </div>
  )
}

function LinhaPedido({ ped, onAbrir }: { ped: Pedido; onAbrir: (id: string) => void }) {
  const r = resumoPedido(ped)
  const cont = contagemPorEtapa(ped)
  const sitTxt = r.situacao === 'atrasado' ? `${r.atrasados} atrasado(s)` : r.situacao === 'aguardando' ? `${r.aguardando} aguardando` : r.situacao === 'alerta' ? `${r.alertas} em alerta` : 'No prazo'
  return (
    <button onClick={() => onAbrir(ped.id)} className="group grid grid-cols-1 items-center gap-3 rounded-xl border border-line bg-surface p-4 text-left transition hover:border-brand/40 hover:shadow-card md:grid-cols-[1.4fr_2fr_1fr]">
      <div>
        <div className="flex items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-full" style={{ background: prioCor(r.prioridade) }} title={`Prioridade: ${PRIO_LABEL[r.prioridade]}`} />
          <span className="font-medium text-ink">{ped.clienteNome || '—'}</span>
        </div>
        <div className="mt-0.5 text-[13px] text-muted">
          {ped.numeroProposta && <>Pedido <b className="text-ink/80">{ped.numeroProposta}</b> · </>}
          {fmtBR(ped.dataPedido)} · <b className="text-ink/80">{r.total}</b> itens · {r.entregues}/{r.total} entregues
        </div>
      </div>

      {/* mini-mapa das 10 etapas */}
      <div className="flex items-center gap-1">
        {ETAPAS.map((e) => {
          const n = cont[e.id] ?? 0
          return (
            <span key={e.id} title={`${e.label}: ${n}`} className="grid h-6 flex-1 place-items-center rounded text-[11px] font-semibold tnum" style={{ background: n ? `${ETAPA_COR[e.id]}22` : '#f1f4f7', color: n ? ETAPA_COR[e.id] : '#c2cbd4' }}>
              {n || ''}
            </span>
          )
        })}
      </div>

      <div className="flex items-center justify-end gap-3">
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${statusClasse(r.situacao)}`}>{sitTxt}</span>
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-20 overflow-hidden rounded-full bg-line"><span className="block h-full rounded-full bg-brand" style={{ width: `${r.progresso}%` }} /></span>
          <span className="tnum w-9 text-right text-[12px] text-muted">{r.progresso}%</span>
        </div>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" className="text-muted transition group-hover:translate-x-0.5 group-hover:text-brand"><path d="M9 6l6 6-6 6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </div>
    </button>
  )
}

/* =========================== Quadro (Kanban do pedido) =========================== */
function Quadro({
  order, busca, setBusca, onVoltar, onAbrirItem, dragId, onSoltar,
}: {
  order: Pedido; busca: string; setBusca: (s: string) => void
  onVoltar: () => void; onAbrirItem: (id: string) => void
  dragId: React.MutableRefObject<string | null>; onSoltar: (produtoId: string, de: string, para: string) => void
}) {
  const r = resumoPedido(order)
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <BtnGhost onClick={onVoltar}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"><path d="M15 6l-6 6 6 6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Voltar aos pedidos
          </BtnGhost>
          <div>
            <div className="font-serif text-lg font-semibold text-ink">{order.clienteNome}</div>
            <div className="text-[13px] text-muted">{order.numeroProposta && <>Pedido {order.numeroProposta} · </>}{r.total} itens · {r.entregues} entregues · {r.progresso}%</div>
          </div>
        </div>
        <div className="relative min-w-[220px]">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"><circle cx="11" cy="11" r="7" strokeWidth="1.8" /><path d="M21 21l-4-4" strokeWidth="1.8" strokeLinecap="round" /></svg>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Filtrar itens…" className="w-full rounded-lg border border-line bg-surface py-2 pl-9 pr-3 text-sm text-ink focus:border-brand focus:outline-none" />
        </div>
      </div>

      <div className="overflow-x-auto pb-3">
        <div className="flex gap-3" style={{ minWidth: 'min-content' }}>
          {ETAPAS.map((e) => {
            const itens = order.produtos.filter((it) => it.etapaId === e.id && itemFiltraTexto(it, busca))
            return (
              <div
                key={e.id}
                onDragOver={(ev) => ev.preventDefault()}
                onDrop={() => { if (dragId.current) { const id = dragId.current; const it = order.produtos.find((x) => x.id === id); if (it) onSoltar(id, it.etapaId, e.id); dragId.current = null } }}
                className="flex w-64 shrink-0 flex-col rounded-xl bg-paper"
              >
                <div className="flex items-center justify-between rounded-t-xl px-3 py-2" style={{ background: `${ETAPA_COR[e.id]}18` }}>
                  <span className="text-[13px] font-semibold" style={{ color: ETAPA_COR[e.id] }}>{e.label}</span>
                  <span className="tnum rounded-full bg-surface px-1.5 text-[11px] font-semibold text-muted">{itens.length}</span>
                </div>
                <div className="flex min-h-[80px] flex-col gap-2 p-2">
                  {itens.map((it) => <CardItem key={it.id} it={it} onAbrir={onAbrirItem} dragId={dragId} />)}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function CardItem({ it, onAbrir, dragId }: { it: Produto; onAbrir: (id: string) => void; dragId: React.MutableRefObject<string | null> }) {
  return (
    <div
      draggable
      onDragStart={() => { dragId.current = it.id }}
      onDragEnd={() => { dragId.current = null }}
      onClick={() => onAbrir(it.id)}
      className="cursor-pointer rounded-lg border border-line bg-surface p-2.5 shadow-sm transition hover:border-brand/40 hover:shadow-card"
      style={{ borderLeft: `3px solid ${it.status === 'atrasado' ? '#e5484d' : it.status === 'alerta' ? '#f2a020' : it.status === 'aguardando' ? '#5f7180' : '#1f9d6b'}` }}
    >
      <div className="flex items-center justify-between">
        <span className="size-2 rounded-full" style={{ background: prioCor(it.prioridade) }} title={`Prioridade: ${PRIO_LABEL[it.prioridade]}`} />
        <span className="tnum rounded bg-paper px-1.5 py-0.5 text-[10px] font-semibold text-muted">{it.qtd} pçs</span>
      </div>
      <div className="mt-1 text-sm font-medium leading-tight text-ink">{it.uniformeNome}</div>
      <div className="text-[12px] text-muted">Cor: <b className="text-ink/80">{it.corNome || '—'}</b>{it.tecidoNome ? <> · {it.tecidoNome}</> : null}</div>
      {it.logos.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {it.logos.map((l, i) => <span key={i} className="rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand">{l.tipo}</span>)}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between">
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${statusClasse(it.status)}`}>{STATUS_LABEL[it.status]}</span>
        {it.previsaoEntrega && <span className="tnum text-[11px] text-muted">{fmtBR(it.previsaoEntrega)}</span>}
      </div>
    </div>
  )
}

/* =========================== Modal: concluir etapa =========================== */
function MoveModal({ alvo, saving, onConfirm, onClose }: { alvo: MoveAlvo; saving: boolean; onConfirm: (data: string, obs: string) => void; onClose: () => void }) {
  const [data, setData] = useState(hojeISO())
  const [obs, setObs] = useState('')
  const de = ETAPAS.find((e) => e.id === alvo.de)?.label ?? alvo.de
  const para = ETAPAS.find((e) => e.id === alvo.para)?.label ?? alvo.para
  const inp = 'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none'
  return (
    <Modal title="Concluir etapa" subtitle={`${de} → ${para}`} width={440} onClose={onClose}
      footer={<><BtnGhost onClick={onClose} disabled={saving}>Cancelar</BtnGhost><BtnPrimary onClick={() => onConfirm(data, obs.trim())} disabled={saving}>{saving ? 'Movendo…' : 'Confirmar'}</BtnPrimary></>}>
      <label className="block text-[12px] font-medium text-muted mb-1">Data de conclusão de “{de}”</label>
      <input type="date" className={inp} value={data} onChange={(e) => setData(e.target.value)} />
      <label className="mt-3 block text-[12px] font-medium text-muted mb-1">Observação (opcional)</label>
      <input className={inp} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: enviado para a oficina" />
    </Modal>
  )
}
