import { useState } from 'react'
import { Modal, BtnPrimary, BtnGhost } from './Modal'
import { ProdutoFields, novaLinha, draftToInput, gradeErro, type ProdutoDraft, type TabCad } from './ProdutoFields'
import type { Cadastro, Cadastros, NovoProdutoInput } from './data'

export function NovoItem({
  cadastros, opProposta, opPedido, opPrevisao = '', saving, onAddCadastro, onCreate, onClose,
}: {
  cadastros: Cadastros
  opProposta: string
  opPedido: string
  opPrevisao?: string
  saving: boolean
  onAddCadastro: (tabela: TabCad, nome: string) => Promise<Cadastro>
  onCreate: (input: NovoProdutoInput) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<ProdutoDraft>(novaLinha())
  const [erro, setErro] = useState<string | null>(null)

  const ativos: Cadastros = {
    clientes: cadastros.clientes.filter((c) => !c.bloqueado),
    uniformes: cadastros.uniformes.filter((c) => !c.bloqueado),
    cores: cadastros.cores.filter((c) => !c.bloqueado),
    tecidos: cadastros.tecidos.filter((c) => !c.bloqueado),
    fornecedores: cadastros.fornecedores.filter((c) => !c.bloqueado),
  }

  function submit() {
    setErro(null)
    if (!draft.uniformeId || !(Number(draft.qtd) > 0)) { setErro('Informe o uniforme e a quantidade.'); return }
    const ge = gradeErro(draft)
    if (ge) { setErro(ge); return }
    onCreate(draftToInput(draft, opProposta, opPedido, opPrevisao))
  }

  return (
    <Modal
      title="Acrescentar item"
      subtitle="Complementa esta OP com mais um produto (Nº Proposta/Pedido já vêm da OP)."
      width={780}
      onClose={onClose}
      footer={
        <>
          <BtnGhost onClick={onClose} disabled={saving}>Cancelar</BtnGhost>
          <BtnPrimary onClick={submit} disabled={saving}>{saving ? 'Adicionando…' : 'Adicionar item'}</BtnPrimary>
        </>
      }
    >
      <ProdutoFields draft={draft} ativos={ativos} opProposta={opProposta} opPedido={opPedido} opPrevisao={opPrevisao} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} onAddCadastro={onAddCadastro} />
      {erro && <p className="mt-4 rounded-lg bg-neg/10 px-3 py-2 text-sm text-neg">{erro}</p>}
    </Modal>
  )
}
