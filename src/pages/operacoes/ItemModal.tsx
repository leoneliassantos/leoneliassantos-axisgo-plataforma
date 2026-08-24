import { useMemo, useState } from 'react'
import { Modal, BtnPrimary, BtnGhost } from './Modal'
import { fmtBRfull, fmtBRL, fmtMesAno, hojeISO, daysBetween, statusClasse, ANO_MIN, ANO_MAX } from './helpers'
import { ProdutoFields, produtoToDraft, oficinaDraftToInput, logosDraftToInput, gradeErro, TIPOS_LOGO, type ProdutoDraft, type TabCad } from './ProdutoFields'
import {
  type Produto, type ProdutoPatch, type StatusProd, type LogoInput, type Cadastro, type Cadastros, type Grade,
  ETAPAS, etapaLabel, PRIO_LABEL, STATUS_LABEL, TAMANHOS, situacaoAutomatica, SITUACAO_REGRA,
} from './data'

const nomeDe = (list: Cadastro[], id: string | null) => (id ? list.find((c) => c.id === id)?.nome ?? '' : '')
/** Resumo estável da grade ("G:5 GG:3") para comparar e registrar mudanças. */
const gradeResumo = (g: Grade): string => {
  const parts = TAMANHOS.filter((t) => (g?.[t] ?? 0) > 0).map((t) => `${t}:${g[t]}`)
  return parts.length ? parts.join(' ') : '—'
}

