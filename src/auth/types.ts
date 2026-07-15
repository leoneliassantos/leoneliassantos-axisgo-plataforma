export type Role = 'admin' | 'user'

export interface AppUser {
  id: string
  email: string
  nome: string
  role: Role
}

export interface NovoUsuario {
  nome: string
  email: string
  senha: string
  role: Role
}

export type AuthMode = 'supabase' | 'demo'
