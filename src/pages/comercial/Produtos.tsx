/**
 * Gestão de Produtos do Comercial — catálogo com valor por peça.
 * Cadastrar, alterar valor, inativar/reativar. Alimenta o seletor de produtos
 * do CRM (montagem da venda / futura proposta).
 *
 * Dados no mesmo store local do Comercial (localStorage). Migra para o Supabase
 * junto com os leads quando o perfil estiver fechado.
 */
import { useMemo, useState } from 'react'
import { Modal } from '../operacoes/Modal'
import { Badge, Btn, Card, Field, Ico, Input, ToastProvider, useToast } from './ui'
import { brl, uid, useComercialStore, type ComercialDB, type Produto } from './data'

export function Produtos() {
  return (
    <ToastProvider>
      <ProdutosScreen />
    </ToastProvider>
  )
}

function ProdutosScreen() {
  const { db, update } = useComercialStore()
  const { notify } = useToast()
  const [q, setQ] = useState('')
  const [mostrarInativos, setMostrarInativos] = useState(true)
  const [editando, setEditando] = useState<Produto | null>(null)
  const [novo, setNovo] = useState(false)

  const lista = useMemo(() => {
    const termo = q.trim().toLowerCase()
    return db.produtos
      .filter((p) => (mostrarInativos ? true : p.ativo))
      .filter((p) => !termo || p.nome.toLowerCase().includes(termo))
      .sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome))
  }, [db.produtos, q, mostrarInativos])

  const ativos = db.produtos.filter((p) => p.ativo).length

  const salvar = (nome: string, valor: number, id?: string) => {
    update((d: ComercialDB) => {
      if (id) {
        const p = d.produtos.find((x) => x.id === id)
        if (p) { p.nome = nome; p.valorUnitario = valor }
      } else {
        d.produtos.unshift({ id: uid(), nome, valorUnitario: valor, ativo: true })
      }
    })
    notify({ title: id ? 'Produto atualizado' : 'Produto cadastrado', desc: nome })
    setEditando(null)
    setNovo(false)
  }

  const alternarAtivo = (p: Produto) => {
    update((d) => { const it = d.produtos.find((x) => x.id === p.id); if (it) it.ativo = !it.ativo })
    notify({ kind: 'info', title: p.ativo ? 'Produto inativado' : 'Produto reativado', desc: p.nome })
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
          <Btn variant="accent" sm onClick={() => setNovo(true)}><Ico n="plus" s={15} /> Novo produto</Btn>
        </div>
      </div>

      <Card className="mb-4 flex flex-wrap items-end gap-3 p-3">
        <div className="w-64"><Field label="Buscar"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome do produto…" /></Field></div>
        <label className="mb-2 flex cursor-pointer items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={mostrarInativos} onChange={(e) => setMostrarInativos(e.target.checked)} />
          Mostrar inativos
        </label>
      </Card>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-paper/60 text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-2.5 font-semibold">Produto</th>
              <th className="px-4 py-2.5 text-right font-semibold">Valor por peça</th>
              <th className="px-4 py-2.5 text-center font-semibold">Situação</th>
              <th className="px-4 py-2.5 text-right font-semibold">Ações</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((p) => (
              <tr key={p.id} className={`border-b border-line last:border-0 ${p.ativo ? '' : 'opacity-60'}`}>
                <td className="px-4 py-2.5 font-medium text-ink">{p.nome}</td>
                <td className="px-4 py-2.5 text-right tnum text-ink">{brl(p.valorUnitario)}</td>
                <td className="px-4 py-2.5 text-center">
                  <Badge color={p.ativo ? '#15805A' : '#64748B'}>{p.ativo ? 'Ativo' : 'Inativo'}</Badge>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex justify-end gap-2">
                    <Btn variant="secondary" sm onClick={() => setEditando(p)}>Editar</Btn>
                    <Btn variant="ghost" sm onClick={() => alternarAtivo(p)}>{p.ativo ? 'Inativar' : 'Reativar'}</Btn>
                  </div>
                </td>
              </tr>
            ))}
            {lista.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-muted">Nenhum produto encontrado.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      {(novo || editando) && (
        <ProdutoModal
          produto={editando}
          onClose={() => { setNovo(false); setEditando(null) }}
          onSave={salvar}
        />
      )}
    </div>
  )
}

function ProdutoModal({
  produto,
  onClose,
  onSave,
}: {
  produto: Produto | null
  onClose: () => void
  onSave: (nome: string, valor: number, id?: string) => void
}) {
  const [nome, setNome] = useState(produto?.nome ?? '')
  const [valor, setValor] = useState(produto ? String(produto.valorUnitario) : '')
  const ok = nome.trim().length > 0 && Number(valor) >= 0 && valor !== ''
  return (
    <Modal
      title={produto ? 'Editar produto' : 'Novo produto'}
      subtitle="Nome e valor de venda por peça"
      width={440}
      onClose={onClose}
      footer={<><Btn variant="ghost" onClick={onClose}>Cancelar</Btn><Btn variant="accent" disabled={!ok} onClick={() => onSave(nome.trim(), Number(valor) || 0, produto?.id)}>Salvar</Btn></>}
    >
      <div className="grid gap-3">
        <Field label="Nome do produto"><Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Camisa polo piquê (bordada)" /></Field>
        <Field label="Valor por peça (R$)"><Input type="number" min={0} step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" /></Field>
      </div>
    </Modal>
  )
}
