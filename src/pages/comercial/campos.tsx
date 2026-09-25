/**
 * Campos compartilhados do lead: CNPJ (com busca automática), Apelido (clientes
 * de Operações) e Itens de venda (produtos + quantidade → total). Usados tanto
 * no cadastro (Novo lead) quanto na edição (aba Dados do painel).
 */
import { useState } from 'react'
import { Btn, Field, Ico, Input, Select } from './ui'
import { brl, totalItem, uid, valorItens, type LeadItem, type Produto } from './data'
import { buscarCnpj, mascaraCnpj, soDigitos, type CnpjDados } from './cnpj'
import { Combobox } from '../operacoes/Combobox'
import { addCadastro, type Cadastro } from '../operacoes/data'

/* ------------------------------------------------------------------ *
 *  CNPJ — input com máscara + busca na BrasilAPI
 * ------------------------------------------------------------------ */

export function CnpjField({
  cnpj,
  dados,
  onChange,
}: {
  cnpj?: string
  dados?: CnpjDados
  onChange: (cnpj: string, dados?: CnpjDados) => void
}) {
  const [texto, setTexto] = useState(cnpj ? mascaraCnpj(cnpj) : '')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  const buscar = async () => {
    setErro('')
    setLoading(true)
    try {
      const d = await buscarCnpj(texto)
      setTexto(mascaraCnpj(d.cnpj))
      onChange(d.cnpj, d)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <Field label="CNPJ">
        <div className="flex gap-2">
          <Input
            value={texto}
            inputMode="numeric"
            placeholder="00.000.000/0000-00"
            onChange={(e) => setTexto(mascaraCnpj(e.target.value))}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buscar() } }}
          />
          <Btn variant="secondary" onClick={buscar} disabled={loading || soDigitos(texto).length !== 14}>
            {loading ? 'Buscando…' : 'Buscar'}
          </Btn>
        </div>
      </Field>
      {erro && <p className="mt-1 text-xs text-neg">{erro}</p>}
      {dados && <DadosCnpj dados={dados} onLimpar={() => { setTexto(''); onChange('', undefined) }} />}
    </div>
  )
}

