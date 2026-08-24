import { useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { CLIENT } from '../config/client'
import { FRENTES, type Modulo } from '../modules/registry'
import { CentralAlertas } from './CentralAlertas'

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
  modulo: <circle cx="12" cy="12" r="3.4" strokeWidth="2" />,
  cadastros: <path d="M4 6a2 2 0 012-2h3l2 2h7a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2z" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />,
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
  const [aberta, setAberta] = useState(false) // gaveta no mobile
  const [logoH, setLogoH] = useState(32)
  const [gruposAbertos, setGruposAbertos] = useState<Record<string, boolean>>({})

  // Início (Hub) = sem barra lateral, só os cards. Dentro de um ambiente = sidebar
  // com Início + os módulos DAQUELE ambiente (sem a lista dos outros ambientes).
  const naHub = pathname === '/'
  const frenteAtiva = FRENTES.find((f) => pathname === `/${f.slug}` || pathname.startsWith(`/${f.slug}/`))

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

  const chipUsuario = (
    <Link to="/perfil" title="Meu perfil" className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-paper">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-paper text-sm font-semibold text-ink">
        {(user?.nome || user?.email || '?').trim().charAt(0).toUpperCase()}
      </span>
      <div className="hidden min-w-0 leading-tight sm:block">
        <div className="truncate text-sm font-medium text-ink">{user?.nome}</div>
        <div className="truncate text-[11px] text-muted">{user?.email}</div>
      </div>
    </Link>
  )

  const botaoSair = (
    <button
      type="button"
      onClick={handleSair}
      title="Sair"
      className="flex items-center gap-2 rounded-md border border-line px-3 py-1.5 text-sm text-ink transition hover:bg-paper"
    >
      <Icon>{icons.sair}</Icon>
      <span className="hidden sm:inline">Sair</span>
    </button>
  )

  const bannerDemo = mode === 'demo' && (
    <div className="bg-paper text-center text-[12px] text-muted">
      <div className="mx-auto max-w-content px-5 py-1.5">
        Modo demonstração — dados salvos apenas neste navegador. Configure o Supabase para persistir em produção.
      </div>
    </div>
  )

  const rodape = (
    <footer className="bg-band text-paper shadow-[0_-2px_10px_rgba(0,0,0,0.08)]">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-2.5 text-xs">
        <span className="flex flex-wrap items-center gap-2 text-paper/85">
          {CLIENT.nome} - Ambiente desenvolvido por
          <img src="/axisgo-logo.webp" alt="AxisGo" className="h-5 w-auto" />
        </span>
        <span className="text-paper/70">Business Transformation Outsourcing</span>
      </div>
    </footer>
  )

  /* ============================ HUB (Início) — sem sidebar ============================ */
  if (naHub) {
    return (
      <div className="flex h-screen flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-surface px-5">
          {logoCompleto}
          <div className="flex items-center gap-2">
            {chipUsuario}
            {user?.role === 'admin' && (
              <Link to="/admin/usuarios" title="Usuários" className="hidden items-center gap-2 rounded-md border border-line px-3 py-1.5 text-sm text-ink transition hover:bg-paper sm:flex">
                <Icon>{icons.usuarios}</Icon>
                Usuários
              </Link>
            )}
            {botaoSair}
          </div>
        </header>
        {bannerDemo}
        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <div className="mx-auto w-full max-w-[1180px] px-5 pb-10 pt-8">
            <Outlet />
          </div>
        </main>
        {rodape}
        <CentralAlertas />
      </div>
    )
  }

  /* ==================== Dentro de um ambiente — sidebar do ambiente ==================== */
  const itemClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition ${
      isActive ? 'bg-paper font-semibold text-ink' : 'text-muted hover:bg-paper hover:text-ink'
    } ${recolhida ? 'md:justify-center md:px-0' : ''}`

  const renderModulo = (m: Modulo, indent: boolean) => (
    <NavLink
      key={m.slug}
      to={`/${frenteAtiva!.slug}/${m.slug}`}
      onClick={fechaMobile}
      title={m.label}
      className={({ isActive }) =>
        `flex items-center gap-2.5 rounded-md py-2 text-sm transition ${indent ? 'pl-9 pr-3' : 'px-3'} ${
          isActive ? 'bg-paper font-semibold text-ink' : 'text-muted hover:bg-paper hover:text-ink'
        } ${recolhida ? 'md:justify-center md:px-0' : ''}`
      }
    >
      <Icon size={16}>{icons.modulo}</Icon>
      <span className={rot(true)}>{m.label}</span>
    </NavLink>
  )

  // Módulos visíveis para o perfil atual (ex.: Cobrança some para Acabamento).
  const modulosVisiveis = frenteAtiva
    ? frenteAtiva.modulos.filter((m) => !m.podeVer || (user ? m.podeVer(user.role) : false))
    : []
  // Separa módulos soltos dos agrupados (ex.: "Cadastros").
  const soltos = modulosVisiveis.filter((m) => !m.grupo)
  const grupos: Record<string, Modulo[]> = {}
  for (const m of modulosVisiveis) if (m.grupo) (grupos[m.grupo] ??= []).push(m)

  return (
    <div className="flex h-screen overflow-hidden">
      {aberta && (
        <button type="button" aria-label="Fechar menu" onClick={fechaMobile} className="fixed inset-0 z-30 bg-black/30 md:hidden" />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-line bg-surface transition-all duration-200 md:static md:translate-x-0 ${
          aberta ? 'translate-x-0' : '-translate-x-full'
        } ${recolhida ? 'md:w-16' : 'md:w-60'}`}
      >
        <div className={`flex h-14 items-center border-b border-line px-5 ${recolhida ? 'md:justify-center md:px-0' : ''}`}>
          <div className={rot(true)}>{logoCompleto}</div>
          <Link
            to="/"
            onClick={fechaMobile}
            className={`hidden size-8 items-center justify-center rounded-md bg-paper font-serif text-sm font-bold text-ink ${recolhida ? 'md:flex' : ''}`}
          >
            {(CLIENT.nome || '?').trim().charAt(0).toUpperCase()}
          </Link>
        </div>

        <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-3">
          <NavLink to="/" end className={itemClass} onClick={fechaMobile} title="Início">
            <Icon>{icons.inicio}</Icon>
            <span className={rot(true)}>Início</span>
          </NavLink>

          {frenteAtiva && (
            <div className="mt-3">
              <div className={`px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted ${rot(true)}`}>
                {frenteAtiva.nome}
              </div>
              {soltos.map((m) => renderModulo(m, false))}

              {Object.entries(grupos).map(([nome, itens]) => {
                const temAtivo = itens.some((m) => pathname === `/${frenteAtiva.slug}/${m.slug}`)
                const aberto = gruposAbertos[nome] ?? temAtivo
                return (
                  <div key={nome} className="mt-1">
                    <button
                      type="button"
                      onClick={() => setGruposAbertos((g) => ({ ...g, [nome]: !(g[nome] ?? temAtivo) }))}
                      title={nome}
                      className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium text-muted transition hover:bg-paper hover:text-ink ${recolhida ? 'md:justify-center md:px-0' : ''}`}
                    >
                      <span className="flex items-center gap-2.5">
                        <Icon size={16}>{icons.cadastros}</Icon>
                        <span className={rot(true)}>{nome}</span>
                      </span>
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" className={`transition-transform ${aberto ? 'rotate-90' : ''} ${rot(true)}`}>
                        {icons.chevron}
                      </svg>
                    </button>
                    {aberto && <div className="mt-0.5 flex flex-col">{itens.map((m) => renderModulo(m, true))}</div>}
                  </div>
                )
              })}
            </div>
          )}

          {user?.role === 'admin' && (
            <div className="mt-3">
              <NavLink to="/admin/usuarios" className={itemClass} onClick={fechaMobile} title="Usuários">
                <Icon>{icons.usuarios}</Icon>
                <span className={rot(true)}>Usuários</span>
              </NavLink>
            </div>
          )}
        </nav>

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
          </Link>

          <button
            type="button"
            onClick={handleSair}
            title="Sair"
            className={`flex items-center gap-2.5 rounded-md border border-line px-3 py-1.5 text-sm text-ink transition hover:bg-paper ${recolhida ? 'md:justify-center md:px-0' : ''}`}
          >
            <Icon>{icons.sair}</Icon>
            <span className={rot(true)}>Sair</span>
          </button>

          <button
            type="button"
            onClick={toggleRecolher}
            aria-label={recolhida ? 'Expandir menu' : 'Recolher menu'}
            className="hidden items-center gap-2.5 rounded-md px-3 py-1.5 text-[13px] text-muted transition hover:bg-paper hover:text-ink md:flex"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" className={`shrink-0 transition-transform ${recolhida ? '' : 'rotate-180'}`}>
              <path d="M9 6l6 6-6 6" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className={rot(true)}>Recolher</span>
          </button>
        </div>
      </aside>

      <div className="flex h-screen min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-line bg-surface px-4 md:hidden">
          <button type="button" aria-label="Abrir menu" onClick={() => setAberta(true)} className="rounded-md p-1.5 text-ink transition hover:bg-paper">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor">
              <path d="M4 7h16M4 12h16M4 17h16" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
          {logoCompleto}
        </header>

        {bannerDemo}

        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <div className="mx-auto w-full max-w-[1600px] px-5 pb-10 pt-3">
            <Outlet />
          </div>
        </main>

        {rodape}
      </div>
      <CentralAlertas />
    </div>
  )
}