export function ItemModal({
  produto,
  cadastros,
  saving,
  onSaveItem,
  onMover,
  onAddObs,
  onAddCadastro,
  onClose,
}: {
  produto: Produto
  cadastros: Cadastros
  saving: boolean
  onSaveItem: (patch: ProdutoPatch, logos: LogoInput[], logText: string) => void
  onMover: (para: string) => void
  onAddObs: (texto: string, data: string) => void
  onAddCadastro: (tabela: TabCad, nome: string) => Promise<Cadastro>
  onClose: () => void
}) {
  const [aba, setAba] = useState<'detalhes' | 'mov'>('detalhes')
  const [draft, setDraft] = useState<ProdutoDraft>(() => produtoToDraft(produto))
  const [responsavel, setResponsavel] = useState(produto.responsavel)
  const [sitSel, setSitSel] = useState<'auto' | StatusProd>(produto.situacaoAuto ? 'auto' : produto.situacaoManual)
  const [erro, setErro] = useState<string | null>(null)

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

  /** Compara os valores do formulário com o item salvo e descreve o que mudou. */
  function calcularMudancas(): string[] {
    const ch: string[] = []
    const prop = draft.numeroProposta.trim()
    const ped = draft.numeroPedido.trim()
    if (draft.uniformeId !== produto.uniformeId) ch.push(`Uniforme: "${produto.uniformeNome || '—'}" → "${nomeDe(cadastros.uniformes, draft.uniformeId) || '—'}"`)
    if (draft.corId !== produto.corId) ch.push(`Cor: "${produto.corNome || '—'}" → "${nomeDe(cadastros.cores, draft.corId) || '—'}"`)
    if (draft.tecidoId !== produto.tecidoId) ch.push(`Tecido: "${produto.tecidoNome || '—'}" → "${nomeDe(cadastros.tecidos, draft.tecidoId) || '—'}"`)
    if (prop !== (produto.numeroProposta || '')) ch.push(`Pedido de Compra Cliente: "${produto.numeroProposta || '—'}" → "${prop || '—'}"`)
    if (ped !== (produto.numeroPedido || '')) ch.push(`Nº Pedido: "${produto.numeroPedido || '—'}" → "${ped || '—'}"`)
    if (draft.vendedor.trim() !== (produto.vendedor || '')) ch.push(`Vendedor: "${produto.vendedor || '—'}" → "${draft.vendedor.trim() || '—'}"`)
    const qtd = Number(draft.qtd) || 0
    if (qtd !== produto.qtd) ch.push(`Quantidade: ${produto.qtd} → ${qtd}`)
    const vu = Number(draft.valorUnitario) || 0
    if (vu !== produto.valorUnitario) ch.push(`Valor unitário do item: ${fmtBRL(produto.valorUnitario)} → ${fmtBRL(vu)}`)
    if (draft.prioridade !== produto.prioridade) ch.push(`Prioridade: ${PRIO_LABEL[produto.prioridade]} → ${PRIO_LABEL[draft.prioridade]}`)
    const novaAuto = sitSel === 'auto'
    if (novaAuto !== produto.situacaoAuto || (!novaAuto && sitSel !== produto.situacaoManual)) {
      const antes = produto.situacaoAuto ? 'Automática' : STATUS_LABEL[produto.situacaoManual]
      const depois = novaAuto ? 'Automática' : STATUS_LABEL[sitSel]
      ch.push(`Situação: ${antes} → ${depois}`)
    }
    if (responsavel.trim() !== (produto.responsavel || '')) ch.push(`Responsável: "${produto.responsavel || '—'}" → "${responsavel.trim() || '—'}"`)
    if (draft.previsaoEntrega !== produto.previsaoEntrega) ch.push(`Previsão: ${fmtBRfull(produto.previsaoEntrega) || '—'} → ${fmtBRfull(draft.previsaoEntrega) || '—'}`)
    if (draft.evento !== produto.evento) ch.push(`Evento: ${produto.evento ? 'Sim' : 'Não'} → ${draft.evento ? 'Sim' : 'Não'}`)
    if (draft.amostra !== produto.amostra) ch.push(`Amostra: ${produto.amostra ? 'Sim' : 'Não'} → ${draft.amostra ? 'Sim' : 'Não'}`)
    if (draft.observacao.trim() !== (produto.observacao || '')) ch.push(`Observação do item: "${produto.observacao || '—'}" → "${draft.observacao.trim() || '—'}"`)
    if (gradeResumo(draft.grade) !== gradeResumo(produto.grade)) ch.push(`Grade de tamanhos: ${gradeResumo(produto.grade)} → ${gradeResumo(draft.grade)}`)
    const of = oficinaDraftToInput(draft)
    const ofNomeAntes = nomeDe(cadastros.fornecedores, produto.oficina.fornecedorId)
    if ((of.fornecedorId ?? null) !== (produto.oficina.fornecedorId ?? null)) ch.push(`Oficina: "${ofNomeAntes || '—'}" → "${nomeDe(cadastros.fornecedores, of.fornecedorId) || '—'}"`)
    if (of.mesFechamento !== produto.oficina.mesFechamento) ch.push(`Mês de fechamento (oficina): ${fmtMesAno(produto.oficina.mesFechamento) || '—'} → ${fmtMesAno(of.mesFechamento) || '—'}`)
    if (of.dataEnvio !== produto.oficina.dataEnvio) ch.push(`Data de envio (oficina): ${fmtBRfull(produto.oficina.dataEnvio) || '—'} → ${fmtBRfull(of.dataEnvio) || '—'}`)
    if (of.valorUnitario !== produto.oficina.valorUnitario) ch.push(`Valor unitário (oficina): ${fmtBRL(produto.oficina.valorUnitario)} → ${fmtBRL(of.valorUnitario)}`)
    for (const t of TIPOS_LOGO) {
      const old = produto.logos.find((l) => l.tipo === t)
      const dl = draft.logos[t]
      const novoAtivo = draft.temLogo && dl.ativo
      if (old && !novoAtivo) { ch.push(`Logomarca ${t} removida`); continue }
      if (!old && novoAtivo) { ch.push(`Logomarca ${t} adicionada${dl.fornecedorId ? ` (fornecedor: ${nomeDe(cadastros.fornecedores, dl.fornecedorId)})` : ''}`); continue }
      if (old && novoAtivo) {
        if ((old.fornecedorId ?? null) !== (dl.fornecedorId ?? null)) ch.push(`Fornecedor do ${t}: "${old.fornecedorNome || '—'}" → "${nomeDe(cadastros.fornecedores, dl.fornecedorId) || '—'}"`)
        if ((dl.mesFechamento || '') !== (old.mesFechamento || '')) ch.push(`Mês de fechamento ${t}: ${fmtMesAno(old.mesFechamento) || '—'} → ${fmtMesAno(dl.mesFechamento) || '—'}`)
        if ((dl.dataEnvio || '') !== (old.dataEnvio || '')) ch.push(`Data de envio ${t}: ${fmtBRfull(old.dataEnvio) || '—'} → ${fmtBRfull(dl.dataEnvio) || '—'}`)
        const oldVu = old.valorUnitario || 0, newVu = Number(dl.valorUnitario) || 0
        if (newVu !== oldVu) ch.push(`Valor unitário ${t}: ${fmtBRL(oldVu)} → ${fmtBRL(newVu)}`)
      }
    }
    return ch
  }

  function salvar() {
    setErro(null)
    const ge = gradeErro(draft)
    if (ge) { setErro(ge); return }
    const mudancas = calcularMudancas()
    if (mudancas.length === 0) { onClose(); return }
    const logos = logosDraftToInput(draft)
    const patch: ProdutoPatch = {
      uniformeId: draft.uniformeId, corId: draft.corId, tecidoId: draft.tecidoId,
      numeroProposta: draft.numeroProposta.trim(), numeroPedido: draft.numeroPedido.trim(), vendedor: draft.vendedor.trim(),
      qtd: Number(draft.qtd) || 0, valorUnitario: Number(draft.valorUnitario) || 0, prioridade: draft.prioridade, responsavel: responsavel.trim(), previsaoEntrega: draft.previsaoEntrega,
      situacaoAuto: sitSel === 'auto', situacaoManual: sitSel === 'auto' ? produto.situacaoManual : sitSel,
      evento: draft.evento, amostra: draft.amostra,
      observacao: draft.observacao.trim(), grade: draft.grade,
      oficina: oficinaDraftToInput(draft),
    }
    onSaveItem(patch, logos, mudancas.join('; '))
    setAba('mov') // mostra o log registrado
  }

  const lab = 'block text-[12px] font-medium text-muted mb-1'
  const inp = 'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-ink/40 focus:outline-none'

  return (
    <Modal
      title={produto.uniformeNome || 'Item'}
      subtitle={`Cor: ${produto.corNome || '—'}${produto.tecidoNome ? ` · Tecido: ${produto.tecidoNome}` : ''}${produto.numeroPedido ? ` · Pedido ${produto.numeroPedido}` : ''}`}
      width={720}
      onClose={onClose}
      footer={
        aba === 'detalhes' ? (
          <>
            <BtnGhost onClick={onClose} disabled={saving}>Fechar</BtnGhost>
            <BtnPrimary onClick={salvar} disabled={saving}>{saving ? 'Salvando…' : 'Salvar alterações'}</BtnPrimary>
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
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${aba === t ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
          >
            {t === 'detalhes' ? 'Detalhes' : 'Movimentação'}
          </button>
        ))}
      </div>

      {aba === 'detalhes' ? (
        <div>
          <div className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-muted">Cadastro do item</div>
          <ProdutoFields draft={draft} ativos={cadastros} opProposta={produto.numeroProposta} opPedido={produto.numeroPedido} opVendedor={produto.vendedor} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} onAddCadastro={onAddCadastro} />

          {/* Campos específicos do item em produção */}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <label className={lab}>Responsável</label>
              <input className={inp} value={responsavel} onChange={(e) => setResponsavel(e.target.value)} placeholder="Ex.: AL" />
            </div>
            <div>
              <label className={`${lab} inline-flex cursor-help items-center gap-1`} title={SITUACAO_REGRA}>Situação
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" className="text-muted/70" aria-hidden="true"><circle cx="12" cy="12" r="9" strokeWidth="1.7" /><path d="M12 11.5v4.5" strokeWidth="1.7" strokeLinecap="round" /><circle cx="12" cy="7.9" r="0.95" fill="currentColor" stroke="none" /></svg>
              </label>
              <select className={inp} value={sitSel} onChange={(e) => setSitSel(e.target.value as 'auto' | StatusProd)}>
                <option value="auto">Automático (pela data)</option>
                <option value="ok">No prazo</option><option value="atrasado">Atrasado</option>
                <option value="alerta">Alerta</option><option value="aguardando">Aguardando</option>
              </select>
              {sitSel === 'auto' && <span className="mt-1 block text-[11px] text-muted">Agora: <b>{STATUS_LABEL[situacaoAutomatica(draft.previsaoEntrega, produto.etapaId)]}</b></span>}
            </div>
            <div>
              <label className={lab}>Etapa atual</label>
              <select className={inp} value={produto.etapaId} onChange={(e) => { if (e.target.value !== produto.etapaId) onMover(e.target.value) }}>
                {ETAPAS.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
              </select>
            </div>
          </div>

          <p className="mt-3 text-[12px] text-muted">Toda alteração salva aqui é registrada na aba <b>Movimentação</b> (o quê, quando e por quem). Mudar a <b>etapa</b> pede a data de conclusão.</p>

          {erro && <p className="mt-3 rounded-lg bg-neg/10 px-3 py-2 text-sm font-medium text-neg">{erro}</p>}

          {/* Linha do tempo do item */}
          <div className="mt-5">
            <label className={lab}>Linha do tempo do item</label>
            <ol className="mt-1 space-y-1.5">
              {ETAPAS.map((e) => {
                const data = produto.datas[e.id]
                const atual = e.id === produto.etapaId
                return (
                  <li key={e.id} className="flex items-center gap-3 text-sm">
                    <span className={`grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${data ? 'bg-pos text-white' : atual ? 'bg-ink text-white' : 'bg-line text-muted'}`}>
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
              <input type="date" className={`${inp} sm:w-40`} value={obsData} min={`${ANO_MIN}-01-01`} max={`${ANO_MAX}-12-31`} onChange={(e) => setObsData(e.target.value)} />
              <input className={inp} value={obsTexto} onChange={(e) => setObsTexto(e.target.value)} placeholder="Ex.: aguardando tecido do fornecedor" />
              <BtnPrimary onClick={() => { if (obsTexto.trim()) { onAddObs(obsTexto.trim(), obsData); setObsTexto('') } }} disabled={saving || !obsTexto.trim()}>Adicionar</BtnPrimary>
            </div>
          </div>

          {/* Histórico */}
          <div className="mt-5">
            <label className={lab}>Histórico</label>
            {historicoOrd.length === 0 ? (
              <p className="text-sm text-muted">Sem movimentações ainda. Mover o item entre as etapas ou salvar alterações registra o histórico.</p>
            ) : (
              <ol className="relative space-y-3 border-l border-line pl-4">
                {historicoOrd.map((h, i) => (
                  <li key={h.id ?? i} className="relative">
                    <span className="absolute -left-[21px] top-1 size-2.5 rounded-full bg-ink" />
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="tnum text-[12px] font-semibold text-ink">{fmtBRfull(h.data)}</span>
                      {h.kind === 'mov' ? (
                        <span className="flex items-center gap-1.5 text-sm text-ink">
                          <span>{h.etapaDe ? etapaLabel(h.etapaDe) : ''} → <b>{h.etapaPara ? etapaLabel(h.etapaPara) : ''}</b></span>
                          {h.etapaDe && h.etapaPara && ETAPAS.findIndex((e) => e.id === h.etapaPara) < ETAPAS.findIndex((e) => e.id === h.etapaDe) && (
                            <span className="rounded bg-amber-500/12 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">retorno</span>
                          )}
                        </span>
                      ) : (
                        <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${statusClasse('alerta')}`}>Alteração</span>
                      )}
                      {h.usuario && <span className="text-[12px] text-muted">· por <b className="text-ink/80">{h.usuario}</b></span>}
                    </div>
                    {h.texto && <p className="mt-0.5 text-sm text-muted">{h.texto}</p>}
                  </li>
                ))}
              </ol>
            )}
          </div>
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
