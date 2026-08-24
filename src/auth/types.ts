// 'user' é legado (bases antigas): tratado como Diretoria nas permissões.
export type Role = 'admin' | 'diretoria' | 'operacoes' | 'acabamento' | 'user'

/** Perfis oferecidos ao criar/editar usuários (o legado 'user' não aparece na lista). */
export const ROLES: Role[] = ['admin', 'diretoria', 'operacoes', 'acabamento']

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin',
  diretoria: 'Diretoria',
  operacoes: 'Operações',
  acabamento: 'Acabamento',
  user: 'Usuário',
}

export const ROLE_DESC: Record<Role, string> = {
  admin: 'Acesso total, incluindo gestão de usuários.',
  diretoria: 'Acesso total, menos criação de usuários.',
  operacoes: 'Como Diretoria, mas não vê os valores de venda dos itens/pedidos (vê e preenche oficina e logomarca).',
  acabamento: 'Como Operações, mas não vê nenhum valor (venda, oficina ou logomarca).',
  user: 'Perfil antigo — equivale à Diretoria.',
}

/** Só o Admin gerencia usuários. */
export function podeGerenciarUsuarios(role: Role): boolean {
  return role === 'admin'
}
/** Valor de VENDA do item/pedido — Admin e Diretoria (legado 'user' também). */
export function podeVerValorVenda(role: Role): boolean {
  return role === 'admin' || role === 'diretoria' || role === 'user'
}
/** Valores de FORNECEDOR (oficina e logomarca) — todos menos Acabamento. */
export function podeVerValorFornecedor(role: Role): boolean {
  return role !== 'acabamento'
}

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
