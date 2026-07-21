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

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-band text-paper">
        <div className="mx-auto flex h-14 w-full max-w-content items-center gap-4 px-5">
          <Link to="/" className="flex items-center gap-3">
            <img src="/axisgo-logo.webp" alt="AxisGo" className="h-7 w-auto" />
            <span className="hidden text-[11px] uppercase tracking-[0.18em] text-cyan sm:inline">
              {CLIENT.nome}
            </span>
          </Link>

          <nav className="ml-4 hidden items-center gap-1 text-sm sm:flex">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `rounded-md px-3 py-1.5 transition ${isActive ? 'bg-white/10 text-paper' : 'text-paper/70 hover:text-paper'}`
              }
            >
              Início
            </NavLink>
            <NavLink
              to="/perfil"
              className={({ isActive }) =>
                `rounded-md px-3 py-1.5 transition ${isActive ? 'bg-white/10 text-paper' : 'text-paper/70 hover:text-paper'}`
              }
            >
              Meu perfil
            </NavLink>
            {user?.role === 'admin' && (
              <NavLink
                to="/admin/usuarios"
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 transition ${isActive ? 'bg-white/10 text-paper' : 'text-paper/70 hover:text-paper'}`
                }
              >
                Usuários
              </NavLink>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <Link to="/perfil" className="hidden text-right leading-tight sm:block">
              <div className="text-sm font-medium text-paper hover:underline">{user?.nome}</div>
              <div className="text-[11px] text-paper/60">{user?.email}</div>
            </Link>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                user?.role === 'admin' ? 'bg-copper text-white' : 'bg-white/15 text-paper'
              }`}
            >
              {user?.role === 'admin' ? 'Admin' : 'Usuário'}
            </span>
            <button
              type="button"
              onClick={handleSair}
              className="rounded-md border border-white/20 px-3 py-1.5 text-sm text-paper/90 transition hover:bg-white/10"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      {mode === 'demo' && (
        <div className="bg-copper/10 text-center text-[12px] text-copper">
          <div className="mx-auto max-w-content px-5 py-1.5">
            Modo demonstração — dados salvos apenas neste navegador. Configure o Supabase para persistir em produção.
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-content flex-1 px-5 py-7">
        <Outlet />
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-content flex-wrap justify-between gap-2 px-5 py-4 text-xs text-muted">
          <span>AxisGo · Business Transformation Outsourcing</span>
          <span>Cliente: {CLIENT.nome}</span>
        </div>
      </footer>
    </div>
  )
}
