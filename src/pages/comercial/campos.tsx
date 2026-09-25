/**
 * Campos compartilhados do lead: CNPJ (com busca automática), Apelido (clientes
 * de Operações) e Itens de venda (produtos + quantidade → total). Usados tanto
 * no cadastro (Novo lead) quanto na edição (aba Dados do painel).
 */
import { useEffect, useRef, useState } from 'react'
import { Btn, Field, Ico, Input } from './ui'
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
              <div className="min-w-0 flex-1">
                <span className="mb-1 block text-[11px] text-muted">Produto</span>
                <ProdutoPicker
                  produtos={ativos}
                  value={i.produtoId}
                  snapshot={i}
                  onPick={(p) => setRow(i.id, { produtoId: p.id, produtoNome: p.nome, cor: p.cor, tecido: p.tecido, valorUnit: p.valorUnitario })}
                />
              </div>
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

/** Descrição curta de um produto (nome · cor · tecido). */
function descricaoProduto(p: Produto): string {
  return [p.nome, p.cor, p.tecido].filter(Boolean).join(' · ')
}

/** Seletor de produto com BUSCA (aguenta o catálogo completo, centenas de itens). */
function ProdutoPicker({
  produtos,
  value,
  snapshot,
  onPick,
}: {
  produtos: Produto[]
  value: string
  snapshot: { produtoNome: string; cor?: string; tecido?: string }
  onPick: (p: Produto) => void
}) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function fora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [])

  const sel = produtos.find((p) => p.id === value)
  const filtro = busca.trim().toLowerCase()
  const lista = filtro
    ? produtos.filter((p) => `${p.nome} ${p.cor} ${p.tecido} ${p.categoria}`.toLowerCase().includes(filtro))
    : produtos
  const MAX = 60
  const mostrados = lista.slice(0, MAX)
  const escolhido = sel || snapshot.produtoNome
  const label = sel
    ? descricaoProduto(sel)
    : snapshot.produtoNome
      ? [snapshot.produtoNome, snapshot.cor, snapshot.tecido].filter(Boolean).join(' · ')
      : 'Selecione o produto…'

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-left text-sm hover:border-ink/30 focus:outline-none"
      >
        <span className={`truncate ${escolhido ? 'text-ink' : 'text-muted'}`}>{label}</span>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" className="shrink-0 text-muted">
          <path d="M6 9l6 6 6-6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {aberto && (
        <div className="absolute z-[70] mt-1 w-full min-w-[300px] overflow-hidden rounded-lg border border-line bg-surface shadow-brand">
          <div className="border-b border-line p-2">
            <Input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produto, cor ou tecido…" />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {mostrados.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => { onPick(p); setAberto(false); setBusca('') }}
                className={`block w-full px-3 py-2 text-left hover:bg-paper ${p.id === value ? 'bg-paper/60' : ''}`}
              >
                <span className="block truncate text-sm text-ink">{p.nome}</span>
                <span className="block truncate text-[11px] text-muted">
                  {[p.categoria, p.cor, p.tecido].filter(Boolean).join(' · ')} — <b className="text-ink">{brl(p.valorUnitario)}</b>
                </span>
              </button>
            ))}
            {mostrados.length === 0 && <div className="px-3 py-3 text-sm text-muted">Nenhum produto encontrado.</div>}
            {lista.length > MAX && (
              <div className="px-3 py-2 text-[11px] text-muted/70">Mostrando {MAX} de {lista.length}. Refine a busca…</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
