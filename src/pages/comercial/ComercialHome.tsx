import { Link } from 'react-router-dom'
import { EmConstrucao } from '../../components/EmConstrucao'

export function ComercialHome() {
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
          <h1 className="font-serif text-2xl font-semibold text-ink">Comercial</h1>
        </div>
      </div>
      <EmConstrucao
        titulo="Frente Comercial"
        descricao="Vamos construir aqui o acompanhamento do funil de vendas, propostas e metas — no mesmo padrão do módulo Financeiro."
        itens={['Pipeline', 'Propostas', 'Metas', 'Taxa de conversão']}
      />
    </div>
  )
}
