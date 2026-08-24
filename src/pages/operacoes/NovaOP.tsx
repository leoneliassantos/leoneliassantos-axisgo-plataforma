import { useState } from 'react'
import { Modal, BtnPrimary, BtnGhost } from './Modal'
import { Combobox } from './Combobox'
import { hojeISO, ANO_MIN, ANO_MAX } from './helpers'
import { ProdutoFields, FlagSimNao, novaLinha, draftToInput, gradeErro, type ProdutoDraft, type TabCad } from './ProdutoFields'
import { type Cadastro, type Cadastros, type NovoPedidoInput, type Prioridade, PRIO_LABEL } from './data'

export function NovaOP({
  cadastros,
  saving,
  onAddCadastro,
  onCreate,
  onClose,
}: {
  cadastros: Cadastros
  saving: boolean
  onAddCadastro: (tabela: TabCad, nome: string) => Promise<Cadastro>
  onCreate: (input: NovoPedidoInput) => void
  onClose: () => void
}) {
  const [clienteId, setClienteId] = useState<string | null>(null)
  const [numeroProposta, setNumeroProposta] = useState('')
  const [numeroPedido, setNumeroPedido] = useState('')
  const [dataPedido, setDataPedido] = useState(hojeISO())
  const [prioridade, setPrioridade] = useState<Prioridade>('media')
  const [evento, setEvento] = useState(false)
  const [amostra, setAmostra] = useState(false)
  const [dataEntrega, setDataEntrega] = useState('')
  const [vendedor, setVendedor] = useState('')
  const [observacao, setObservacao] = useState('')
  const [produtos, setProdutos] = useState<ProdutoDraft[]>([novaLinha()])
  const [erro, setErro] = useState<string | null>(null)

  // Evento marcado como "Sim" força a prioridade do pedido para Alta.
  function setEventoFlag(v: boolean) {
    setEvento(v)
    if (v) setPrioridade('alta')
  }

  // No lançamento só aparecem cadastros ATIVOS (bloqueados ficam de fora).
  const ativos: Cadastros = {
    clientes: cadastros.clientes.filter((c) => !c.bloqueado),
    uniformes: cadastros.uniformes.filter((c) => !c.bloqueado),
    cores: cadastros.cores.filter((c) => !c.bloqueado),
    tecidos: cadastros.tecidos.filter((c) => !c.bloqueado),
    fornecedores: cadastros.fornecedores.filter((c) => !c.bloqueado),
  }

  const upd = (key: string, patch: Partial<ProdutoDraft>) =>
    setProdutos((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)))

  async function addClienteAndSelect(nome: string) {
    const c = await onAddCadastro('clientes', nome)
    setClienteId(c.id)
  }

  function submit() {
    setErro(null)
    if (!clienteId) { setErro('Selecione o cliente do pedido.'); return }
    const validos = produtos.filter((p) => p.uniformeId && Number(p.qtd) > 0)
    if (!validos.length) { setErro('Adicione ao menos um produto com uniforme e quantidade.'); return }
    for (let i = 0; i < produtos.length; i++) {
      const ge = gradeErro(produtos[i])
      if (ge) { setErro(`Produto ${i + 1}: ${ge}`); return }
    }
    const input: NovoPedidoInput = {
      clienteId, numeroProposta: numeroProposta.trim(), numeroPedido: numeroPedido.trim(), vendedor: vendedor.trim(), dataPedido, prioridade,
      evento, amostra, dataEntrega, observacao: observacao.trim(),
      produtos: validos.map((p) => draftToInput(p, numeroProposta, numeroPedido, dataEntrega, prioridade, evento, amostra, vendedor)),
    }
    onCreate(input)
  }

  const lab = 'block text-[12px] font-medium text-muted mb-1'
  const inp = 'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-ink/40 focus:outline-none'

  return (
    <Modal
      title="Nova Ordem de Produção"
      subtitle="Um pedido de venda com um ou mais produtos."
      width={880}
      onClose={onClose}
      footer={
        <>
          <BtnGhost onClick={onClose} disabled={saving}>Cancelar</BtnGhost>
          <BtnPrimary onClick={submit} disabled={saving}>{saving ? 'Criando…' : 'Criar OP'}</BtnPrimary>
        </>
      }
    >
      {/* Cabeçalho do pedido */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="sm:col-span-4">
          <label className={lab}>Cliente *</label>
          <Combobox
            value={clienteId}
            options={ativos.clientes}
            placeholder="Selecione o cliente"
            addLabel="Cadastrar cliente"
            onSelect={setClienteId}
            onAdd={addClienteAndSelect}
          />
        </div>
        <div>
          <label className={lab}>Pedido de Compra Cliente</label>
          <input className={inp} value={numeroProposta} onChange={(e) => setNumeroProposta(e.target.value)} placeholder="Nº do pedido de compra do cliente (se houver)" />
        </div>
        <div>
          <label className={lab}>Nº do Pedido</label>
          <input className={inp} value={numeroPedido} onChange={(e) => setNumeroPedido(e.target.value)} placeholder="Ex.: BLING 745" />
        </div>
        <div>
          <label className={lab}>Data do Pedido</label>
          <input type="date" className={inp} value={dataPedido} min={`${ANO_MIN}-01-01`} max={`${ANO_MAX}-12-31`} onChange={(e) => setDataPedido(e.target.value)} />
        </div>
        <div>
          <label className={lab}>Prioridade</label>
          <select className={inp} value={prioridade} onChange={(e) => setPrioridade(e.target.value as Prioridade)}>
            <option value="alta">{PRIO_LABEL.alta}</option>
            <option value="media">{PRIO_LABEL.media}</option>
            <option value="baixa">{PRIO_LABEL.baixa}</option>
          </select>
        </div>
      </div>

      {/* Controle do processo */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className={lab}>Evento</label>
          <FlagSimNao value={evento} onChange={setEventoFlag} />
          {evento && <span className="mt-1 block text-[11px] text-muted">Prioridade definida como Alta.</span>}
        </div>
        <div>
          <label className={lab}>Amostra</label>
          <FlagSimNao value={amostra} onChange={setAmostra} />
        </div>
        <div>
          <label className={lab}>Data de entrega do pedido</label>
          <input type="date" className={inp} value={dataEntrega} min={`${ANO_MIN}-01-01`} max={`${ANO_MAX}-12-31`} onChange={(e) => setDataEntrega(e.target.value)} />
          <span className="mt-1 block text-[11px] text-muted">Preenche a previsão dos itens (editável em cada um).</span>
        </div>
      </div>

      {/* Vendedor do pedido — espelha para cada item (editável em cada um) */}
      <div className="mt-4">
        <label className={lab}>Vendedor</label>
        <input className={inp} value={vendedor} onChange={(e) => setVendedor(e.target.value)} placeholder="Nome do vendedor responsável pelo pedido" />
        <span className="mt-1 block text-[11px] text-muted">Preenche o vendedor de cada item (editável em cada um).</span>
      </div>

      {/* Observação do pedido */}
      <div className="mt-4">
        <label className={lab}>Observação</label>
        <textarea className={`${inp} min-h-[64px] resize-y`} value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Observação livre sobre o pedido (opcional)" />
      </div>

      {/* Produtos */}
      <div className="mt-6 flex items-center justify-between">
        <h3 className="font-serif text-base font-semibold text-ink">Produtos do pedido</h3>
        <BtnGhost onClick={() => setProdutos((ps) => [...ps, novaLinha()])}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"><path d="M12 5v14M5 12h14" strokeWidth="2" strokeLinecap="round" /></svg>
          Adicionar produto
        </BtnGhost>
      </div>

      <div className="mt-3 flex flex-col gap-4">
        {produtos.map((p, i) => (
          <div key={p.key} className="rounded-xl border border-line p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[12px] font-semibold uppercase tracking-wide text-muted">Produto {i + 1}</span>
              {produtos.length > 1 && (
                <button type="button" onClick={() => setProdutos((ps) => ps.filter((x) => x.key !== p.key))} className="rounded-md p-1 text-muted transition hover:bg-neg/10 hover:text-neg" aria-label="Remover produto">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              )}
            </div>
            <ProdutoFields draft={p} ativos={ativos} opProposta={numeroProposta} opPedido={numeroPedido} opPrevisao={dataEntrega} opPrioridade={prioridade} opEvento={evento} opAmostra={amostra} opVendedor={vendedor} onChange={(patch) => upd(p.key, patch)} onAddCadastro={onAddCadastro} />
          </div>
        ))}
      </div>

      {erro && <p className="mt-4 rounded-lg bg-neg/10 px-3 py-2 text-sm text-neg">{erro}</p>}
    </Modal>
  )
}

