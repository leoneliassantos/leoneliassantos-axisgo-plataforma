export type Role = 'admin' | 'user'

export interface AppUser {
  id: string
  email: string
  nome: string
  role: Role
  bloqueado: boolean
}

export interface NovoUsuario {
  nome: string
  email: string
  senha: string
  role: Role
}

/** Campos editáveis. Admin pode todos; o próprio usuário só nome/email/senha. */
export interface PatchUsuario {
  nome?: string
  email?: string
  senha?: string
  role?: Role
  bloqueado?: boolean
}

export type AuthMode = 'supabase' | 'demo'
