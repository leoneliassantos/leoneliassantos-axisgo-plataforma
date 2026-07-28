import { useState, type ReactNode } from 'react'
import { FluxoCaixa } from './FluxoCaixa'
import { Indicadores } from './Indicadores'

/* ================================================================== *
 *  Hub do Fluxo de Caixa: agrupa o Demonstrativo e os Indicadores
 *  ESPECÍFICOS do fluxo de caixa numa mesma aba, com sub-abas. Deixa
 *  claro que aqueles indicadores são do fluxo de caixa (e abre o padrão
 *  para DRE, Rentabilidade etc. terem seus próprios indicadores depois).
 * ================================================================== */

type Aba = 'demonstrativo' | 'indicadores'

export function FluxoCaixaHub() {
  const [aba, setAba] = useState<Aba>('demonstrativo')
  return (
    <div className="flex flex-col gap-2">
      <div className="mx-auto w-full" style={{ maxWidth: 'min(1400px, 95vw)' }}>
        <div className="inline-flex items-center gap-1 rounded-xl border border-line bg-surface p-0.5 shadow-card">
          <SubTab ativo={aba === 'demonstrativo'} onClick={() => setAba('demonstrativo')}>
            <IconFluxo />
            Demonstrativo
          </SubTab>
          <SubTab ativo={aba === 'indicadores'} onClick={() => setAba('indicadores')}>
            <IconGrafico />
            Indicadores
          </SubTab>
        </div>
      </div>

      {aba === 'demonstrativo' ? <FluxoCaixa /> : <Indicadores />}
    </div>
  )
}

function SubTab({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-[13px] font-bold transition ${
        ativo ? 'bg-brand text-white shadow-brand' : 'text-muted hover:bg-brand/10 hover:text-brand'
      }`}
    >
      {children}
    </button>
  )
}

function IconFluxo() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  )
}
function IconGrafico() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M7 14l3-3 3 3 5-6" />
    </svg>
  )
}
