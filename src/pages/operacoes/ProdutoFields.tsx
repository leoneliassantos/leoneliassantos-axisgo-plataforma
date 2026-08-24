import { Combobox } from './Combobox'
import { ANO_MIN, ANO_MAX } from './helpers'
import { TAMANHOS_LINHA1, TAMANHOS_LINHA2, TAMANHOS_LINHA3, TAMANHOS_LINHA4, somaGrade } from './data'
import type { Cadastro, Cadastros, NovoProdutoInput, Prioridade, TipoLogo, Produto, Grade } from './data'

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
  vendedor: string
  propostaEdit: boolean
  pedidoEdit: boolean
  vendedorEdit: boolean
  qtd: string
  previsaoEntrega: string
  previsaoEdit: boolean
  prioridade: Prioridade
  prioridadeEdit: boolean
  evento: boolean
  eventoEdit: boolean
  amostra: boolean
  amostraEdit: boolean
  observacao: string
  grade: Grade
  temLogo: boolean
  logos: Record<TipoLogo, LogoDraft>
}

export const TIPOS_LOGO: TipoLogo[] = ['Bordado', 'Silk', 'DTF']

export const novaLinha = (): ProdutoDraft => ({
  key: Math.random().toString(36).slice(2),
  uniformeId: null, corId: null, tecidoId: null,
  numeroProposta: '', numeroPedido: '', vendedor: '', propostaEdit: false, pedidoEdit: false, vendedorEdit: false,
  qtd: '', previsaoEntrega: '', previsaoEdit: false, prioridade: 'media', prioridadeEdit: false,
  evento: false, eventoEdit: false, amostra: false, amostraEdit: false, observacao: '', grade: {}, temLogo: false,
  logos: { Bordado: { ativo: false, fornecedorId: null }, Silk: { ativo: false, fornecedorId: null }, DTF: { ativo: false, fornecedorId: null } },
})