function DadosCnpj({ dados, onLimpar }: { dados: CnpjDados; onLimpar: () => void }) {
  const ativa = /ativa/i.test(dados.situacao)
  return (
    <div className="mt-2 rounded-xl border border-line bg-paper/60 p-3 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{dados.razaoSocial || '—'}</p>
          {dados.nomeFantasia && <p className="truncate text-muted">{dados.nomeFantasia}</p>}
        </div>
        <button type="button" onClick={onLimpar} className="shrink-0 rounded-md p-1 text-muted hover:bg-surface hover:text-ink" title="Limpar CNPJ">
          <Ico n="x" s={15} />
        </button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-muted">
        {dados.situacao && (
          <p className="col-span-2">
            Situação:{' '}
            <span className={`font-semibold ${ativa ? 'text-pos' : 'text-neg'}`}>{dados.situacao}</span>
            {dados.abertura ? ` · desde ${dados.abertura}` : ''}
          </p>
        )}
        {dados.cnae && <p className="col-span-2">Atividade: <span className="text-ink">{dados.cnae}</span></p>}
        {dados.endereco && <p className="col-span-2">{dados.endereco}</p>}
        {(dados.municipio || dados.uf) && <p>{[dados.municipio, dados.uf].filter(Boolean).join(' / ')}</p>}
        {dados.telefone && <p>Tel.: {dados.telefone}</p>}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 *  Apelido — clientes cadastrados em Operações (agrupa vários CNPJs)
 * ------------------------------------------------------------------ */

export function ApelidoField({
  value,
  clientes,
  loading,
  onSelect,
  onAdded,
}: {
  value?: string // clienteOpId
  clientes: Cadastro[]
  loading: boolean
  onSelect: (id: string, nome: string) => void
  onAdded?: () => void
}) {
  return (
    <Field label="Apelido (cliente em Operações)">
      {loading ? (
        <div className="rounded-lg border border-line bg-paper/60 px-3 py-2 text-sm text-muted">Carregando clientes…</div>
      ) : (
        <Combobox
          value={value ?? null}
          options={clientes}
          placeholder="Selecione ou cadastre o cliente…"
          addLabel="Cadastrar cliente"
          onSelect={(id) => { const c = clientes.find((x) => x.id === id); onSelect(id, c?.nome ?? '') }}
          onAdd={async (nome) => {
            const c = await addCadastro('clientes', nome)
            onSelect(c.id, c.nome)
            onAdded?.()
          }}
        />
      )}
      <p className="mt-1 text-[11px] text-muted/80">Agrupa vários CNPJs sob o mesmo cliente (usado nos indicadores).</p>
    </Field>
  )
}

/* ------------------------------------------------------------------ *
 *  Itens de venda — produto + quantidade → total (permite vários)
 * ------------------------------------------------------------------ */

export function ItensVenda({
  itens,
  produtos,
  onChange,
}: {
  itens: LeadItem[]
  produtos: Produto[]
  onChange: (itens: LeadItem[]) => void
}) {
  const ativos = produtos.filter((p) => p.ativo)
  const total = valorItens(itens)

  const addRow = () => onChange([...itens, { id: uid(), produtoId: '', produtoNome: '', qtd: 1, valorUnit: 0 }])
  const delRow = (id: string) => onChange(itens.filter((i) => i.id !== id))
  const setRow = (id: string, patch: Partial<LeadItem>) => onChange(itens.map((i) => (i.id === id ? { ...i, ...patch } : i)))
  const setProduto = (id: string, produtoId: string) => {
    const p = ativos.find((x) => x.id === produtoId)
    setRow(id, { produtoId, produtoNome: p?.nome ?? '', valorUnit: p?.valorUnitario ?? 0 })
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted/80">Produtos da venda</span>
        <Btn variant="secondary" sm onClick={addRow}><Ico n="plus" s={14} /> Adicionar produto</Btn>
      </div>

      {itens.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line px-3 py-5 text-center text-xs text-muted/70">
          Nenhum produto. Clique em <b>Adicionar produto</b> para montar a venda.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {itens.map((i) => (
            <div key={i.id} className="flex items-end gap-2 rounded-xl border border-line bg-surface p-2">
              <label className="min-w-0 flex-1">
                <span className="mb-1 block text-[11px] text-muted">Produto</span>
                <Select value={i.produtoId} onChange={(e) => setProduto(i.id, e.target.value)}>
                  <option value="">Selecione…</option>
                  {ativos.map((p) => <option key={p.id} value={p.id}>{p.nome} — {brl(p.valorUnitario)}</option>)}
                  {/* mantém visível um produto que tenha sido inativado depois de escolhido */}
                  {i.produtoId && !ativos.some((p) => p.id === i.produtoId) && (
                    <option value={i.produtoId}>{i.produtoNome} (inativo)</option>
                  )}
                </Select>
              </label>
              <label className="w-20">
                <span className="mb-1 block text-[11px] text-muted">Qtd</span>
                <Input type="number" min={0} value={i.qtd} onChange={(e) => setRow(i.id, { qtd: Number(e.target.value) || 0 })} />
              </label>
              <div className="w-24 pb-2 text-right">
                <span className="mb-1 block text-[11px] text-muted">Total</span>
                <span className="text-sm font-semibold text-ink tnum">{brl(totalItem(i))}</span>
              </div>
              <button type="button" onClick={() => delRow(i.id)} className="mb-1.5 shrink-0 rounded-lg p-1.5 text-muted hover:bg-neg/10 hover:text-neg" title="Remover">
                <Ico n="trash" s={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      {itens.length > 0 && (
        <div className="mt-2 flex items-center justify-between rounded-xl bg-paper px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Valor total da venda</span>
          <span className="text-base font-bold text-ink tnum">{brl(total)}</span>
        </div>
      )}
    </div>
  )
}
