import { type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Modal simples via portal. Fecha só no botão/ação (clique fora NÃO fecha —
 * evita perder um lançamento em andamento, regra pedida pelo cliente).
 */
export function Modal({
  title,
  subtitle,
  width = 560,
  onClose,
  children,
  footer,
}: {
  title: string
  subtitle?: string
  width?: number
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/40 p-4 py-10">
      <div className="w-full rounded-2xl bg-surface shadow-brand" style={{ maxWidth: width }}>
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div>
            <h2 className="font-serif text-lg font-semibold text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="shrink-0 rounded-md p-1.5 text-muted transition hover:bg-paper hover:text-ink"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"><path d="M6 6l12 12M18 6L6 18" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

/** Botões padrão. */
export function BtnPrimary({ children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...p}
      className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-50"
    >
      {children}
    </button>
  )
}
export function BtnGhost({ children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...p}
      className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-paper disabled:opacity-50"
    >
      {children}
    </button>
  )
}
