import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import type { AppUser, AuthMode, NovoUsuario, Role } from './types'

interface AuthContextValue {
  user: AppUser | null
  loading: boolean
  mode: AuthMode
  signIn: (email: string, senha: string) => Promise<{ error?: string }>
  signOut: () => Promise<void>
  createUser: (dados: NovoUsuario) => Promise<{ error?: string }>
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
  { id: 'u-admin', nome: 'Administrador', email: 'admin@axisgo.com.br', role: 'admin', senha: 'admin123' },
  { id: 'u-user', nome: 'Usuário Padrão', email: 'user@axisgo.com.br', role: 'user', senha: 'user123' },
]

function demoLoadUsers(): DemoUser[] {
  const raw = localStorage.getItem(DEMO_USERS_KEY)
  if (!raw) {
    localStorage.setItem(DEMO_USERS_KEY, JSON.stringify(SEED))
    return SEED
  }
  try {
    return JSON.parse(raw) as DemoUser[]
  } catch {
    localStorage.setItem(DEMO_USERS_KEY, JSON.stringify(SEED))
    return SEED
  }
}

function demoSaveUsers(users: DemoUser[]) {
  localStorage.setItem(DEMO_USERS_KEY, JSON.stringify(users))
}

const strip = (u: DemoUser): AppUser => ({ id: u.id, nome: u.nome, email: u.email, role: u.role })

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
          if (found && active) setUser(strip(found))
        }
        if (active) setLoading(false)
        return
      }

      // modo supabase
      const { data } = await supabase!.auth.getSession()
      if (data.session?.user) {
        const perfil = await fetchPerfil(data.session.user.id, data.session.user.email ?? '')
        if (active) setUser(perfil)
      }
      if (active) setLoading(false)

      supabase!.auth.onAuthStateChange(async (_event, session) => {
        if (session?.user) {
          const perfil = await fetchPerfil(session.user.id, session.user.email ?? '')
          if (active) setUser(perfil)
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
      .select('nome, role')
      .eq('id', id)
      .single()
    return {
      id,
      email,
      nome: (data?.nome as string) ?? email,
      role: ((data?.role as Role) ?? 'user'),
    }
  }

  async function signIn(email: string, senha: string): Promise<{ error?: string }> {
    if (mode === 'demo') {
      const found = demoLoadUsers().find(
        (u) => u.email.toLowerCase() === email.trim().toLowerCase() && u.senha === senha,
      )
      if (!found) return { error: 'E-mail ou senha inválidos.' }
      localStorage.setItem(DEMO_SESSION_KEY, found.id)
      setUser(strip(found))
      return {}
    }

    const { data, error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password: senha })
    if (error) return { error: traduzErro(error.message) }
    if (data.user) setUser(await fetchPerfil(data.user.id, data.user.email ?? ''))
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
        senha: dados.senha,
      })
      demoSaveUsers(users)
      return {}
    }

    // modo supabase: criação de usuário por admin exige service_role (servidor).
    // Fica encapsulado numa Edge Function `admin-create-user` (ver supabase/README).
    const { error } = await supabase!.functions.invoke('admin-create-user', { body: dados })
    if (error) return { error: 'Não foi possível criar o usuário. Verifique a Edge Function admin-create-user.' }
    return {}
  }

  async function listUsers(): Promise<AppUser[]> {
    if (mode === 'demo') return demoLoadUsers().map(strip)
    const { data } = await supabase!.from('profiles').select('id, email, nome, role').order('nome')
    return (data as AppUser[]) ?? []
  }

  const value = useMemo(
    () => ({ user, loading, mode, signIn, signOut, createUser, listUsers }),
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
