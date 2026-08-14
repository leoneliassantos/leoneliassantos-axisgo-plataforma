import { useState } from 'react'
import { Modal, BtnPrimary, BtnGhost } from './Modal'
import { Combobox } from './Combobox'
import { hojeISO } from './helpers'
import { ProdutoFields, novaLinha, draftToInput, type ProdutoDraft, type TabCad } from './ProdutoFields'
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
  const [produtos, setProdutos] = useState<ProdutoDraft[]>([novaLinha()])
  const [erro, setErro] = useState<string | null>(null)

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
    const input: NovoPedidoInput = {
      clienteId, numeroProposta: numeroProposta.trim(), numeroPedido: numeroPedido.trim(), dataPedido, prioridade,
      produtos: validos.map((p) => draftToInput(p, numeroProposta, numeroPedido)),
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
          <label className={lab}>Nº da Proposta</label>
          <input className={inp} value={numeroProposta} onChange={(e) => setNumeroProposta(e.target.value)} placeholder="Ex.: ORÇA 514" />
        </div>
        <div>
          <label className={lab}>Nº do Pedido</label>
          <input className={inp} value={numeroPedido} onChange={(e) => setNumeroPedido(e.target.value)} placeholder="Ex.: BLING 745" />
        </div>
        <div>
          <label className={lab}>Data do Pedido</label>
          <input type="date" className={inp} value={dataPedido} onChange={(e) => setDataPedido(e.target.value)} />
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
            <ProdutoFields draft={p} ativos={ativos} opProposta={numeroProposta} opPedido={numeroPedido} onChange={(patch) => upd(p.key, patch)} onAddCadastro={onAddCadastro} />
          </div>
        ))}
      </div>

      {erro && <p className="mt-4 rounded-lg bg-neg/10 px-3 py-2 text-sm text-neg">{erro}</p>}
    </Modal>
  )
}
