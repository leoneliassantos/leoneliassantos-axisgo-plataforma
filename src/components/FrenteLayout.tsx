import { Link, NavLink, Outlet } from 'react-router-dom'
import type { Frente } from '../modules/registry'

/** Layout genérico de uma frente: cabeçalho + abas dos módulos + conteúdo. */
export function FrenteLayout({ frente }: { frente: Frente }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <Link to="/" className="inline-flex items-center gap-1 text-[13px] text-muted transition hover:text-ink">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor">
            <path d="M15 6l-6 6 6 6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Hub
        </Link>
        <span className="text-line">/</span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brand">Frente</span>
        <h1 className="font-serif text-lg font-semibold text-ink">{frente.nome}</h1>
      </div>

      {frente.modulos.length > 1 && (
        <nav className="flex flex-wrap gap-1 border-b border-line">
          {frente.modulos.map((m) => (
            <NavLink
              key={m.slug}
              to={m.slug}
              className={({ isActive }) =>
                `-mb-px border-b-2 px-3 py-1 text-[13px] font-medium transition ${
                  isActive ? 'border-brand text-ink' : 'border-transparent text-muted hover:text-ink'
                }`
              }
            >
              {m.label}
            </NavLink>
          ))}
        </nav>
      )}

      <Outlet />
    </div>
  )
}
