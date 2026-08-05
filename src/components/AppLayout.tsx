import { useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { CLIENT } from '../config/client'
import { FRENTES } from '../modules/registry'

const STORAGE_KEY = 'axisgo.sidebar.recolhida'

/** Ícones simples (inline) para os itens fixos da navegação. */
const icons = {
  inicio: <path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />,
  usuarios: (
    <>
      <circle cx="9" cy="8" r="3" strokeWidth="1.7" />
      <path d="M3 19c0-3.2 2.7-4.8 6-4.8s6 1.6 6 4.8" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M16 5.2A3 3 0 0118.5 11M21 19c0-2.4-1.4-3.9-3.4-4.5" strokeWidth="1.7" strokeLinecap="round" />
    </>
  ),
  sair: <path d="M15 4h3a1 1 0 011 1v14a1 1 0 01-1 1h-3M10 8l-4 4 4 4M6 12h11" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />,
  chevron: <path d="M9 6l6 6-6 6" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />,
}

function Icon({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" className="shrink-0">
      {children}
    </svg>
  )
}

export function AppLayout() {
  const { user, mode, signOut } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  // Recolhida = barra estreita (só ícones) no desktop; lembra a escolha.
  const [recolhida, setRecolhida] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1'
    } catch {
      return false
    }
  })
  // Gaveta no mobile.
  const [aberta, setAberta] = useState(false)
  // Quais frentes estão com o submenu aberto (por padrão, a frente ativa).
  const [grupos, setGrupos] = useState<Record<string, boolean>>({})
  // Ajuste de altura do logo conforme a proporção da imagem.
  const [logoH, setLogoH] = useState(32)

  const frenteAtiva = FRENTES.find((f) => pathname === `/${f.slug}` || pathname.startsWith(`/${f.slug}/`))
  const grupoAberto = (slug: string) => grupos[slug] ?? slug === frenteAtiva?.slug
  const toggleGrupo = (slug: string) => setGrupos((g) => ({ ...g, [slug]: !grupoAberto(slug) }))

  function toggleRecolher() {
    setRecolhida((v) => {
      const novo = !v
      try {
        localStorage.setItem(STORAGE_KEY, novo ? '1' : '0')
      } catch {
        /* ignore */
      }
      return novo
    })
  }

  async function handleSair() {
    await signOut()
    navigate('/login', { replace: true })
  }

  const fechaMobile = () => setAberta(false)
  const inicialCliente = (CLIENT.nome || '?').trim().charAt(0).toUpperCase()

  // Classe de um item de nível 1 (Início, frente, Usuários).
  const itemClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition ${
      isActive ? 'bg-brand/10 text-brand' : 'text-muted hover:bg-paper hover:text-ink'
    } ${recolhida ? 'md:justify-center md:px-0' : ''}`
  const rot = (cond: boolean) => (recolhida && cond ? 'md:hidden' : '')

  const logoCompleto = (
    <Link to="/" className="flex items-center" onClick={fechaMobile}>
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
        <button type="button" aria-label="Fechar menu" onClick={fechaMobile} className="fixed inset-0 z-30 bg-black/30 md:hidden" />
      )}

      {/* Barra lateral de navegação */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-line bg-surface transition-all duration-200 md:static md:translate-x-0 ${
          aberta ? 'translate-x-0' : '-translate-x-full'
        } ${recolhida ? 'md:w-16' : 'md:w-60'}`}
      >
        {/* Logo */}
        <div className={`flex h-14 items-center border-b border-line px-5 ${recolhida ? 'md:justify-center md:px-0' : ''}`}>
          <div className={rot(true)}>{logoCompleto}</div>
          {/* Marca compacta quando recolhida (desktop) */}
          <Link
            to="/"
            onClick={fechaMobile}
            className={`hidden size-8 items-center justify-center rounded-md bg-brand/10 font-serif text-sm font-bold text-brand ${
              recolhida ? 'md:flex' : ''
            }`}
          >
            {inicialCliente}
          </Link>
        </div>

        {/* Navegação */}
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
          <NavLink to="/" end className={itemClass} onClick={fechaMobile} title="Início">
            <Icon>{icons.inicio}</Icon>
            <span className={rot(true)}>Início</span>
          </NavLink>

          {FRENTES.map((f) => {
            const temSub = f.modulos.length > 1
            const aberto = grupoAberto(f.slug)
            return (
              <div key={f.slug}>
                <div className="flex items-center">
                  <NavLink to={`/${f.slug}`} onClick={fechaMobile} title={f.nome} className={({ isActive }) => `flex-1 ${itemClass({ isActive })}`}>
                    <Icon>{f.icon}</Icon>
                    <span className={rot(true)}>{f.nome}</span>
                  </NavLink>
                  {temSub && (
                    <button
                      type="button"
                      onClick={() => toggleGrupo(f.slug)}
                      aria-label={aberto ? `Recolher ${f.nome}` : `Expandir ${f.nome}`}
                      className={`ml-0.5 rounded-md p-1 text-muted transition hover:text-ink ${rot(true)}`}
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" className={`transition-transform ${aberto ? 'rotate-90' : ''}`}>
                        {icons.chevron}
                      </svg>
                    </button>
                  )}
                </div>

                {temSub && aberto && (
                  <div className={`mt-0.5 flex flex-col ${rot(true)}`}>
                    {f.modulos.map((m) => (
                      <NavLink
                        key={m.slug}
                        to={`/${f.slug}/${m.slug}`}
                        onClick={fechaMobile}
                        className={({ isActive }) =>
                          `block rounded-md py-1.5 pl-11 pr-3 text-[13px] transition ${
                            isActive ? 'font-medium text-brand' : 'text-muted hover:text-ink'
                          }`
                        }
                      >
                        {m.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          {user?.role === 'admin' && (
            <NavLink to="/admin/usuarios" className={itemClass} onClick={fechaMobile} title="Usuários">
              <Icon>{icons.usuarios}</Icon>
              <span className={rot(true)}>Usuários</span>
            </NavLink>
          )}
        </nav>

        {/* Rodapé: usuário, sair e botão de recolher */}
        <div className="flex flex-col gap-2 border-t border-line p-3">
          <Link
            to="/perfil"
            onClick={fechaMobile}
            title="Meu perfil"
            className={`flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-paper ${recolhida ? 'md:justify-center md:px-0' : ''}`}
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-paper text-sm font-semibold text-ink">
              {(user?.nome || user?.email || '?').trim().charAt(0).toUpperCase()}
            </span>
            <div className={`min-w-0 flex-1 leading-tight ${rot(true)}`}>
              <div className="truncate text-sm font-medium text-ink">{user?.nome}</div>
              <div className="truncate text-[11px] text-muted">{user?.email}</div>
            </div>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                user?.role === 'admin' ? 'bg-brand/12 text-brand' : 'bg-paper text-muted'
              } ${rot(true)}`}
            >
              {user?.role === 'admin' ? 'Admin' : 'Usuário'}
            </span>
          </Link>

          <button
            type="button"
            onClick={handleSair}
            title="Sair"
            className={`flex items-center gap-2.5 rounded-md border border-line px-3 py-1.5 text-sm text-ink transition hover:bg-paper ${
              recolhida ? 'md:justify-center md:px-0' : ''
            }`}
          >
            <Icon>{icons.sair}</Icon>
            <span className={rot(true)}>Sair</span>
          </button>

          {/* Recolher/expandir — só no desktop (no mobile é gaveta) */}
          <button
            type="button"
            onClick={toggleRecolher}
            aria-label={recolhida ? 'Expandir menu' : 'Recolher menu'}
            className="hidden items-center gap-2.5 rounded-md px-3 py-1.5 text-[13px] text-muted transition hover:bg-paper hover:text-ink md:flex"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" className={`shrink-0 transition-transform ${recolhida ? '' : 'rotate-180'}`}>
              {icons.chevron}
            </svg>
            <span className={rot(true)}>Recolher</span>
          </button>
        </div>
      </aside>

      {/* Coluna de conteúdo */}
      <div className="flex min-h-screen w-full flex-1 flex-col">
        {/* Barra superior — só no mobile, para abrir a gaveta */}
        <header className="flex h-14 items-center gap-3 border-b border-line bg-surface px-4 md:hidden">
          <button type="button" aria-label="Abrir menu" onClick={() => setAberta(true)} className="rounded-md p-1.5 text-ink transition hover:bg-paper">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor">
              <path d="M4 7h16M4 12h16M4 17h16" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
          {logoCompleto}
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
