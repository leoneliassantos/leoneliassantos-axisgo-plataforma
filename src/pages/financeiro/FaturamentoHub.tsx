import { useState, type ReactNode } from 'react'
import { FaturamentoLista } from './FaturamentoLista'

type Aba = 'lista' | 'indicadores'

export function FaturamentoHub() {
  const [aba, setAba] = useState<Aba>('lista')
  return (
    <div className="flex flex-col gap-2">
      <div className="w-full">
        <div className="inline-flex items-center gap-1 rounded-xl border border-line bg-surface p-0.5 shadow-card">
          <SubTab ativo={aba === 'lista'} onClick={() => setAba('lista')}>
            <IconLista />
            Lista analítica
          </SubTab>
          <SubTab ativo={aba === 'indicadores'} onClick={() => setAba('indicadores')}>
            <IconGrafico />
            Indicadores
          </SubTab>
        </div>
      </div>

      {aba === 'lista' ? <FaturamentoLista /> : <IndicadoresEmBreve />}
    </div>
  )
}

function IndicadoresEmBreve() {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-12 text-center">
      <div className="text-[14px] font-bold text-ink">Indicadores em construção</div>
      <p className="mx-auto mt-1 max-w-md text-[13px] text-muted">
        Evolução do faturamento, faturamento por unidade de negócio, top clientes, faturado × recebido × a receber e ticket médio — chegam na próxima etapa.
      </p>
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
        ativo ? 'bg-ink text-white shadow-brand' : 'text-muted hover:bg-paper hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}

function IconLista() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  )
}
function IconGrafico() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" /><path d="M7 14l3-3 3 3 4-5" />
    </svg>
  )
}
