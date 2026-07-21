import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export function Login() {
  const { user, signIn, mode } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)

  if (user) return <Navigate to="/" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setErro('')
    setCarregando(true)
    const { error } = await signIn(email, senha)
    setCarregando(false)
    if (error) {
      setErro(error)
      return
    }
    navigate('/', { replace: true })
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* Painel de marca */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-band p-12 text-paper lg:flex">
        <div className="absolute inset-x-12 bottom-0 h-0.5 bg-gradient-to-r from-copper to-transparent" />
        <div className="flex items-baseline gap-3">
          <span className="font-serif text-2xl font-semibold">AxisGo</span>
          <span className="text-[11px] uppercase tracking-[0.2em] text-copper">Plataforma BTO</span>
        </div>
        <div className="max-w-md">
          <h1 className="font-serif text-4xl font-semibold leading-tight text-paper">
            Todos os dados da sua operação, num só ambiente.
          </h1>
          <p className="mt-4 text-paper/70">
            Comercial, Operações e Financeiro centralizados — com indicadores gerados a partir da sua
            própria base. Business Transformation Outsourcing.
          </p>
        </div>
        <div className="text-xs text-paper/50">Ambiente seguro · acesso restrito</div>
      </div>

      {/* Formulário */}
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <span className="font-serif text-2xl font-semibold text-ink">AxisGo</span>
          </div>
          <h2 className="font-serif text-2xl font-semibold text-ink">Entrar</h2>
          <p className="mt-1 text-sm text-muted">Informe seu usuário e senha para acessar a plataforma.</p>

          <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-semibold uppercase tracking-wide text-muted">E-mail</span>
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-lg border border-line bg-surface px-3.5 py-2.5 text-ink outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/20"
                placeholder="voce@empresa.com.br"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-semibold uppercase tracking-wide text-muted">Senha</span>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="rounded-lg border border-line bg-surface px-3.5 py-2.5 text-ink outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/20"
                placeholder="••••••••"
              />
            </label>

            {erro && (
              <div className="rounded-lg border border-neg/30 bg-neg/5 px-3.5 py-2.5 text-sm text-neg">{erro}</div>
            )}

            <button
              type="submit"
              disabled={carregando}
              className="mt-2 rounded-lg bg-teal px-4 py-2.5 font-semibold text-white transition hover:bg-band disabled:opacity-60"
            >
              {carregando ? 'Entrando…' : 'Entrar'}
            </button>
          </form>

          {mode === 'demo' && (
            <div className="mt-8 rounded-lg border border-copper/30 bg-copper/5 p-4 text-[13px] text-ink/80">
              <div className="mb-1 font-semibold text-copper">Modo demonstração</div>
              <p className="text-muted">
                Use as credenciais de teste:
              </p>
              <ul className="mt-2 space-y-1 font-mono text-[12px]">
                <li>leon.santos@axisgo.com.br · admin123 <span className="text-copper">(admin)</span></li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
