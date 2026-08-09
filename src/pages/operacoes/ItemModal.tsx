import { useMemo, useState } from 'react'
import { Modal, BtnPrimary, BtnGhost } from './Modal'
import { fmtBRfull, hojeISO, daysBetween, statusClasse } from './helpers'
import {
  type Produto, type ProdutoPatch, type Prioridade, type StatusProd,
  ETAPAS, etapaLabel, PRIO_LABEL, STATUS_LABEL,
} from './data'

export function ItemModal({
  produto,
  saving,
  onSaveDetalhes,
  onMover,
  onAddObs,
  onClose,
}: {
  produto: Produto
  saving: boolean
  onSaveDetalhes: (patch: ProdutoPatch) => void
  onMover: (para: string) => void
  onAddObs: (texto: string, data: string) => void
  onClose: () => void
}) {
  const [aba, setAba] = useState<'detalhes' | 'mov'>('detalhes')
  const [qtd, setQtd] = useState(String(produto.qtd))
  const [prioridade, setPrioridade] = useState<Prioridade>(produto.prioridade)
  const [status, setStatus] = useState<StatusProd>(produto.status)
  const [responsavel, setResponsavel] = useState(produto.responsavel)
  const [previsao, setPrevisao] = useState(produto.previsaoEntrega)

  const [obsData, setObsData] = useState(hojeISO())
  const [obsTexto, setObsTexto] = useState('')

  const indicadores = useMemo(() => {
    const concl = ETAPAS.map((e) => produto.datas[e.id]).filter(Boolean).sort()
    const lead = concl.length >= 2 ? daysBetween(concl[0], concl[concl.length - 1]) : 0
    return { concluidas: concl.length, lead }
  }, [produto.datas])

  const historicoOrd = useMemo(
    () => [...produto.historico].sort((a, b) => a.data.localeCompare(b.data)),
    [produto.historico],
  )

  const lab = 'block text-[12px] font-medium text-muted mb-1'
  const inp = 'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none'

  return (
    <Modal
      title={produto.uniformeNome || 'Item'}
      subtitle={`Cor: ${produto.corNome || '—'}${produto.numeroPedido ? ` · Pedido ${produto.numeroPedido}` : ''}`}
      width={680}
      onClose={onClose}
      footer={
        aba === 'detalhes' ? (
          <>
            <BtnGhost onClick={onClose} disabled={saving}>Fechar</BtnGhost>
            <BtnPrimary onClick={() => onSaveDetalhes({ qtd: Number(qtd) || 0, prioridade, status, responsavel, previsaoEntrega: previsao })} disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar'}
            </BtnPrimary>
          </>
        ) : (
          <BtnGhost onClick={onClose}>Fechar</BtnGhost>
        )
      }
    >
      {/* Abas */}
      <div className="mb-5 flex gap-1 rounded-lg bg-paper p-1">
        {(['detalhes', 'mov'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setAba(t)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${aba === t ? 'bg-surface text-brand shadow-sm' : 'text-muted hover:text-ink'}`}
          >
            {t === 'detalhes' ? 'Detalhes' : 'Movimentação'}
          </button>
        ))}
      </div>

      {aba === 'detalhes' ? (
        <div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div><label className={lab}>Quantidade (peças)</label><input type="number" min={0} className={inp} value={qtd} onChange={(e) => setQtd(e.target.value)} /></div>
            <div><label className={lab}>Responsável</label><input className={inp} value={responsavel} onChange={(e) => setResponsavel(e.target.value)} placeholder="Ex.: AL" /></div>
            <div><label className={lab}>Previsão de entrega</label><input type="date" className={inp} value={previsao} onChange={(e) => setPrevisao(e.target.value)} /></div>
            <div>
              <label className={lab}>Prioridade</label>
              <select className={inp} value={prioridade} onChange={(e) => setPrioridade(e.target.value as Prioridade)}>
                <option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option>
              </select>
            </div>
            <div>
              <label className={lab}>Situação</label>
              <select className={inp} value={status} onChange={(e) => setStatus(e.target.value as StatusProd)}>
                <option value="ok">No prazo</option><option value="atrasado">Atrasado</option>
                <option value="alerta">Alerta</option><option value="aguardando">Aguardando</option>
              </select>
            </div>
            <div>
              <label className={lab}>Etapa atual</label>
              <select className={inp} value={produto.etapaId} onChange={(e) => { if (e.target.value !== produto.etapaId) onMover(e.target.value) }}>
                {ETAPAS.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
              </select>
            </div>
          </div>

          {(produto.numeroProposta || produto.numeroPedido) && (
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
              {produto.numeroProposta && <span>Nº Proposta: <b className="text-ink">{produto.numeroProposta}</b></span>}
              {produto.numeroPedido && <span>Nº Pedido: <b className="text-ink">{produto.numeroPedido}</b></span>}
            </div>
          )}

          {produto.logos.length > 0 && (
            <div className="mt-4">
              <label className={lab}>Logomarca</label>
              <div className="flex flex-wrap gap-1.5">
                {produto.logos.map((l, i) => (
                  <span key={i} className="rounded-md bg-brand/10 px-2 py-1 text-[12px] font-medium text-brand">
                    {l.tipo}{l.fornecedorNome ? ` · ${l.fornecedorNome}` : ''}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Linha do tempo do item */}
          <div className="mt-6">
            <label className={lab}>Linha do tempo do item</label>
            <ol className="mt-1 space-y-1.5">
              {ETAPAS.map((e) => {
                const data = produto.datas[e.id]
                const atual = e.id === produto.etapaId
                return (
                  <li key={e.id} className="flex items-center gap-3 text-sm">
                    <span className={`grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${data ? 'bg-pos text-white' : atual ? 'bg-brand text-white' : 'bg-line text-muted'}`}>
                      {data ? '✓' : e.ordem}
                    </span>
                    <span className={`flex-1 ${atual ? 'font-semibold text-ink' : data ? 'text-ink' : 'text-muted'}`}>{e.label}{atual && ' (atual)'}</span>
                    <span className="tnum text-muted">{data ? fmtBRfull(data) : '—'}</span>
                  </li>
                )
              })}
            </ol>
          </div>
        </div>
      ) : (
        <div>
          {/* Indicadores */}
          <div className="grid grid-cols-3 gap-3">
            <Ind label="Etapas concluídas" valor={`${indicadores.concluidas} / ${ETAPAS.length}`} />
            <Ind label="Lead time" valor={indicadores.lead ? `${indicadores.lead} dias` : '—'} />
            <Ind label="Etapa atual" valor={etapaLabel(produto.etapaId)} />
          </div>

          {/* Adicionar observação */}
          <div className="mt-5 rounded-xl border border-line p-3">
            <label className={lab}>Adicionar observação</label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input type="date" className={`${inp} sm:w-40`} value={obsData} onChange={(e) => setObsData(e.target.value)} />
              <input className={inp} value={obsTexto} onChange={(e) => setObsTexto(e.target.value)} placeholder="Ex.: aguardando tecido do fornecedor" />
              <BtnPrimary onClick={() => { if (obsTexto.trim()) { onAddObs(obsTexto.trim(), obsData); setObsTexto('') } }} disabled={saving || !obsTexto.trim()}>Adicionar</BtnPrimary>
            </div>
          </div>

          {/* Histórico */}
          <div className="mt-5">
            <label className={lab}>Histórico</label>
            {historicoOrd.length === 0 ? (
              <p className="text-sm text-muted">Sem movimentações ainda. Mova o item entre as etapas para registrar o histórico.</p>
            ) : (
              <ol className="relative space-y-3 border-l border-line pl-4">
                {historicoOrd.map((h, i) => (
                  <li key={h.id ?? i} className="relative">
                    <span className="absolute -left-[21px] top-1 size-2.5 rounded-full bg-brand" />
                    <div className="flex items-center gap-2">
                      <span className="tnum text-[12px] font-semibold text-ink">{fmtBRfull(h.data)}</span>
                      {h.kind === 'mov' ? (
                        <span className="text-sm text-ink">{h.etapaDe ? etapaLabel(h.etapaDe) : ''} → <b>{h.etapaPara ? etapaLabel(h.etapaPara) : ''}</b></span>
                      ) : (
                        <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${statusClasse('alerta')}`}>Observação</span>
                      )}
                    </div>
                    {h.texto && <p className="mt-0.5 text-sm text-muted">{h.texto}</p>}
                  </li>
                ))}
              </ol>
            )}
          </div>

          <p className="mt-4 text-[12px] text-muted">Situação atual: <span className={`rounded px-1.5 py-0.5 font-medium ${statusClasse(produto.status)}`}>{STATUS_LABEL[produto.status]}</span> · Prioridade: <b className="text-ink">{PRIO_LABEL[produto.prioridade]}</b></p>
        </div>
      )}
    </Modal>
  )
}

function Ind({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="rounded-xl border border-line bg-paper px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 font-serif text-base font-semibold text-ink">{valor}</div>
    </div>
  )
}
