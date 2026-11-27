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

/**
 * Flag ADITIVA, ligada por cliente via env no Vercel (padrão do Core).
 * Quando ON, o perfil Acabamento também enxerga os valores de FORNECEDOR
 * (oficina e logomarca). Ausente/OFF = comportamento inalterado (Acabamento
 * não vê). Hoje ligada só no ambiente da MM (VITE_ACABAMENTO_VE_CUSTOS=1).
 */
export const ACABAMENTO_VE_CUSTOS = ['1', 'true', 'sim'].includes(
  (import.meta.env.VITE_ACABAMENTO_VE_CUSTOS as string | undefined)?.trim().toLowerCase() ?? '',
)

export const ROLE_DESC: Record<Role, string> = {
  admin: 'Acesso total, incluindo gestão de usuários.',
  diretoria: 'Acesso total, menos criação de usuários.',
  operacoes: 'Como Diretoria, mas não vê os valores de venda dos itens/pedidos (vê e preenche oficina e logomarca).',
  acabamento: ACABAMENTO_VE_CUSTOS
    ? 'Como Operações: não vê valores de venda, mas vê e preenche oficina e logomarca (preenche e faz o fechamento da cobrança).'
    : 'Como Operações, mas não vê nenhum valor (venda, oficina ou logomarca).',
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
/** Valores de FORNECEDOR (oficina e logomarca). Admin, Diretoria e Operações
 *  sempre veem. Acabamento vê só quando VITE_ACABAMENTO_VE_CUSTOS está ligada
 *  (hoje, só no Vercel da MM) — Operações/Acabamento preenchem esses custos e
 *  fazem o fechamento mensal da cobrança. VENDA segue restrito (podeVerValorVenda). */
export function podeVerValorFornecedor(role: Role): boolean {
  if (role === 'acabamento') return ACABAMENTO_VE_CUSTOS
  return true
}
/** Dados financeiros da Nota Fiscal do pedido — só Admin e Diretoria. */
export function podeVerFinanceiro(role: Role): boolean {
  return role === 'admin' || role === 'diretoria'
}
/** Excluir/reativar OP e excluir item de produção — Admin e Diretoria (legado 'user' também). */
export function podeExcluirProducao(role: Role): boolean {
  return role === 'admin' || role === 'diretoria' || role === 'user'
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
