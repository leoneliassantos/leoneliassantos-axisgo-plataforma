import { useEffect, useRef, useState } from 'react'
import type { Cadastro } from './data'

/**
 * Seletor com busca + "cadastrar novo" — padrão para cliente, uniforme, cor e
 * fornecedor. Evita digitação livre (que quebra os indicadores). Quando o item
 * não existe, o próprio usuário cadastra ali mesmo via `onAdd`.
 */
export function Combobox({
  value,
  options,
  placeholder,
  addLabel,
  onSelect,
  onAdd,
}: {
  value: string | null
  options: Cadastro[]
  placeholder: string
  addLabel: string
  onSelect: (id: string) => void
  onAdd: (nome: string) => void
}) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const selecionado = options.find((o) => o.id === value)
  const filtro = busca.trim().toLowerCase()
  const lista = filtro ? options.filter((o) => o.nome.toLowerCase().includes(filtro)) : options
  const podeAdd = filtro.length > 0 && !options.some((o) => o.nome.toLowerCase() === filtro)

  useEffect(() => {
    function fora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg border border-line bg-surface px-3 py-2 text-left text-sm text-ink transition hover:border-ink/30 focus:border-ink/40 focus:outline-none"
      >
        <span className={selecionado ? 'text-ink' : 'text-muted'}>{selecionado?.nome ?? placeholder}</span>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" className="shrink-0 text-muted">
          <path d="M6 9l6 6 6-6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {aberto && (
        <div className="absolute z-[70] mt-1 w-full overflow-hidden rounded-lg border border-line bg-surface shadow-brand">
          <div className="border-b border-line p-2">
            <input
              autoFocus
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Digite para buscar…"
              className="w-full rounded-md border border-line px-2.5 py-1.5 text-sm text-ink focus:border-ink/40 focus:outline-none"
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {podeAdd && (
              <button
                type="button"
                onClick={() => { onAdd(busca.trim()); setBusca(''); setAberto(false) }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-ink hover:bg-paper"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"><path d="M12 5v14M5 12h14" strokeWidth="2" strokeLinecap="round" /></svg>
                {addLabel}: <b>{busca.trim()}</b>
              </button>
            )}
            {lista.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => { onSelect(o.id); setAberto(false); setBusca('') }}
                className={`block w-full px-3 py-2 text-left text-sm hover:bg-paper ${o.id === value ? 'font-medium text-ink' : 'text-ink'}`}
              >
                {o.nome}
              </button>
            ))}
            {!lista.length && !podeAdd && <div className="px-3 py-2 text-sm text-muted">Nada encontrado.</div>}
          </div>
        </div>
      )}
    </div>
  )
}
