/**
 * Catálogo de Produtos do Comercial — persistido no Supabase (tabela
 * crm_produtos). Segue o mesmo padrão do módulo Operações: usa o Supabase
 * quando configurado; senão cai num fallback local (demo/dev).
 *
 * A carga inicial dos 395 itens da "Tabela de Vendas" (sheets Malharia e Blusa
 * de Lã, Social, Operacional) é feita pelo SQL entregue à parte.
 */
import { isSupabaseConfigured, supabase } from '../../lib/supabase'
import { uid, type Produto } from './data'

const isDemo = !isSupabaseConfigured
const DEMO_KEY = 'axg_comercial_produtos_demo'

type Row = {
  id: string
  categoria: string | null
  nome: string
  cor: string | null
  tecido: string | null
  valor_unitario: number | string | null
  ativo: boolean | null
}

const COLS = 'id, categoria, nome, cor, tecido, valor_unitario, ativo'

function mapRow(r: Row): Produto {
  return {
    id: r.id,
    categoria: r.categoria ?? '',
    nome: r.nome,
    cor: r.cor ?? '',
    tecido: r.tecido ?? '',
    valorUnitario: Number(r.valor_unitario) || 0,
    ativo: r.ativo !== false,
  }
}

/* ------------------------------ demo/local ------------------------------ */

function demoSeed(): Produto[] {
  return [
    { id: uid(), categoria: 'Operacional', nome: 'CAMISA POLO PIQUET', cor: 'TODAS AS CORES', tecido: 'PIQUET PV', valorUnitario: 48, ativo: true },
    { id: uid(), categoria: 'Operacional', nome: 'CAMISETA MALHA', cor: 'TODAS AS CORES', tecido: 'PV', valorUnitario: 29, ativo: true },
    { id: uid(), categoria: 'Social', nome: 'CAMISA SOCIAL MANGA LONGA', cor: 'BRANCO', tecido: 'DOPTEX', valorUnitario: 76.82, ativo: true },
  ]
}
function demoLoad(): Produto[] {
  try {
    const raw = localStorage.getItem(DEMO_KEY)
    if (raw) return JSON.parse(raw) as Produto[]
  } catch {
    /* ignore */
  }
  const seed = demoSeed()
  demoSave(seed)
  return seed
}
function demoSave(list: Produto[]) {
  try {
    localStorage.setItem(DEMO_KEY, JSON.stringify(list))
  } catch {
    /* ignore */
  }
}

/* ------------------------------ API ------------------------------ */

export async function loadProdutos(): Promise<Produto[]> {
  if (isDemo) {
    return demoLoad().sort((a, b) => a.categoria.localeCompare(b.categoria) || a.nome.localeCompare(b.nome))
  }
  const { data, error } = await supabase!
    .from('crm_produtos')
    .select(COLS)
    .order('categoria', { ascending: true })
    .order('nome', { ascending: true })
  if (error) throw new Error(error.message)
  return ((data as Row[]) ?? []).map(mapRow)
}

export interface NovoProduto {
  categoria: string
  nome: string
  cor: string
  tecido: string
  valorUnitario: number
}

export async function addProduto(p: NovoProduto): Promise<Produto> {
  if (isDemo) {
    const list = demoLoad()
    const novo: Produto = { id: uid(), ...p, ativo: true }
    demoSave([novo, ...list])
    return novo
  }
  const { data, error } = await supabase!
    .from('crm_produtos')
    .insert({ categoria: p.categoria, nome: p.nome, cor: p.cor, tecido: p.tecido, valor_unitario: p.valorUnitario })
    .select(COLS)
    .single()
  if (error) throw new Error(error.message)
  return mapRow(data as Row)
}

export async function updateProduto(
  id: string,
  patch: Partial<NovoProduto>,
): Promise<void> {
  if (isDemo) {
    const list = demoLoad()
    const it = list.find((x) => x.id === id)
    if (it) Object.assign(it, patch)
    demoSave(list)
    return
  }
  const payload: Record<string, unknown> = {}
  if (patch.categoria !== undefined) payload.categoria = patch.categoria
  if (patch.nome !== undefined) payload.nome = patch.nome
  if (patch.cor !== undefined) payload.cor = patch.cor
  if (patch.tecido !== undefined) payload.tecido = patch.tecido
  if (patch.valorUnitario !== undefined) payload.valor_unitario = patch.valorUnitario
  const { error } = await supabase!.from('crm_produtos').update(payload).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function setProdutoAtivo(id: string, ativo: boolean): Promise<void> {
  if (isDemo) {
    const list = demoLoad()
    const it = list.find((x) => x.id === id)
    if (it) it.ativo = ativo
    demoSave(list)
    return
  }
  const { error } = await supabase!.from('crm_produtos').update({ ativo }).eq('id', id)
  if (error) throw new Error(error.message)
}
