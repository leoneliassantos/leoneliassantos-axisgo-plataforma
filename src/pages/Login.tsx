import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { CLIENT } from '../config/client'

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
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* ---------- Painel de marca (AxisGo) ---------- */}
      <div className="relative hidden flex-col justify-between overflow-hidden p-12 text-paper lg:flex">
        {/* Gradiente da marca: navy → teal → ciano */}
        <div className="absolute inset-0 bg-gradient-to-br from-band2 via-band to-teal" />
        {/* Brilhos decorativos em ciano */}
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-cyan/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-teal/30 blur-3xl" />
        <div className="absolute inset-x-12 bottom-0 h-px bg-gradient-to-r from-cyan/70 to-transparent" />

        <div className="relative">
          <img src="/axisgo-logo.webp" alt="AxisGo" className="h-12 w-auto" />
        </div>

        <div className="relative max-w-md">
          <div className="mb-3 text-[12px] font-semibold uppercase tracking-[0.2em] text-cyan">
            Plataforma BTO
          </div>
          <h1 className="font-serif text-[2.6rem] font-semibold leading-[1.1] text-paper">
            Gestão financeira que impulsiona resultados.
          </h1>
          <p className="mt-5 max-w-sm text-paper/70">
            Comercial, Operações e Financeiro num só ambiente — com indicadores gerados a partir da sua
            própria base. Business Transformation Outsourcing.
          </p>
        </div>

        <div className="relative flex items-center gap-3 text-sm text-paper/60">
          <span className="inline-flex h-2 w-2 rounded-full bg-cyan" />
          Ambiente <span className="font-semibold text-paper">{CLIENT.nome}</span> · acesso restrito
        </div>
      </div>

      {/* ---------- Formulário ---------- */}
      <div className="flex items-center justify-center bg-paper px-6 py-12">
        <div className="w-full max-w-sm">
          {/* Logo no topo (mobile) — em chip escuro para o wordmark aparecer */}
          <div className="mb-8 inline-flex rounded-xl bg-band px-4 py-3 lg:hidden">
            <img src="/axisgo-logo.webp" alt="AxisGo" className="h-8 w-auto" />
          </div>

          <div className="text-[12px] font-semibold uppercase tracking-[0.16em] text-teal">
            AxisGo · Ambiente {CLIENT.nome}
          </div>
          <h2 className="mt-1.5 font-serif text-3xl font-semibold text-ink">Entrar</h2>
          <p className="mt-1.5 text-sm text-muted">Informe seu usuário e senha para acessar a plataforma.</p>

          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-semibold uppercase tracking-wide text-muted">E-mail</span>
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-lg border border-line bg-surface px-3.5 py-2.5 text-ink outline-none transition focus:border-teal focus:ring-2 focus:ring-cyan/30"
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
                className="rounded-lg border border-line bg-surface px-3.5 py-2.5 text-ink outline-none transition focus:border-teal focus:ring-2 focus:ring-cyan/30"
                placeholder="••••••••"
              />
            </label>

            {erro && (
              <div className="rounded-lg border border-neg/30 bg-neg/5 px-3.5 py-2.5 text-sm text-neg">{erro}</div>
            )}

            <button
              type="submit"
              disabled={carregando}
              className="mt-2 rounded-lg bg-gradient-to-r from-teal to-cyan px-4 py-2.5 font-semibold text-white shadow-sm transition hover:brightness-95 disabled:opacity-60"
            >
              {carregando ? 'Entrando…' : 'Entrar'}
            </button>
          </form>

          {mode === 'demo' && (
            <div className="mt-8 rounded-lg border border-teal/25 bg-teal-tint/60 p-4 text-[13px] text-ink/80">
              <div className="mb-1 font-semibold text-teal">Modo demonstração</div>
              <p className="text-muted">Use as credenciais de teste:</p>
              <ul className="mt-2 space-y-1 font-mono text-[12px]">
                <li>leon.santos@axisgo.com.br · admin123 <span className="text-teal">(admin)</span></li>
              </ul>
            </div>
          )}

          <div className="mt-10 text-center text-[11px] text-muted">
            © AxisGo · Business Transformation Outsourcing
          </div>
        </div>
      </div>
    </div>
  )
}
