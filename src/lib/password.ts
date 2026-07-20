export interface RegraSenha {
  chave: keyof ForcaSenha['requisitos']
  label: string
  ok: boolean
}

export interface ForcaSenha {
  score: number // 0..5
  nivel: 'vazia' | 'fraca' | 'media' | 'forte'
  ok: boolean // atende a todos os requisitos mínimos
  requisitos: {
    tamanho: boolean
    minuscula: boolean
    maiuscula: boolean
    numero: boolean
    especial: boolean
  }
}

export function avaliarSenha(senha: string): ForcaSenha {
  const requisitos = {
    tamanho: senha.length >= 8,
    minuscula: /[a-z]/.test(senha),
    maiuscula: /[A-Z]/.test(senha),
    numero: /\d/.test(senha),
    especial: /[^A-Za-z0-9]/.test(senha),
  }
  const score = Object.values(requisitos).filter(Boolean).length
  const ok = Object.values(requisitos).every(Boolean)

  let nivel: ForcaSenha['nivel'] = 'fraca'
  if (senha.length === 0) nivel = 'vazia'
  else if (ok) nivel = 'forte'
  else if (score >= 3) nivel = 'media'

  return { score, nivel, ok, requisitos }
}

export const REGRAS_SENHA: { chave: keyof ForcaSenha['requisitos']; label: string }[] = [
  { chave: 'tamanho', label: 'Mínimo de 8 caracteres' },
  { chave: 'minuscula', label: 'Letra minúscula (a–z)' },
  { chave: 'maiuscula', label: 'Letra maiúscula (A–Z)' },
  { chave: 'numero', label: 'Número (0–9)' },
  { chave: 'especial', label: 'Caractere especial (!@#$…)' },
]
