import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { CLIENT } from '../config/client'

export function AppLayout() {
  const { user, mode, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSair() {
    await signOut()
    navigate('/login', { replace: true })
  }

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-3 py-1.5 text-sm font-medium transition ${
      isActive ? 'bg-brand/10 text-brand' : 'text-muted hover:text-ink'
    }`

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-surface">
        <div className="mx-auto flex h-16 w-full max-w-content items-center gap-5 px-5">
          <Link to="/" className="flex items-center">
            {CLIENT.logo ? (
              <img src={CLIENT.logo} alt={CLIENT.nome} className="h-8 w-auto" />
            ) : (
              <span className="font-serif text-lg font-semibold text-ink">{CLIENT.nome}</span>
            )}
          </Link>

          <nav className="ml-2 hidden items-center gap-1 sm:flex">
            <NavLink to="/" end className={navClass}>
              Início
            </NavLink>
            <NavLink to="/perfil" className={navClass}>
              Meu perfil
            </NavLink>
            {user?.role === 'admin' && (
              <NavLink to="/admin/usuarios" className={navClass}>
                Usuários
              </NavLink>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <Link to="/perfil" className="hidden text-right leading-tight sm:block">
              <div className="text-sm font-medium text-ink hover:underline">{user?.nome}</div>
              <div className="text-[11px] text-muted">{user?.email}</div>
            </Link>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                user?.role === 'admin' ? 'bg-brand/12 text-brand' : 'bg-paper text-muted'
              }`}
            >
              {user?.role === 'admin' ? 'Admin' : 'Usuário'}
            </span>
            <button
              type="button"
              onClick={handleSair}
              className="rounded-md border border-line px-3 py-1.5 text-sm text-ink transition hover:bg-paper"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      {mode === 'demo' && (
        <div className="bg-brand/8 text-center text-[12px] text-brand">
          <div className="mx-auto max-w-content px-5 py-1.5">
            Modo demonstração — dados salvos apenas neste navegador. Configure o Supabase para persistir em produção.
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-content flex-1 px-5 py-7">
        <Outlet />
      </main>

      <footer className="bg-band text-paper">
        <div className="mx-auto flex max-w-content flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3.5 text-xs">
          <span className="flex flex-wrap items-center gap-2 text-paper/85">
            {CLIENT.nome} - Ambiente desenvolvido por
            <img src="/axisgo-logo.webp" alt="AxisGo" className="h-5 w-auto" />
          </span>
          <span className="text-paper/70">Business Transformation Outsourcing</span>
        </div>
      </footer>
    </div>
  )
}
