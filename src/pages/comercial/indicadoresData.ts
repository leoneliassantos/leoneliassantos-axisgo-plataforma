/**
 * Indicadores / representantes — pessoas que indicam clientes para a MM
 * (ex.: Fabíola, Antônio Rosseti). Usado quando a origem do lead é "Indicação"
 * ou "Outro", para medir quais representantes mais trazem negócio.
 *
 * Persistido no Supabase (tabela crm_indicadores), com o mesmo padrão isDemo
 * dos demais módulos (fallback localStorage em dev/sem Supabase).
 */
import { isSupabaseConfigured, supabase } from '../../lib/supabase'
import { uid } from './data'

export interface Indicador {
  id: string
  nome: string
}

const isDemo = !isSupabaseConfigured
const DEMO_KEY = 'axg_comercial_indicadores_demo'

type Row = { id: string; nome: string }

function demoLoad(): Indicador[] {
  try {
    const raw = localStorage.getItem(DEMO_KEY)
    if (raw) return JSON.parse(raw) as Indicador[]
  } catch {
    /* ignore */
  }
  return []
}
function demoSave(list: Indicador[]) {
  try {
    localStorage.setItem(DEMO_KEY, JSON.stringify(list))
  } catch {
    /* ignore */
  }
}

export async function loadIndicadores(): Promise<Indicador[]> {
  if (isDemo) return demoLoad().sort((a, b) => a.nome.localeCompare(b.nome))
  const { data, error } = await supabase!
    .from('crm_indicadores')
    .select('id, nome')
    .order('nome', { ascending: true })
  if (error) throw new Error(error.message)
  return ((data as Row[]) ?? []).map((r) => ({ id: r.id, nome: r.nome }))
}

/** Cadastra um indicador. Se já existir (mesmo nome), devolve o existente. */
export async function addIndicador(nome: string): Promise<Indicador> {
  const limpo = nome.trim()
  if (isDemo) {
    const list = demoLoad()
    const existe = list.find((x) => x.nome.toLowerCase() === limpo.toLowerCase())
    if (existe) return existe
    const novo: Indicador = { id: uid(), nome: limpo }
    demoSave([...list, novo])
    return novo
  }
  const { data, error } = await supabase!
    .from('crm_indicadores')
    .insert({ nome: limpo })
    .select('id, nome')
    .single()
  if (error) throw new Error(error.message)
  return { id: (data as Row).id, nome: (data as Row).nome }
}
