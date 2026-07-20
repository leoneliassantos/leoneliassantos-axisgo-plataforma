import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { avaliarSenha } from '../lib/password'
import type { AppUser, AuthMode, NovoUsuario, PatchUsuario, Role } from './types'

interface AuthContextValue {
  user: AppUser | null
  loading: boolean
  mode: AuthMode
  signIn: (email: string, senha: string) => Promise<{ error?: string }>
  signOut: () => Promise<void>
  createUser: (dados: NovoUsuario) => Promise<{ error?: string }>
  updateUser: (id: string, patch: PatchUsuario) => Promise<{ error?: string }>
  listUsers: () => Promise<AppUser[]>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

/* ------------------------------------------------------------------ *
 * Modo DEMO (localStorage) — usado enquanto o Supabase não está ligado
 * ------------------------------------------------------------------ */
const DEMO_USERS_KEY = 'axg_demo_users'
const DEMO_SESSION_KEY = 'axg_demo_session'

interface DemoUser extends AppUser {
  senha: string
}

const SEED: DemoUser[] = [
  { id: 'u-admin', nome: 'Administrador', email: 'admin@axisgo.com.br', role: 'admin', bloqueado: false, senha: 'admin123' },
  { id: 'u-user', nome: 'Usuário Padrão', email: 'user@axisgo.com.br', role: 'user', bloqueado: false, senha: 'user123' },
]

function demoLoadUsers(): DemoUser[] {
  const raw = localStorage.getItem(DEMO_USERS_KEY)
  if (!raw) {
    localStorage.setItem(DEMO_USERS_KEY, JSON.stringify(SEED))
    return SEED
  }
  try {
    const parsed = JSON.parse(raw) as DemoUser[]
    // Compatibilidade: garante o campo `bloqueado` em bases antigas.
    return parsed.map((u) => ({ ...u, bloqueado: u.bloqueado ?? false }))
  } catch {
    localStorage.setItem(DEMO_USERS_KEY, JSON.stringify(SEED))
    return SEED
  }
}

function demoSaveUsers(users: DemoUser[]) {
  localStorage.setItem(DEMO_USERS_KEY, JSON.stringify(users))
}

const strip = (u: DemoUser): AppUser => ({
  id: u.id,
  nome: u.nome,
  email: u.email,
  role: u.role,
  bloqueado: u.bloqueado,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)
  const mode: AuthMode = isSupabaseConfigured ? 'supabase' : 'demo'

  useEffect(() => {
    let active = true

    async function boot() {
      if (mode === 'demo') {
        const sessionId = localStorage.getItem(DEMO_SESSION_KEY)
        if (sessionId) {
          const found = demoLoadUsers().find((u) => u.id === sessionId)
          if (found && !found.bloqueado && active) setUser(strip(found))
        }
        if (active) setLoading(false)
        return
      }

      const { data } = await supabase!.auth.getSession()
      if (data.session?.user) {
        const perfil = await fetchPerfil(data.session.user.id, data.session.user.email ?? '')
        if (perfil.bloqueado) {
          await supabase!.auth.signOut()
        } else if (active) {
          setUser(perfil)
        }
      }
      if (active) setLoading(false)

      supabase!.auth.onAuthStateChange(async (_event, session) => {
        if (session?.user) {
          const perfil = await fetchPerfil(session.user.id, session.user.email ?? '')
          if (active) setUser(perfil.bloqueado ? null : perfil)
        } else if (active) {
          setUser(null)
        }
      })
    }

    boot()
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function fetchPerfil(id: string, email: string): Promise<AppUser> {
    const { data } = await supabase!
      .from('profiles')
      .select('nome, role, bloqueado')
      .eq('id', id)
      .single()
    return {
      id,
      email,
      nome: (data?.nome as string) ?? email,
      role: ((data?.role as Role) ?? 'user'),
      bloqueado: Boolean(data?.bloqueado),
    }
  }

  async function signIn(email: string, senha: string): Promise<{ error?: string }> {
    if (mode === 'demo') {
      const found = demoLoadUsers().find((u) => u.email.toLowerCase() === email.trim().toLowerCase())
      if (!found || found.senha !== senha) return { error: 'E-mail ou senha inválidos.' }
      if (found.bloqueado) return { error: 'Usuário bloqueado. Contate o administrador.' }
      localStorage.setItem(DEMO_SESSION_KEY, found.id)
      setUser(strip(found))
      return {}
    }

    const { data, error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password: senha })
    if (error) return { error: traduzErro(error.message) }
    if (data.user) {
      const perfil = await fetchPerfil(data.user.id, data.user.email ?? '')
      if (perfil.bloqueado) {
        await supabase!.auth.signOut()
        return { error: 'Usuário bloqueado. Contate o administrador.' }
      }
      setUser(perfil)
    }
    return {}
  }

  async function signOut() {
    if (mode === 'demo') {
      localStorage.removeItem(DEMO_SESSION_KEY)
      setUser(null)
      return
    }
    await supabase!.auth.signOut()
    setUser(null)
  }

  async function createUser(dados: NovoUsuario): Promise<{ error?: string }> {
    if (user?.role !== 'admin') return { error: 'Apenas administradores podem criar usuários.' }
    if (!avaliarSenha(dados.senha).ok) {
      return { error: 'A senha não atende aos requisitos mínimos de segurança.' }
    }

    if (mode === 'demo') {
      const users = demoLoadUsers()
      if (users.some((u) => u.email.toLowerCase() === dados.email.trim().toLowerCase())) {
        return { error: 'Já existe um usuário com esse e-mail.' }
      }
      users.push({
        id: crypto.randomUUID(),
        nome: dados.nome.trim(),
        email: dados.email.trim(),
        role: dados.role,
        bloqueado: false,
        senha: dados.senha,
      })
      demoSaveUsers(users)
      return {}
    }

    const { error } = await supabase!.functions.invoke('admin-create-user', { body: dados })
    if (error) return { error: 'Não foi possível criar o usuário. Verifique a Edge Function admin-create-user.' }
    return {}
  }

  async function updateUser(id: string, patch: PatchUsuario): Promise<{ error?: string }> {
    const isAdmin = user?.role === 'admin'
    const isSelf = user?.id === id
    if (!isAdmin && !isSelf) return { error: 'Você não tem permissão para alterar este usuário.' }

    // Usuário comum não altera perfil nem status de bloqueio.
    const dados: PatchUsuario = { ...patch }
    if (!isAdmin) {
      delete dados.role
      delete dados.bloqueado
    }

    // Salvaguardas: admin não pode se autobloquear nem se rebaixar (evita lockout).
    if (isAdmin && isSelf) {
      if (dados.bloqueado === true) return { error: 'Você não pode bloquear a própria conta.' }
      if (dados.role && dados.role !== 'admin') {
        return { error: 'Você não pode remover o próprio acesso de administrador.' }
      }
    }

    if (dados.senha !== undefined && dados.senha !== '') {
      if (!avaliarSenha(dados.senha).ok) {
        return { error: 'A senha não atende aos requisitos mínimos de segurança.' }
      }
    }

    if (mode === 'demo') {
      const users = demoLoadUsers()
      const idx = users.findIndex((u) => u.id === id)
      if (idx === -1) return { error: 'Usuário não encontrado.' }

      if (dados.email) {
        const emailEmUso = users.some(
          (u) => u.id !== id && u.email.toLowerCase() === dados.email!.trim().toLowerCase(),
        )
        if (emailEmUso) return { error: 'Já existe um usuário com esse e-mail.' }
      }

      const atual = users[idx]
      users[idx] = {
        ...atual,
        nome: dados.nome?.trim() ?? atual.nome,
        email: dados.email?.trim() ?? atual.email,
        role: dados.role ?? atual.role,
        bloqueado: dados.bloqueado ?? atual.bloqueado,
        senha: dados.senha && dados.senha !== '' ? dados.senha : atual.senha,
      }
      demoSaveUsers(users)

      // Reflete no usuário logado, se for ele mesmo.
      if (isSelf) {
        if (users[idx].bloqueado) {
          localStorage.removeItem(DEMO_SESSION_KEY)
          setUser(null)
        } else {
          setUser(strip(users[idx]))
        }
      }
      return {}
    }

    // modo supabase
    if (isSelf) {
      // Nome vai no perfil (RLS permite editar o próprio); e-mail/senha no Auth.
      if (dados.nome !== undefined) {
        const { error } = await supabase!.from('profiles').update({ nome: dados.nome.trim() }).eq('id', id)
        if (error) return { error: 'Não foi possível salvar as alterações.' }
      }
      if (dados.email || (dados.senha && dados.senha !== '')) {
        const { error } = await supabase!.auth.updateUser({
          email: dados.email?.trim(),
          password: dados.senha && dados.senha !== '' ? dados.senha : undefined,
        })
        if (error) return { error: traduzErro(error.message) }
      }
      setUser(await fetchPerfil(id, dados.email?.trim() ?? user!.email))
      return {}
    }

    // Admin editando terceiros → Edge Function segura (usa service_role no servidor).
    const { error } = await supabase!.functions.invoke('admin-update-user', { body: { id, ...dados } })
    if (error) return { error: 'Não foi possível salvar. Verifique a Edge Function admin-update-user.' }
    return {}
  }

  async function listUsers(): Promise<AppUser[]> {
    if (mode === 'demo') return demoLoadUsers().map(strip)
    const { data } = await supabase!.from('profiles').select('id, email, nome, role, bloqueado').order('nome')
    return (data as AppUser[]) ?? []
  }

  const value = useMemo(
    () => ({ user, loading, mode, signIn, signOut, createUser, updateUser, listUsers }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, loading, mode],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

function traduzErro(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha inválidos.'
  if (/email not confirmed/i.test(msg)) return 'E-mail ainda não confirmado.'
  return msg
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>')
  return ctx
}
