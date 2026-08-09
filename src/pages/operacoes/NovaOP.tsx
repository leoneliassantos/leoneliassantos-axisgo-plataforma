import { useState } from 'react'
import { Modal, BtnPrimary, BtnGhost } from './Modal'
import { Combobox } from './Combobox'
import { hojeISO } from './helpers'
import {
  type Cadastro, type Cadastros, type NovoPedidoInput, type NovoProdutoInput,
  type Prioridade, type TipoLogo, PRIO_LABEL,
} from './data'

type TabCad = 'clientes' | 'uniformes' | 'cores' | 'fornecedores'

interface LogoDraft {
  ativo: boolean
  fornecedorId: string | null
}
interface ProdutoDraft {
  key: string
  uniformeId: string | null
  corId: string | null
  numeroProposta: string
  numeroPedido: string
  qtd: string
  previsaoEntrega: string
  prioridade: Prioridade
  temLogo: boolean
  logos: Record<TipoLogo, LogoDraft>
}

const TIPOS_LOGO: TipoLogo[] = ['Bordado', 'Silk', 'DTF']
const novaLinha = (): ProdutoDraft => ({
  key: Math.random().toString(36).slice(2),
  uniformeId: null, corId: null, numeroProposta: '', numeroPedido: '', qtd: '', previsaoEntrega: '',
  prioridade: 'media', temLogo: false,
  logos: { Bordado: { ativo: false, fornecedorId: null }, Silk: { ativo: false, fornecedorId: null }, DTF: { ativo: false, fornecedorId: null } },
})

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
  const [dataPedido, setDataPedido] = useState(hojeISO())
  const [prioridade, setPrioridade] = useState<Prioridade>('media')
  const [produtos, setProdutos] = useState<ProdutoDraft[]>([novaLinha()])
  const [erro, setErro] = useState<string | null>(null)

  const upd = (key: string, patch: Partial<ProdutoDraft>) =>
    setProdutos((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)))
  const updLogo = (key: string, tipo: TipoLogo, patch: Partial<LogoDraft>) =>
    setProdutos((ps) => ps.map((p) => (p.key === key ? { ...p, logos: { ...p.logos, [tipo]: { ...p.logos[tipo], ...patch } } } : p)))

  async function addAndSelect(tabela: TabCad, nome: string, setter: (id: string) => void) {
    const c = await onAddCadastro(tabela, nome)
    setter(c.id)
  }

  function submit() {
    setErro(null)
    if (!clienteId) { setErro('Selecione o cliente do pedido.'); return }
    const validos = produtos.filter((p) => p.uniformeId && Number(p.qtd) > 0)
    if (!validos.length) { setErro('Adicione ao menos um produto com uniforme e quantidade.'); return }
    const input: NovoPedidoInput = {
      clienteId, numeroProposta: numeroProposta.trim(), dataPedido, prioridade,
      produtos: validos.map<NovoProdutoInput>((p) => ({
        uniformeId: p.uniformeId, corId: p.corId, numeroProposta: p.numeroProposta.trim(),
        numeroPedido: p.numeroPedido.trim(), qtd: Number(p.qtd), prioridade: p.prioridade,
        previsaoEntrega: p.previsaoEntrega,
        logos: p.temLogo
          ? TIPOS_LOGO.filter((t) => p.logos[t].ativo).map((t) => ({ tipo: t, fornecedorId: p.logos[t].fornecedorId }))
          : [],
      })),
    }
    onCreate(input)
  }

  const lab = 'block text-[12px] font-medium text-muted mb-1'
  const inp = 'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none'

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
        <div className="sm:col-span-2">
          <label className={lab}>Cliente *</label>
          <Combobox
            value={clienteId}
            options={cadastros.clientes}
            placeholder="Selecione o cliente"
            addLabel="Cadastrar cliente"
            onSelect={setClienteId}
            onAdd={(nome) => addAndSelect('clientes', nome, setClienteId)}
          />
        </div>
        <div>
          <label className={lab}>Nº da Proposta</label>
          <input className={inp} value={numeroProposta} onChange={(e) => setNumeroProposta(e.target.value)} placeholder="Ex.: ORÇA 514" />
        </div>
        <div>
          <label className={lab}>Data do Pedido</label>
          <input type="date" className={inp} value={dataPedido} onChange={(e) => setDataPedido(e.target.value)} />
        </div>
      </div>

      <div className="mt-3">
        <label className={lab}>Prioridade do pedido</label>
        <div className="flex gap-2">
          {(['alta', 'media', 'baixa'] as Prioridade[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPrioridade(p)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition ${prioridade === p ? 'border-brand bg-brand/10 font-medium text-brand' : 'border-line text-muted hover:bg-paper'}`}
            >
              {PRIO_LABEL[p]}
            </button>
          ))}
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

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className={lab}>Uniforme *</label>
                <Combobox value={p.uniformeId} options={cadastros.uniformes} placeholder="Selecione" addLabel="Cadastrar uniforme"
                  onSelect={(id) => upd(p.key, { uniformeId: id })} onAdd={(nome) => addAndSelect('uniformes', nome, (id) => upd(p.key, { uniformeId: id }))} />
              </div>
              <div>
                <label className={lab}>Cor</label>
                <Combobox value={p.corId} options={cadastros.cores} placeholder="Selecione" addLabel="Cadastrar cor"
                  onSelect={(id) => upd(p.key, { corId: id })} onAdd={(nome) => addAndSelect('cores', nome, (id) => upd(p.key, { corId: id }))} />
              </div>
              <div>
                <label className={lab}>Quantidade (peças) *</label>
                <input type="number" min={0} className={inp} value={p.qtd} onChange={(e) => upd(p.key, { qtd: e.target.value })} placeholder="0" />
              </div>
              <div>
                <label className={lab}>Nº do Pedido</label>
                <input className={inp} value={p.numeroPedido} onChange={(e) => upd(p.key, { numeroPedido: e.target.value })} placeholder="Ex.: BLING 745" />
              </div>
              <div>
                <label className={lab}>Previsão de entrega</label>
                <input type="date" className={inp} value={p.previsaoEntrega} onChange={(e) => upd(p.key, { previsaoEntrega: e.target.value })} />
              </div>
              <div>
                <label className={lab}>Prioridade do produto</label>
                <select className={inp} value={p.prioridade} onChange={(e) => upd(p.key, { prioridade: e.target.value as Prioridade })}>
                  <option value="alta">Alta</option>
                  <option value="media">Média</option>
                  <option value="baixa">Baixa</option>
                </select>
              </div>
            </div>

            {/* Logomarca */}
            <label className="mt-3 flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={p.temLogo} onChange={(e) => upd(p.key, { temLogo: e.target.checked })} className="accent-brand" />
              Tem aplicação de logomarca?
            </label>
            {p.temLogo && (
              <div className="mt-2 grid grid-cols-1 gap-2 rounded-lg bg-paper p-3 sm:grid-cols-3">
                {TIPOS_LOGO.map((t) => (
                  <div key={t} className="rounded-lg border border-line bg-surface p-2.5">
                    <label className="flex items-center gap-2 text-sm font-medium text-ink">
                      <input type="checkbox" checked={p.logos[t].ativo} onChange={(e) => updLogo(p.key, t, { ativo: e.target.checked })} className="accent-brand" />
                      {t}
                    </label>
                    {p.logos[t].ativo && (
                      <div className="mt-2">
                        <Combobox value={p.logos[t].fornecedorId} options={cadastros.fornecedores} placeholder="Fornecedor" addLabel="Cadastrar fornecedor"
                          onSelect={(id) => updLogo(p.key, t, { fornecedorId: id })} onAdd={(nome) => addAndSelect('fornecedores', nome, (id) => updLogo(p.key, t, { fornecedorId: id }))} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {erro && <p className="mt-4 rounded-lg bg-neg/10 px-3 py-2 text-sm text-neg">{erro}</p>}
    </Modal>
  )
}