/** Converte um Produto já existente em rascunho editável (para a aba Detalhes). */
export function produtoToDraft(p: Produto): ProdutoDraft {
  const logoOf = (t: TipoLogo) => p.logos.find((l) => l.tipo === t)
  return {
    key: p.id,
    uniformeId: p.uniformeId, corId: p.corId, tecidoId: p.tecidoId,
    numeroProposta: p.numeroProposta, numeroPedido: p.numeroPedido, vendedor: p.vendedor, propostaEdit: true, pedidoEdit: true, vendedorEdit: true,
    qtd: String(p.qtd), previsaoEntrega: p.previsaoEntrega, previsaoEdit: true, prioridade: p.prioridade, prioridadeEdit: true,
    evento: p.evento, eventoEdit: true, amostra: p.amostra, amostraEdit: true,
    observacao: p.observacao ?? '', grade: { ...(p.grade ?? {}) },
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
/** Vendedor efetivo: usa o do item se foi editado; senão herda o do pedido. */
export const vendedorEfetivo = (d: ProdutoDraft, opVendedor: string) => (d.vendedorEdit ? d.vendedor : opVendedor)
/** Previsão efetiva: usa a do item se foi editada; senão herda a data de entrega da OP. */
export const previsaoEfetiva = (d: ProdutoDraft, opPrevisao: string) => (d.previsaoEdit ? d.previsaoEntrega : opPrevisao)
/** Prioridade efetiva: usa a do item se foi trocada; senão herda a prioridade do pedido. */
export const prioridadeEfetiva = (d: ProdutoDraft, opPrioridade: Prioridade): Prioridade => (d.prioridadeEdit ? d.prioridade : opPrioridade)
/** Evento/Amostra efetivos: usam o do item se foram trocados; senão herdam os do pedido. */
export const eventoEfetivo = (d: ProdutoDraft, opEvento: boolean) => (d.eventoEdit ? d.evento : opEvento)
export const amostraEfetiva = (d: ProdutoDraft, opAmostra: boolean) => (d.amostraEdit ? d.amostra : opAmostra)

export function draftToInput(d: ProdutoDraft, opProposta: string, opPedido: string, opPrevisao = '', opPrioridade: Prioridade = 'media', opEvento = false, opAmostra = false, opVendedor = ''): NovoProdutoInput {
  return {
    uniformeId: d.uniformeId, corId: d.corId, tecidoId: d.tecidoId,
    numeroProposta: propostaEfetiva(d, opProposta).trim(),
    numeroPedido: pedidoEfetivo(d, opPedido).trim(),
    vendedor: vendedorEfetivo(d, opVendedor).trim(),
    qtd: Number(d.qtd), prioridade: prioridadeEfetiva(d, opPrioridade), previsaoEntrega: previsaoEfetiva(d, opPrevisao),
    observacao: d.observacao.trim(), evento: eventoEfetivo(d, opEvento), amostra: amostraEfetiva(d, opAmostra), grade: d.grade,
    logos: d.temLogo ? TIPOS_LOGO.filter((t) => d.logos[t].ativo).map((t) => ({ tipo: t, fornecedorId: d.logos[t].fornecedorId })) : [],
  }
}

/** Alternador Sim/Não (chrome neutro; ativo em tom escuro). Compartilhado com a Nova OP. */
export function FlagSimNao({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const base = 'flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition'
  const on = 'border-ink bg-ink text-surface'
  const off = 'border-line bg-surface text-muted hover:border-ink/30'
  return (
    <div className="flex gap-2">
      <button type="button" onClick={() => onChange(true)} className={`${base} ${value ? on : off}`}>Sim</button>
      <button type="button" onClick={() => onChange(false)} className={`${base} ${!value ? on : off}`}>Não</button>
    </div>
  )
}

/**
 * Valida a grade de tamanhos contra a quantidade. A grade é OBRIGATÓRIA: o total
 * distribuído deve ser igual à quantidade de peças do item. (Só não valida quando
 * ainda não há quantidade — o submit já cobra a quantidade separadamente.)
 */
export function gradeErro(d: ProdutoDraft): string | null {
  const qtd = Number(d.qtd) || 0
  if (qtd <= 0) return null
  const soma = somaGrade(d.grade)
  if (soma === 0) return `Preencha a grade de tamanhos: distribua as ${qtd} peça(s) entre os tamanhos.`
  if (soma !== qtd) return `A quantidade de peças (${qtd}) não bate com a soma da grade de tamanhos (${soma}).`
  return null
}

const lab = 'block text-[12px] font-medium text-muted mb-1'
const inp = 'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-ink/40 focus:outline-none'

/** Campos de UM produto — usado na Nova OP e no "Acrescentar item". */
export function ProdutoFields({
  draft, ativos, opProposta, opPedido, opPrevisao = '', opPrioridade = 'media', opEvento = false, opAmostra = false, opVendedor = '', onChange, onAddCadastro,
}: {
  draft: ProdutoDraft
  ativos: Cadastros
  opProposta: string
  opPedido: string
  opPrevisao?: string
  opPrioridade?: Prioridade
  opEvento?: boolean
  opAmostra?: boolean
  opVendedor?: string
  onChange: (patch: Partial<ProdutoDraft>) => void
  onAddCadastro: (tabela: TabCad, nome: string) => Promise<Cadastro>
}) {
  const updLogo = (tipo: TipoLogo, patch: Partial<LogoDraft>) => onChange({ logos: { ...draft.logos, [tipo]: { ...draft.logos[tipo], ...patch } } })
  async function addAndSelect(tabela: TabCad, nome: string, set: (id: string) => void) {
    const c = await onAddCadastro(tabela, nome)
    set(c.id)
  }
  const setGrade = (t: string, v: string) => {
    const n = Math.max(0, Math.floor(Number(v) || 0))
    const g = { ...draft.grade }
    if (n > 0) g[t] = n
    else delete g[t]
    onChange({ grade: g })
  }
  const somaG = somaGrade(draft.grade)
  const qtdN = Number(draft.qtd) || 0
  const gErro = gradeErro(draft)

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
          <label className={lab}>Pedido de Compra Cliente</label>
          <input className={inp} value={propostaEfetiva(draft, opProposta)} onChange={(e) => onChange({ numeroProposta: e.target.value, propostaEdit: true })} placeholder="Herdado da OP" />
        </div>
        <div>
          <label className={lab}>Nº do Pedido</label>
          <input className={inp} value={pedidoEfetivo(draft, opPedido)} onChange={(e) => onChange({ numeroPedido: e.target.value, pedidoEdit: true })} placeholder="Herdado da OP" />
        </div>
        <div>
          <label className={lab}>Vendedor</label>
          <input className={inp} value={vendedorEfetivo(draft, opVendedor)} onChange={(e) => onChange({ vendedor: e.target.value, vendedorEdit: true })} placeholder="Herdado da OP" />
          {opVendedor && !draft.vendedorEdit && <span className="mt-1 block text-[11px] text-muted">Herdado da OP</span>}
        </div>
        <div>
          <label className={lab}>Quantidade (peças) *</label>
          <input type="number" min={0} className={inp} value={draft.qtd} onChange={(e) => onChange({ qtd: e.target.value })} placeholder="0" />
        </div>
        <div>
          <label className={lab}>Previsão de entrega</label>
          <input type="date" className={inp} value={previsaoEfetiva(draft, opPrevisao)} min={`${ANO_MIN}-01-01`} max={`${ANO_MAX}-12-31`} onChange={(e) => onChange({ previsaoEntrega: e.target.value, previsaoEdit: true })} />
          {opPrevisao && !draft.previsaoEdit && <span className="mt-1 block text-[11px] text-muted">Herdada da entrega do pedido</span>}
        </div>
        <div>
          <label className={lab}>Prioridade do produto</label>
          <select className={inp} value={prioridadeEfetiva(draft, opPrioridade)} onChange={(e) => onChange({ prioridade: e.target.value as Prioridade, prioridadeEdit: true })}>
            <option value="alta">Alta</option>
            <option value="media">Média</option>
            <option value="baixa">Baixa</option>
          </select>
          {!draft.prioridadeEdit && <span className="mt-1 block text-[11px] text-muted">Herda a prioridade do pedido</span>}
        </div>
      </div>

      {/* Evento / Amostra — herdam do pedido, mas podem ser diferentes por item */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label className={lab}>Evento</label>
          <FlagSimNao value={eventoEfetivo(draft, opEvento)} onChange={(v) => onChange({ evento: v, eventoEdit: true })} />
          {!draft.eventoEdit && <span className="mt-1 block text-[11px] text-muted">Herda do pedido</span>}
        </div>
        <div>
          <label className={lab}>Amostra</label>
          <FlagSimNao value={amostraEfetiva(draft, opAmostra)} onChange={(v) => onChange({ amostra: v, amostraEdit: true })} />
          {!draft.amostraEdit && <span className="mt-1 block text-[11px] text-muted">Herda do pedido</span>}
        </div>
      </div>

      {/* Grade de Tamanhos */}
      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <label className={lab + ' mb-0'}>Grade de Tamanhos</label>
          <span className={`text-[12px] font-medium ${gErro ? 'text-neg' : somaG > 0 ? 'text-pos' : 'text-muted'}`}>
            Distribuídas: <b className="tnum">{somaG}</b> / <b className="tnum">{qtdN}</b>
          </span>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[680px] space-y-2">
            {[TAMANHOS_LINHA1, TAMANHOS_LINHA2, TAMANHOS_LINHA3, TAMANHOS_LINHA4].map((linha, li) => (
              <div key={li} className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${linha.length}, minmax(0, 1fr))` }}>
                {linha.map((t) => (
                  <div key={t} className="text-center">
                    <div className="mb-1 text-[11px] font-semibold text-muted">{t}</div>
                    <input
                      type="number" min={0} inputMode="numeric"
                      className={`w-full rounded-lg border bg-surface px-1.5 py-1.5 text-center text-sm text-ink focus:outline-none ${gErro ? 'border-neg/50 focus:border-neg' : 'border-line focus:border-ink/40'}`}
                      value={draft.grade[t] ?? ''} placeholder="0"
                      onChange={(e) => setGrade(t, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
        {gErro && <p className="mt-2 rounded-lg bg-neg/10 px-3 py-1.5 text-[12px] font-medium text-neg">{gErro}</p>}
      </div>

      {/* Observação do item */}
      <div className="mt-4">
        <label className={lab}>Observação do item</label>
        <textarea
          className={`${inp} min-h-[56px] resize-y`}
          value={draft.observacao}
          onChange={(e) => onChange({ observacao: e.target.value })}
          placeholder="Observação específica deste produto/item (opcional)"
        />
      </div>

      <label className="mt-4 flex items-center gap-2 text-sm text-ink">
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
