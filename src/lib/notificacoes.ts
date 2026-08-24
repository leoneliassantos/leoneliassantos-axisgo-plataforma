import { supabase, isSupabaseConfigured } from './supabase'

const isDemo = !isSupabaseConfigured

export interface Notificacao {
  id: string
  deNome: string
  mensagem: string
  contexto: string
  lida: boolean
  createdAt: string
}

export interface UsuarioMencionavel {
  id: string
  nome: string
}

export interface RefNotificacao {
  opId?: string
  produtoId?: string
}

/* --------------------------- modo DEMO (localStorage) --------------------------- */
const DEMO_NOTIF_KEY = 'axg_notificacoes_demo'
const DEMO_USERS_KEY = 'axg_demo_users'
const DEMO_SESSION_KEY = 'axg_demo_session'

interface DemoNotif { id: string; userId: string; deNome: string; mensagem: string; contexto: string; lida: boolean; createdAt: string }

function demoLoad(): DemoNotif[] {
  try { return JSON.parse(localStorage.getItem(DEMO_NOTIF_KEY) || '[]') as DemoNotif[] } catch { return [] }
}
function demoSave(n: DemoNotif[]) { localStorage.setItem(DEMO_NOTIF_KEY, JSON.stringify(n)) }
const uid = () => (crypto?.randomUUID ? crypto.randomUUID() : `n-${Date.now()}-${Math.round(Math.random() * 1e6)}`)

/** Lista os usuários que podem ser mencionados (id + nome), sem expor e-mail/perfil. */
export async function listUsuariosMencionaveis(): Promise<UsuarioMencionavel[]> {
  if (isDemo) {
    try {
      const us = JSON.parse(localStorage.getItem(DEMO_USERS_KEY) || '[]') as Array<{ id: string; nome: string; bloqueado?: boolean }>
      return us.filter((u) => !u.bloqueado).map((u) => ({ id: u.id, nome: u.nome })).sort((a, b) => a.nome.localeCompare(b.nome))
    } catch { return [] }
  }
  const { data, error } = await supabase!.from('usuarios_mencionaveis').select('id, nome').order('nome')
  if (error) throw new Error(error.message)
  return (data as UsuarioMencionavel[]) ?? []
}

/** Cria uma notificação para cada usuário mencionado. */
export async function criarNotificacoes(
  destinos: string[],
  mensagem: string,
  contexto: string,
  deNome: string,
  ref?: RefNotificacao,
): Promise<void> {
  const alvos = [...new Set(destinos.filter(Boolean))]
  if (!alvos.length || !mensagem.trim()) return
  if (isDemo) {
    const all = demoLoad()
    const agora = new Date().toISOString()
    for (const u of alvos) all.push({ id: uid(), userId: u, deNome, mensagem: mensagem.trim(), contexto, lida: false, createdAt: agora })
    demoSave(all)
    return
  }
  const rows = alvos.map((u) => ({
    user_id: u, de_nome: deNome || null, mensagem: mensagem.trim(), contexto: contexto || null,
    ref_op_id: ref?.opId ?? null, ref_produto_id: ref?.produtoId ?? null,
  }))
  const { error } = await supabase!.from('notificacoes').insert(rows)
  if (error) throw new Error(error.message)
}

/** Notificações do usuário logado (mais recentes primeiro). */
export async function minhasNotificacoes(): Promise<Notificacao[]> {
  if (isDemo) {
    const meu = localStorage.getItem(DEMO_SESSION_KEY)
    return demoLoad()
      .filter((n) => n.userId === meu)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((n) => ({ id: n.id, deNome: n.deNome, mensagem: n.mensagem, contexto: n.contexto, lida: n.lida, createdAt: n.createdAt }))
  }
  const { data, error } = await supabase!
    .from('notificacoes')
    .select('id, de_nome, mensagem, contexto, lida, created_at')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw new Error(error.message)
  return (data ?? []).map((n) => ({
    id: n.id as string, deNome: (n.de_nome as string) ?? '', mensagem: n.mensagem as string,
    contexto: (n.contexto as string) ?? '', lida: !!n.lida, createdAt: n.created_at as string,
  }))
}

export async function marcarLida(id: string): Promise<void> {
  if (isDemo) {
    const all = demoLoad(); const n = all.find((x) => x.id === id); if (n) n.lida = true; demoSave(all); return
  }
  const { error } = await supabase!.from('notificacoes').update({ lida: true }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function marcarTodasLidas(): Promise<void> {
  if (isDemo) {
    const meu = localStorage.getItem(DEMO_SESSION_KEY)
    const all = demoLoad(); for (const n of all) if (n.userId === meu) n.lida = true; demoSave(all); return
  }
  // RLS garante que só as minhas linhas são atualizadas.
  const { error } = await supabase!.from('notificacoes').update({ lida: true }).eq('lida', false)
  if (error) throw new Error(error.message)
}
