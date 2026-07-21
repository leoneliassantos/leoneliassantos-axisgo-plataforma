import { Link, NavLink, Outlet } from 'react-router-dom'
import type { Frente } from '../modules/registry'

/** Layout genérico de uma frente: cabeçalho + abas dos módulos + conteúdo. */
export function FrenteLayout({ frente }: { frente: Frente }) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted transition hover:text-ink">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor">
            <path d="M15 6l-6 6 6 6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Voltar ao hub
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-copper">Frente</span>
          <h1 className="font-serif text-2xl font-semibold text-ink">{frente.nome}</h1>
        </div>
      </div>

      {frente.modulos.length > 1 && (
        <nav className="flex flex-wrap gap-1 border-b border-line">
          {frente.modulos.map((m) => (
            <NavLink
              key={m.slug}
              to={m.slug}
              className={({ isActive }) =>
                `-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition ${
                  isActive ? 'border-teal text-ink' : 'border-transparent text-muted hover:text-ink'
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
