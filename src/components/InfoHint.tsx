import { useEffect, useRef, useState } from 'react'

interface InfoHintProps {
  /** Título do balão (ex.: "Como atualizar o Fluxo de Caixa"). */
  title: string
  /** Passos, em ordem — viram uma lista numerada. */
  steps: string[]
  /** Aviso destacado no rodapé do balão (ex.: "Substitui TODA a base"). */
  warn?: string
  className?: string
}

/**
 * Ícone ⓘ com balão explicativo. Abre ao passar o mouse ou receber foco
 * (teclado) e fica "fixado" ao clicar/tocar — para funcionar no celular.
 * Fecha com Esc ou clicando fora. Chrome neutro (cinza), como o resto da plataforma.
 */
export function InfoHint({ title, steps, warn, className = '' }: InfoHintProps) {
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setPinned(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        setPinned(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <span
      ref={ref}
      className={`relative inline-flex ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => { if (!pinned) setOpen(false) }}
    >
      <button
        type="button"
        aria-label={title}
        aria-expanded={open}
        onClick={() => { setPinned((p) => !p); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => { if (!pinned) setOpen(false) }}
        className="grid h-6 w-6 place-items-center rounded-full border border-line bg-surface text-muted transition hover:border-ink/30 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5" />
          <path d="M12 8h.01" />
        </svg>
      </button>

      {open && (
        <div
          role="tooltip"
          className="absolute right-0 top-full z-50 mt-2 w-[280px] max-w-[80vw] rounded-xl border border-line bg-surface p-3.5 text-left shadow-card"
        >
          <p className="mb-1.5 text-[13px] font-bold text-ink">{title}</p>
          <ol className="flex list-decimal flex-col gap-1 pl-4 text-[12.5px] leading-snug text-ink/80">
            {steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          {warn && (
            <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[12px] font-medium text-amber-700">
              ⚠ {warn}
            </p>
          )}
        </div>
      )}
    </span>
  )
}
