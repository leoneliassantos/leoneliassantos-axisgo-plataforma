import { Combobox } from './Combobox'
import type { Cadastro, Cadastros, NovoProdutoInput, Prioridade, TipoLogo, Produto } from './data'

export type TabCad = 'clientes' | 'uniformes' | 'cores' | 'tecidos' | 'fornecedores'

interface LogoDraft {
  ativo: boolean
  fornecedorId: string | null
}
export interface ProdutoDraft {
  key: string
  uniformeId: string | null
  corId: string | null
  tecidoId: string | null
  numeroProposta: string
  numeroPedido: string
  propostaEdit: boolean
  pedidoEdit: boolean
  qtd: string
  previsaoEntrega: string
  previsaoEdit: boolean
  prioridade: Prioridade
  temLogo: boolean
  logos: Record<TipoLogo, LogoDraft>
}

export const TIPOS_LOGO: TipoLogo[] = ['Bordado', 'Silk', 'DTF']

export const novaLinha = (): ProdutoDraft => ({
  key: Math.random().toString(36).slice(2),
  uniformeId: null, corId: null, tecidoId: null,
  numeroProposta: '', numeroPedido: '', propostaEdit: false, pedidoEdit: false,
  qtd: '', previsaoEntrega: '', previsaoEdit: false, prioridade: 'media', temLogo: false,
  logos: { Bordado: { ativo: false, fornecedorId: null }, Silk: { ativo: false, fornecedorId: null }, DTF: { ativo: false, fornecedorId: null } },
})

/** Converte um Produto já existente em rascunho editável (para a aba Detalhes). */
export function produtoToDraft(p: Produto): ProdutoDraft {
  const logoOf = (t: TipoLogo) => p.logos.find((l) => l.tipo === t)
  return {
    key: p.id,
    uniformeId: p.uniformeId, corId: p.corId, tecidoId: p.tecidoId,
    numeroProposta: p.numeroProposta, numeroPedido: p.numeroPedido, propostaEdit: true, pedidoEdit: true,
    qtd: String(p.qtd), previsaoEntrega: p.previsaoEntrega, previsaoEdit: true, prioridade: p.prioridade,
    temLogo: p.logos.length > 0,
    logos: {
      Bordado: { ativo: !!logoOf('Bordado'), fornecedorId: logoOf('Bordado')?.fornecedorId ?? null },
      Silk: { ativo: !!logoOf('Silk'), fornecedorId: logoOf('Silk')?.fornecedorId ?? null },
      DTF: { ativo: !!logoOf('DTF'), fornecedorId: logoOf('DTF')?.fornecedorId ?? null },
    },
  }
}

/** Nº efetivo: usa o do item se foi editado; senão herda o da OP. */
export const propostaEfetiva = (d: ProdutoDraft, opProposta: string) => (d.propostaEdit ? d.numeroProposta : opProposta)
export const pedidoEfetivo = (d: ProdutoDraft, opPedido: string) => (d.pedidoEdit ? d.numeroPedido : opPedido)
/** Previsão efetiva: usa a do item se foi editada; senão herda a data de entrega da OP. */
export const previsaoEfetiva = (d: ProdutoDraft, opPrevisao: string) => (d.previsaoEdit ? d.previsaoEntrega : opPrevisao)

export function draftToInput(d: ProdutoDraft, opProposta: string, opPedido: string, opPrevisao = ''): NovoProdutoInput {
  return {
    uniformeId: d.uniformeId, corId: d.corId, tecidoId: d.tecidoId,
    numeroProposta: propostaEfetiva(d, opProposta).trim(),
    numeroPedido: pedidoEfetivo(d, opPedido).trim(),
    qtd: Number(d.qtd), prioridade: d.prioridade, previsaoEntrega: previsaoEfetiva(d, opPrevisao),
    logos: d.temLogo ? TIPOS_LOGO.filter((t) => d.logos[t].ativo).map((t) => ({ tipo: t, fornecedorId: d.logos[t].fornecedorId })) : [],
  }
}

const lab = 'block text-[12px] font-medium text-muted mb-1'
const inp = 'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-ink/40 focus:outline-none'

