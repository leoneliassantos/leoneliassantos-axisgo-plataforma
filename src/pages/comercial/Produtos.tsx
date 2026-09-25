/**
 * Gestão de Produtos do Comercial — catálogo (Tabela de Vendas) no Supabase.
 * Cadastrar, alterar valor, inativar/reativar. Alimenta o seletor de produtos
 * do CRM (montagem da venda / futura proposta).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Modal } from '../operacoes/Modal'
import { Badge, Btn, Card, Field, Ico, Input, Select, ToastProvider, useToast } from './ui'
import { brl, type Produto } from './data'
import { addProduto, loadProdutos, setProdutoAtivo, updateProduto } from './produtosData'

const CATEGORIAS = ['Malharia e Blusa de Lã', 'Social', 'Operacional']

export function Produtos() {
  return (
    <ToastProvider>
      <ProdutosScreen />
    </ToastProvider>
  )
}

function ProdutosScreen() {
  const { notify } = useToast()
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [q, setQ] = useState('')
  const [fCat, setFCat] = useState('all')
  const [mostrarInativos, setMostrarInativos] = useState(true)
  const [editando, setEditando] = useState<Produto | null>(null)
  const [novo, setNovo] = useState(false)

  const recarregar = useCallback(async () => {
    setLoading(true)
    setErro('')
    try {
      setProdutos(await loadProdutos())
    } catch (e) {
      setErro((e as Error).message || 'Falha ao carregar os produtos.')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { recarregar() }, [recarregar])

  const categorias = useMemo(
    () => [...new Set([...CATEGORIAS, ...produtos.map((p) => p.categoria).filter(Boolean)])],
    [produtos],
  )

  const lista = useMemo(() => {
    const termo = q.trim().toLowerCase()
    return produtos
      .filter((p) => (mostrarInativos ? true : p.ativo))
      .filter((p) => fCat === 'all' || p.categoria === fCat)
      .filter((p) => !termo || `${p.nome} ${p.cor} ${p.tecido}`.toLowerCase().includes(termo))
  }, [produtos, q, fCat, mostrarInativos])

  const ativos = produtos.filter((p) => p.ativo).length

  const salvar = async (patch: { categoria: string; nome: string; cor: string; tecido: string; valorUnitario: number }, id?: string) => {
    try {
      if (id) await updateProduto(id, patch)
      else await addProduto(patch)
      notify({ title: id ? 'Produto atualizado' : 'Produto cadastrado', desc: patch.nome })
      setEditando(null)
      setNovo(false)
      recarregar()
    } catch (e) {
      notify({ kind: 'error', title: 'Não foi possível salvar', desc: (e as Error).message })
    }
  }

  const alternarAtivo = async (p: Produto) => {
    try {
      await setProdutoAtivo(p.id, !p.ativo)
      notify({ kind: 'info', title: p.ativo ? 'Produto inativado' : 'Produto reativado', desc: p.nome })
      recarregar()
    } catch (e) {
      notify({ kind: 'error', title: 'Não foi possível alterar', desc: (e as Error).message })
    }
  }

  return (
    <div className="mx-auto max-w-content">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-xl font-semibold text-ink">Produtos</h1>
          <p className="text-sm text-muted">Catálogo de peças e valores usados na montagem da venda.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge color="#15805A">{ativos} ativos</Badge>
          <Badge>{produtos.length} no total</Badge>
          <Btn variant="accent" sm onClick={() => setNovo(true)}><Ico n="plus" s={15} /> Novo produto</Btn>
        </div>
      </div>

      <Card className="mb-4 flex flex-wrap items-end gap-3 p-3">
        <div className="w-64"><Field label="Buscar"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Produto, cor ou tecido…" /></Field></div>
        <div className="w-52"><Field label="Categoria"><Select value={fCat} onChange={(e) => setFCat(e.target.value)}><option value="all">Todas</option>{categorias.map((c) => <option key={c}>{c}</option>)}</Select></Field></div>
        <label className="mb-2 flex cursor-pointer items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={mostrarInativos} onChange={(e) => setMostrarInativos(e.target.checked)} />
          Mostrar inativos
        </label>
        <span className="mb-2 ml-auto text-xs text-muted tnum">{lista.length} exibidos</span>
      </Card>

      {erro && <div className="mb-4 rounded-xl border border-neg/30 bg-neg/5 px-4 py-3 text-sm text-neg">{erro}</div>}

      <Card className="overflow-hidden">
        <div className="max-h-[calc(100vh-320px)] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-line bg-paper text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-2.5 font-semibold">Produto</th>
                <th className="px-4 py-2.5 font-semibold">Categoria</th>
                <th className="px-4 py-2.5 font-semibold">Cor</th>
                <th className="px-4 py-2.5 font-semibold">Tecido</th>
                <th className="px-4 py-2.5 text-right font-semibold">Valor/peça</th>
                <th className="px-4 py-2.5 text-center font-semibold">Situação</th>
                <th className="px-4 py-2.5 text-right font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-muted">Carregando produtos…</td></tr>
              ) : lista.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-muted">Nenhum produto encontrado.</td></tr>
              ) : (
                lista.map((p) => (
                  <tr key={p.id} className={`border-b border-line last:border-0 ${p.ativo ? '' : 'opacity-60'}`}>
                    <td className="px-4 py-2.5 font-medium text-ink">{p.nome}</td>
                    <td className="px-4 py-2.5 text-muted">{p.categoria}</td>
                    <td className="px-4 py-2.5 text-muted">{p.cor}</td>
                    <td className="px-4 py-2.5 text-muted">{p.tecido}</td>
                    <td className="px-4 py-2.5 text-right tnum text-ink">{brl(p.valorUnitario)}</td>
                    <td className="px-4 py-2.5 text-center"><Badge color={p.ativo ? '#15805A' : '#64748B'}>{p.ativo ? 'Ativo' : 'Inativo'}</Badge></td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-2">
                        <Btn variant="secondary" sm onClick={() => setEditando(p)}>Editar</Btn>
                        <Btn variant="ghost" sm onClick={() => alternarAtivo(p)}>{p.ativo ? 'Inativar' : 'Reativar'}</Btn>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {(novo || editando) && (
        <ProdutoModal produto={editando} categorias={categorias} onClose={() => { setNovo(false); setEditando(null) }} onSave={salvar} />
      )}
    </div>
  )
}

function ProdutoModal({
  produto,
  categorias,
  onClose,
  onSave,
}: {
  produto: Produto | null
  categorias: string[]
  onClose: () => void
  onSave: (patch: { categoria: string; nome: string; cor: string; tecido: string; valorUnitario: number }, id?: string) => void
}) {
  const [categoria, setCategoria] = useState(produto?.categoria ?? categorias[0] ?? 'Operacional')
  const [nome, setNome] = useState(produto?.nome ?? '')
  const [cor, setCor] = useState(produto?.cor ?? '')
  const [tecido, setTecido] = useState(produto?.tecido ?? '')
  const [valor, setValor] = useState(produto ? String(produto.valorUnitario) : '')
  const ok = nome.trim().length > 0 && valor !== '' && Number(valor) >= 0

  return (
    <Modal
      title={produto ? 'Editar produto' : 'Novo produto'}
      subtitle="Categoria, nome, cor, tecido e valor de venda por peça"
      width={520}
      onClose={onClose}
      footer={<><Btn variant="ghost" onClick={onClose}>Cancelar</Btn><Btn variant="accent" disabled={!ok} onClick={() => onSave({ categoria, nome: nome.trim(), cor: cor.trim(), tecido: tecido.trim(), valorUnitario: Number(valor) || 0 }, produto?.id)}>Salvar</Btn></>}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Categoria"><Select value={categoria} onChange={(e) => setCategoria(e.target.value)}>{[...new Set([...categorias, categoria])].map((c) => <option key={c}>{c}</option>)}</Select></Field>
        <Field label="Valor por peça (R$)"><Input type="number" min={0} step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" /></Field>
        <Field label="Nome do produto" className="col-span-2"><Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: CAMISA POLO MASCULINA MANGA CURTA" /></Field>
        <Field label="Cor"><Input value={cor} onChange={(e) => setCor(e.target.value)} placeholder="Ex.: TODAS AS CORES" /></Field>
        <Field label="Tecido"><Input value={tecido} onChange={(e) => setTecido(e.target.value)} placeholder="Ex.: PIQUET PV" /></Field>
      </div>
    </Modal>
  )
}
