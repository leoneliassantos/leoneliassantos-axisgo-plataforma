import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import type { ReactNode } from 'react'

interface Frente {
  to: string
  nome: string
  descricao: string
  modulos: string[]
  icon: ReactNode
  ativo: boolean
}

const FRENTES: Frente[] = [
  {
    to: '/comercial',
    nome: 'Comercial',
    descricao: 'Funil, propostas e indicadores de vendas.',
    modulos: ['Pipeline', 'Metas', 'Conversão'],
    ativo: false,
    icon: (
      <path d="M3 3v18h18M7 15l4-4 3 3 5-6" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    ),
  },
  {
    to: '/operacoes',
    nome: 'Operações',
    descricao: 'Processos, entregas e produtividade das equipes.',
    modulos: ['Projetos', 'Capacidade', 'SLA'],
    ativo: false,
    icon: (
      <>
        <circle cx="12" cy="12" r="3.2" strokeWidth="1.6" />
        <path
          d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </>
    ),
  },
  {
    to: '/financeiro',
    nome: 'Financeiro',
    descricao: 'DRE, rentabilidade de projetos e indicadores financeiros.',
    modulos: ['DRE', 'Rentabilidade', 'Indicadores'],
    ativo: true,
    icon: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" strokeWidth="1.6" />
        <path d="M3 9h18M8 14h3M8 17h6" strokeWidth="1.6" strokeLinecap="round" />
      </>
    ),
  },
]

export function Hub() {
  const { user } = useAuth()
  const primeiroNome = user?.nome?.split(' ')[0] ?? ''

  return (
    <div>
      <div className="mb-8">
        <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-copper">Central de trabalho</div>
        <h1 className="mt-1 font-serif text-3xl font-semibold text-ink">Olá, {primeiroNome}</h1>
        <p className="mt-1 text-muted">Escolha uma frente para começar.</p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {FRENTES.map((f) => (
          <Link
            key={f.to}
            to={f.to}
            className="group relative flex flex-col rounded-2xl border border-line bg-surface p-6 shadow-card transition hover:-translate-y-0.5 hover:border-teal/40"
          >
            <div className="flex items-center justify-between">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-teal-tint text-teal">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor">
                  {f.icon}
                </svg>
              </span>
              {f.ativo ? (
                <span className="rounded-full bg-pos/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-pos">
                  Disponível
                </span>
              ) : (
                <span className="rounded-full bg-line px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Em breve
                </span>
              )}
            </div>

            <h2 className="mt-4 font-serif text-xl font-semibold text-ink">{f.nome}</h2>
            <p className="mt-1 flex-1 text-sm text-muted">{f.descricao}</p>

            <div className="mt-4 flex flex-wrap gap-1.5">
              {f.modulos.map((m) => (
                <span key={m} className="rounded-md bg-paper px-2 py-1 text-[11px] text-ink/70">
                  {m}
                </span>
              ))}
            </div>

            <div className="mt-5 flex items-center gap-1 text-sm font-semibold text-teal">
              Abrir
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                className="transition group-hover:translate-x-0.5"
              >
                <path d="M5 12h14M13 6l6 6-6 6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