/** Campos de UM produto — usado na Nova OP e no "Acrescentar item". */
export function ProdutoFields({
  draft, ativos, opProposta, opPedido, opPrevisao = '', onChange, onAddCadastro,
}: {
  draft: ProdutoDraft
  ativos: Cadastros
  opProposta: string
  opPedido: string
  opPrevisao?: string
  onChange: (patch: Partial<ProdutoDraft>) => void
  onAddCadastro: (tabela: TabCad, nome: string) => Promise<Cadastro>
}) {
  const updLogo = (tipo: TipoLogo, patch: Partial<LogoDraft>) => onChange({ logos: { ...draft.logos, [tipo]: { ...draft.logos[tipo], ...patch } } })
  async function addAndSelect(tabela: TabCad, nome: string, set: (id: string) => void) {
    const c = await onAddCadastro(tabela, nome)
    set(c.id)
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className={lab}>Uniforme *</label>
          <Combobox value={draft.uniformeId} options={ativos.uniformes} placeholder="Selecione" addLabel="Cadastrar uniforme"
            onSelect={(id) => onChange({ uniformeId: id })} onAdd={(nome) => addAndSelect('uniformes', nome, (id) => onChange({ uniformeId: id }))} />
        </div>
        <div>
          <label className={lab}>Cor</label>
          <Combobox value={draft.corId} options={ativos.cores} placeholder="Selecione" addLabel="Cadastrar cor"
            onSelect={(id) => onChange({ corId: id })} onAdd={(nome) => addAndSelect('cores', nome, (id) => onChange({ corId: id }))} />
        </div>
        <div>
          <label className={lab}>Tecido</label>
          <Combobox value={draft.tecidoId} options={ativos.tecidos} placeholder="Selecione" addLabel="Cadastrar tecido"
            onSelect={(id) => onChange({ tecidoId: id })} onAdd={(nome) => addAndSelect('tecidos', nome, (id) => onChange({ tecidoId: id }))} />
        </div>
        <div>
          <label className={lab}>Nº da Proposta</label>
          <input className={inp} value={propostaEfetiva(draft, opProposta)} onChange={(e) => onChange({ numeroProposta: e.target.value, propostaEdit: true })} placeholder="Herdado da OP" />
        </div>
        <div>
          <label className={lab}>Nº do Pedido</label>
          <input className={inp} value={pedidoEfetivo(draft, opPedido)} onChange={(e) => onChange({ numeroPedido: e.target.value, pedidoEdit: true })} placeholder="Herdado da OP" />
        </div>
        <div>
          <label className={lab}>Quantidade (peças) *</label>
          <input type="number" min={0} className={inp} value={draft.qtd} onChange={(e) => onChange({ qtd: e.target.value })} placeholder="0" />
        </div>
        <div>
          <label className={lab}>Previsão de entrega</label>
          <input type="date" className={inp} value={previsaoEfetiva(draft, opPrevisao)} onChange={(e) => onChange({ previsaoEntrega: e.target.value, previsaoEdit: true })} />
          {opPrevisao && !draft.previsaoEdit && <span className="mt-1 block text-[11px] text-muted">Herdada da entrega do pedido</span>}
        </div>
        <div>
          <label className={lab}>Prioridade do produto</label>
          <select className={inp} value={draft.prioridade} onChange={(e) => onChange({ prioridade: e.target.value as Prioridade })}>
            <option value="alta">Alta</option>
            <option value="media">Média</option>
            <option value="baixa">Baixa</option>
          </select>
        </div>
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={draft.temLogo} onChange={(e) => onChange({ temLogo: e.target.checked })} className="accent-ink" />
        Tem aplicação de logomarca?
      </label>
      {draft.temLogo && (
        <div className="mt-2 grid grid-cols-1 gap-2 rounded-lg bg-paper p-3 sm:grid-cols-3">
          {TIPOS_LOGO.map((t) => (
            <div key={t} className="rounded-lg border border-line bg-surface p-2.5">
              <label className="flex items-center gap-2 text-sm font-medium text-ink">
                <input type="checkbox" checked={draft.logos[t].ativo} onChange={(e) => updLogo(t, { ativo: e.target.checked })} className="accent-ink" />
                {t}
              </label>
              {draft.logos[t].ativo && (
                <div className="mt-2">
                  <Combobox value={draft.logos[t].fornecedorId} options={ativos.fornecedores} placeholder="Fornecedor" addLabel="Cadastrar fornecedor"
                    onSelect={(id) => updLogo(t, { fornecedorId: id })} onAdd={(nome) => addAndSelect('fornecedores', nome, (id) => updLogo(t, { fornecedorId: id }))} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
