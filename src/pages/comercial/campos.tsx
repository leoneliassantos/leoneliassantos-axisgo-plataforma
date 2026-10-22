/**
 * Campos compartilhados do lead: CNPJ (com busca automática), Apelido (clientes
 * de Operações) e Itens de venda (produtos + quantidade → total). Usados tanto
 * no cadastro (Novo lead) quanto na edição (aba Dados do painel).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Btn, Field, Ico, Input, Select } from './ui'
import {
  brl, MESES_LABEL, normalizaMeses, totalItem, uid, valorItens,
  type LeadItem, type ModoReceita, type PlanoReceita, type Produto,
} from './data'
import { buscarCnpj, mascaraCnpj, soDigitos, type CnpjDados } from './cnpj'
import { Combobox } from '../operacoes/Combobox'
import { addCadastro, type Cadastro } from '../operacoes/data'
import { addIndicador, loadIndicadores, type Indicador } from './indicadoresData'

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
 *  Indicado por — representante que indicou (origem Indicação / Outro)
 * ------------------------------------------------------------------ */

export function IndicadoPorField({
  value,
  onChange,
}: {
  value?: string // indicadoPorId
  onChange: (id: string | undefined, nome: string) => void
}) {
  const [lista, setLista] = useState<Indicador[]>([])
  const [loading, setLoading] = useState(true)
  const recarregar = useCallback(() => {
    setLoading(true)
    loadIndicadores()
      .then(setLista)
      .catch(() => { /* sem Supabase em dev: fica sem a lista */ })
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { recarregar() }, [recarregar])

  return (
    <Field label="Indicado por (representante)">
      {loading ? (
        <div className="rounded-lg border border-line bg-paper/60 px-3 py-2 text-sm text-muted">Carregando…</div>
      ) : (
        <Combobox
          value={value ?? null}
          options={lista}
          placeholder="Selecione ou cadastre quem indicou…"
          addLabel="Cadastrar indicador"
          onSelect={(id) => { const i = lista.find((x) => x.id === id); onChange(id, i?.nome ?? '') }}
          onAdd={async (nome) => {
            const i = await addIndicador(nome)
            setLista((prev) => (prev.some((x) => x.id === i.id) ? prev : [...prev, i].sort((a, b) => a.nome.localeCompare(b.nome))))
            onChange(i.id, i.nome)
          }}
        />
      )}
      <p className="mt-1 text-[11px] text-muted/80">Mede quais representantes mais trazem clientes (ex.: Fabíola, Antônio Rosseti).</p>
    </Field>
  )
}

/* ------------------------------------------------------------------ *
 *  Valor potencial — expectativa de receita: valor único, mês a mês
 *  (dentro de um ano) ou valor anual. O total alimenta o valorPotencial.
 * ------------------------------------------------------------------ */

export function ValorPotencialField({
  plano,
  valor,
  onChange,
}: {
  plano?: PlanoReceita
  valor: number // valorPotencial atual (usado como valor avulso no modo 'único')
  onChange: (plano: PlanoReceita, total: number) => void
}) {
  const anoAtual = new Date().getFullYear()
  const ANOS = [anoAtual, anoAtual + 1, anoAtual + 2, anoAtual + 3]

  const [modo, setModo] = useState<ModoReceita>(plano?.modo ?? 'unico')
  const [ano, setAno] = useState<number>(plano?.ano ?? anoAtual)
  const [meses, setMeses] = useState<number[]>(normalizaMeses(plano?.meses))
  const [valAnual, setValAnual] = useState<number>(plano?.valorAnual ?? (plano?.modo === 'anual' ? valor : 0))
  const [valUnico, setValUnico] = useState<number>(!plano || plano.modo === 'unico' ? valor : 0)
  const [repetir, setRepetir] = useState('')

  const totalDe = (m: ModoReceita, mm: number[], va: number, vu: number) =>
    m === 'mensal' ? mm.reduce((s, x) => s + (Number(x) || 0), 0) : m === 'anual' ? Number(va) || 0 : Number(vu) || 0
  const totalAtual = totalDe(modo, meses, valAnual, valUnico)

  const emit = (over: { modo?: ModoReceita; ano?: number; meses?: number[]; valAnual?: number; valUnico?: number }) => {
    const m = over.modo ?? modo
    const a = over.ano ?? ano
    const mm = (over.meses ?? meses).map((x) => Number(x) || 0)
    const va = Number(over.valAnual ?? valAnual) || 0
    const vu = Number(over.valUnico ?? valUnico) || 0
    const plan: PlanoReceita =
      m === 'mensal' ? { modo: 'mensal', ano: a, meses: mm }
      : m === 'anual' ? { modo: 'anual', ano: a, valorAnual: va }
      : { modo: 'unico' }
    onChange(plan, totalDe(m, mm, va, vu))
  }

  const btnModo = (m: ModoReceita, label: string) => (
    <button
      type="button"
      onClick={() => { setModo(m); emit({ modo: m }) }}
      className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition ${
        modo === m ? 'border-transparent bg-brand text-white' : 'border-line text-muted hover:bg-paper'
      }`}
    >
      {label}
    </button>
  )

  const anoSelect = () => (
    <Select value={ano} onChange={(e) => { const a = Number(e.target.value); setAno(a); emit({ ano: a }) }}>
      {ANOS.map((a) => <option key={a} value={a}>{a}</option>)}
    </Select>
  )

  return (
    <div className="block">
      <span className="mb-1 block text-xs font-medium text-muted">Valor potencial (R$)</span>
      <div className="flex gap-1.5">
        {btnModo('unico', 'Único')}
        {btnModo('mensal', 'Mensal')}
        {btnModo('anual', 'Anual')}
      </div>

      {modo === 'unico' && (
        <div className="mt-2">
          <Input
            type="number" min={0} placeholder="0" value={valUnico || ''}
            onChange={(e) => setValUnico(Number(e.target.value) || 0)}
            onBlur={() => emit({})}
          />
        </div>
      )}

      {modo === 'anual' && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-[11px] text-muted">Ano da receita</span>
            {anoSelect()}
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] text-muted">Valor no ano (R$)</span>
            <Input
              type="number" min={0} placeholder="0" value={valAnual || ''}
              onChange={(e) => setValAnual(Number(e.target.value) || 0)}
              onBlur={() => emit({})}
            />
          </label>
        </div>
      )}

      {modo === 'mensal' && (
        <div className="mt-2">
          <div className="mb-2 flex items-end gap-2">
            <label className="w-28">
              <span className="mb-1 block text-[11px] text-muted">Ano</span>
              {anoSelect()}
            </label>
            <label className="block flex-1">
              <span className="mb-1 block text-[11px] text-muted">Repetir em todos os meses</span>
              <Input
                type="number" min={0} placeholder="Ex.: 5000" value={repetir}
                onChange={(e) => setRepetir(e.target.value)}
                onBlur={() => {
                  const v = Number(repetir) || 0
                  if (v > 0) { const mm = Array<number>(12).fill(v); setMeses(mm); emit({ meses: mm }) }
                }}
              />
            </label>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {MESES_LABEL.map((lbl, i) => (
              <label key={lbl} className="block">
                <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-muted/80">{lbl}</span>
                <Input
                  type="number" min={0} placeholder="0" value={meses[i] || ''} className="px-2 py-1.5"
                  onChange={(e) => { const mm = meses.slice(); mm[i] = Number(e.target.value) || 0; setMeses(mm) }}
                  onBlur={() => emit({})}
                />
              </label>
            ))}
          </div>
        </div>
      )}

      {modo !== 'unico' && (
        <div className="mt-2 flex items-center justify-between rounded-lg bg-paper px-3 py-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
            Total {modo === 'mensal' ? `em ${ano}` : `anual ${ano}`}
          </span>
          <span className="text-sm font-bold text-ink tnum">{brl(totalAtual)}</span>
        </div>
      )}
    </div>
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
