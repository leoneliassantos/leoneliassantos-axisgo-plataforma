import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { CLIENT } from '../config/client'

/** Ícones simples (inline) para os itens de navegação da barra lateral. */
const icons = {
  inicio: (
    <path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  ),
  perfil: (
    <>
      <circle cx="12" cy="8" r="3.4" strokeWidth="1.7" />
      <path d="M5 20c0-3.6 3.1-5.5 7-5.5s7 1.9 7 5.5" strokeWidth="1.7" strokeLinecap="round" />
    </>
  ),
  usuarios: (
    <>
      <circle cx="9" cy="8" r="3" strokeWidth="1.7" />
      <path d="M3 19c0-3.2 2.7-4.8 6-4.8s6 1.6 6 4.8" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M16 5.2A3 3 0 0118.5 11M21 19c0-2.4-1.4-3.9-3.4-4.5" strokeWidth="1.7" strokeLinecap="round" />
    </>
  ),
}

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" className="shrink-0">
      {children}
    </svg>
  )
}

export function AppLayout() {
  const { user, mode, signOut } = useAuth()
  const navigate = useNavigate()

  // Barra lateral: no mobile ela desliza como gaveta (drawer); no desktop fica fixa.
  const [aberta, setAberta] = useState(false)

  // Altura do logo do cliente conforme a proporção da imagem: logos largos
  // (wordmark, ex.: Batux) ficam no tamanho padrão; logos quadrados/altos
  // (ex.: MC Distribuidora) ganham mais altura para o texto ficar legível.
  const [logoH, setLogoH] = useState(32)

  async function handleSair() {
    await signOut()
    navigate('/login', { replace: true })
  }

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition ${
      isActive ? 'bg-brand/10 text-brand' : 'text-muted hover:bg-paper hover:text-ink'
    }`

  const logo = (
    <Link to="/" className="flex items-center" onClick={() => setAberta(false)}>
      {CLIENT.logo ? (
        <img
          src={CLIENT.logo}
          alt={CLIENT.nome}
          className="w-auto"
          style={{ height: logoH }}
          onLoad={(e) => {
            const { naturalWidth: w, naturalHeight: h } = e.currentTarget
            if (h > 0) setLogoH(w / h < 1.6 ? 52 : 32)
          }}
        />
      ) : (
        <span className="font-serif text-lg font-semibold text-ink">{CLIENT.nome}</span>
      )}
    </Link>
  )

  return (
    <div className="flex min-h-screen">
      {/* Fundo escuro atrás da gaveta (só no mobile, quando aberta) */}
      {aberta && (
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={() => setAberta(false)}
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
        />
      )}

      {/* Barra lateral de navegação */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-line bg-surface transition-transform md:static md:translate-x-0 ${
          aberta ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-14 items-center border-b border-line px-5">{logo}</div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          <NavLink to="/" end className={navClass} onClick={() => setAberta(false)}>
            <Icon>{icons.inicio}</Icon>
            Início
          </NavLink>
          <NavLink to="/perfil" className={navClass} onClick={() => setAberta(false)}>
            <Icon>{icons.perfil}</Icon>
            Meu perfil
          </NavLink>
          {user?.role === 'admin' && (
            <NavLink to="/admin/usuarios" className={navClass} onClick={() => setAberta(false)}>
              <Icon>{icons.usuarios}</Icon>
              Usuários
            </NavLink>
          )}
        </nav>

        {/* Rodapé da barra: usuário + sair */}
        <div className="flex flex-col gap-2 border-t border-line p-3">
          <Link
            to="/perfil"
            onClick={() => setAberta(false)}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-paper"
          >
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-sm font-medium text-ink">{user?.nome}</div>
              <div className="truncate text-[11px] text-muted">{user?.email}</div>
            </div>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                user?.role === 'admin' ? 'bg-brand/12 text-brand' : 'bg-paper text-muted'
              }`}
            >
              {user?.role === 'admin' ? 'Admin' : 'Usuário'}
            </span>
          </Link>
          <button
            type="button"
            onClick={handleSair}
            className="rounded-md border border-line px-3 py-1.5 text-sm text-ink transition hover:bg-paper"
          >
            Sair
          </button>
        </div>
      </aside>

      {/* Coluna de conteúdo */}
      <div className="flex min-h-screen w-full flex-1 flex-col">
        {/* Barra superior — só no mobile, para abrir a gaveta */}
        <header className="flex h-14 items-center gap-3 border-b border-line bg-surface px-4 md:hidden">
          <button
            type="button"
            aria-label="Abrir menu"
            onClick={() => setAberta(true)}
            className="rounded-md p-1.5 text-ink transition hover:bg-paper"
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor">
              <path d="M4 7h16M4 12h16M4 17h16" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
          {logo}
        </header>

        {mode === 'demo' && (
          <div className="bg-brand/8 text-center text-[12px] text-brand">
            <div className="mx-auto max-w-content px-5 py-1.5">
              Modo demonstração — dados salvos apenas neste navegador. Configure o Supabase para persistir em produção.
            </div>
          </div>
        )}

        <main className="mx-auto w-full max-w-content flex-1 px-5 pb-10 pt-2.5">
          <Outlet />
        </main>

        <footer className="bg-band text-paper shadow-[0_-2px_10px_rgba(0,0,0,0.08)]">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-2.5 text-xs">
            <span className="flex flex-wrap items-center gap-2 text-paper/85">
              {CLIENT.nome} - Ambiente desenvolvido por
              <img src="/axisgo-logo.webp" alt="AxisGo" className="h-5 w-auto" />
            </span>
            <span className="text-paper/70">Business Transformation Outsourcing</span>
          </div>
        </footer>
      </div>
    </div>
  )
}
