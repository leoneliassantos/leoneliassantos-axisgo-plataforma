/**
 * Kit de UI local do Comercial — no estilo do Core (tokens paper/surface/ink/
 * muted/line/brand/pos/neg), SEM dependências externas. Substitui os
 * primitivos Radix/lucide que o MVP da Fukuda usava, para não trazer libs
 * novas ao repo compartilhado (Batux/MC/MM).
 */
import {
  createContext, useCallback, useContext, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
  type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react'
import { createPortal } from 'react-dom'

/* ------------------------------------------------------------------ *
 *  Ícones (SVG inline) — substituem o lucide-react
 * ------------------------------------------------------------------ */

const PATHS: Record<string, ReactNode> = {
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 5a2 2 0 012-2z" />,
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </>
  ),
  flame: <path d="M12 3c1 3-2 4-2 7a2 2 0 004 0c0-1 .5-1.5 1-2 1 2 2 3.2 2 5a5 5 0 01-10 0c0-4 3-6 5-10z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  'calendar-plus': (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v4M16 3v4M12 13v4M10 15h4" />
    </>
  ),
  'msg-plus': (
    <>
      <path d="M21 15a2 2 0 01-2 2H8l-4 4V5a2 2 0 012-2h13a2 2 0 012 2z" />
      <path d="M12 8v5M9.5 10.5h5" />
    </>
  ),
  'msg-circle': <path d="M21 11.5a8 8 0 01-11.9 7L3 21l2.5-6.1A8 8 0 1121 11.5z" />,
  check: <path d="M5 12l5 5L20 6" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  'user-plus': (
    <>
      <circle cx="9" cy="8" r="3.4" />
      <path d="M3 20c0-3.3 2.7-5 6-5 1.2 0 2.3.2 3.2.7M17 11v6M14 14h6" />
    </>
  ),
  'map-pin': (
    <>
      <path d="M12 21s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  tag: (
    <>
      <path d="M3 12l9-9 9 9-9 9z" />
      <circle cx="9" cy="9" r="1.2" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.4" />
    </>
  ),
  grip: (
    <>
      <circle cx="9" cy="7" r="1.3" />
      <circle cx="9" cy="12" r="1.3" />
      <circle cx="9" cy="17" r="1.3" />
      <circle cx="15" cy="7" r="1.3" />
      <circle cx="15" cy="12" r="1.3" />
      <circle cx="15" cy="17" r="1.3" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  paperclip: <path d="M21 12.5l-8.5 8.5a5 5 0 01-7-7L14.5 4a3.5 3.5 0 015 5l-9 9a2 2 0 01-3-3l8-8" />,
  trash: <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />,
  file: (
    <>
      <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" />
      <path d="M14 3v5h5" />
    </>
  ),
  external: (
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4l-9 9" />
      <path d="M19 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h5" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3l10 17H2z" />
      <path d="M12 10v4M12 17.5v.5" />
    </>
  ),
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  broom: <path d="M19 4l-7 7M8 21l-3-3 5-5 3 3-5 5zM10 13l4-4" />,
}

export function Ico({ n, s = 16, className }: { n: string; s?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {PATHS[n] ?? null}
    </svg>
  )
}

/* ------------------------------------------------------------------ *
 *  Badge — cor por hex (fundo em ~13% de opacidade)
 * ------------------------------------------------------------------ */

export function Badge({ children, color }: { children: ReactNode; color?: string }) {
  const style = color ? { background: `${color}22`, color } : undefined
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${color ? '' : 'bg-paper text-muted'}`}
      style={style}
    >
      {children}
    </span>
  )
}

/* ------------------------------------------------------------------ *
 *  Card / Field / Input / Select / Textarea
 * ------------------------------------------------------------------ */

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-line bg-surface shadow-card ${className}`}>{children}</div>
}

export function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  )
}

const campo =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/60 focus:border-ink/40 focus:outline-none'

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = '', ...rest } = props
  return <input {...rest} className={`${campo} ${className}`} />
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = '', ...rest } = props
  return <textarea {...rest} className={`${campo} ${className}`} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = '', children, ...rest } = props
  return (
    <select {...rest} className={`${campo} appearance-none pr-8 ${className}`}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%2364748B' stroke-width='1.8'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E\")",
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 0.6rem center',
      }}
    >
      {children}
    </select>
  )
}

/* ------------------------------------------------------------------ *
 *  Botões — variantes primary/secondary/ghost/accent/danger
 * ------------------------------------------------------------------ */

type Variant = 'primary' | 'secondary' | 'ghost' | 'accent' | 'danger'

const VAR: Record<Variant, string> = {
  primary: 'bg-ink text-white hover:brightness-125',
  secondary: 'border border-line text-ink hover:bg-paper',
  ghost: 'text-muted hover:bg-paper',
  accent: 'text-white hover:brightness-110', // usa a cor da marca via style
  danger: 'bg-neg text-white hover:brightness-110',
}

export function Btn({
  variant = 'primary',
  sm,
  children,
  className = '',
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; sm?: boolean }) {
  const style = variant === 'accent' ? { background: 'rgb(var(--brand))' } : undefined
  return (
    <button
      {...p}
      style={{ ...style, ...(p.style ?? {}) }}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition disabled:opacity-50 ${
        sm ? 'px-2.5 py-1.5 text-xs' : 'px-4 py-2 text-sm'
      } ${VAR[variant]} ${className}`}
    >
      {children}
    </button>
  )
}

/* ------------------------------------------------------------------ *
 *  Sheet — painel lateral direito (para o detalhe do lead)
 * ------------------------------------------------------------------ */

export function Sheet({
  title,
  subtitle,
  width = 460,
  onClose,
  footer,
  children,
}: {
  title: string
  subtitle?: string
  width?: number
  onClose: () => void
  footer?: ReactNode
  children: ReactNode
}) {
  return createPortal(
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/40">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div className="relative flex h-full w-full flex-col bg-surface shadow-brand" style={{ maxWidth: width }}>
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate font-serif text-lg font-semibold text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 truncate text-sm text-muted">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="shrink-0 rounded-md p-1.5 text-muted transition hover:bg-paper hover:text-ink"
          >
            <Ico n="x" s={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

/* ------------------------------------------------------------------ *
 *  Tabs — controle segmentado simples
 * ------------------------------------------------------------------ */

export function Tabs({
  value,
  onChange,
  tabs,
}: {
  value: string
  onChange: (v: string) => void
  tabs: { value: string; label: string }[]
}) {
  return (
    <div className="flex gap-1 rounded-xl bg-paper p-1">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            value === t.value ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 *  Toast — notificações efêmeras (substitui o useToast da Fukuda)
 * ------------------------------------------------------------------ */

type Kind = 'success' | 'info' | 'error'
interface Toast {
  id: string
  kind: Kind
  title: string
  desc?: string
}
type Notify = (t: { kind?: Kind; title: string; desc?: string }) => void

const ToastCtx = createContext<Notify>(() => {})

const KIND_COR: Record<Kind, string> = { success: '#15805A', info: '#2E86DE', error: '#C0392B' }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  const notify = useCallback<Notify>((t) => {
    const id = `${Date.now()}${Math.random()}`
    setItems((a) => [...a, { id, kind: t.kind ?? 'success', title: t.title, desc: t.desc }])
    setTimeout(() => setItems((a) => a.filter((x) => x.id !== id)), 2800)
  }, [])
  return (
    <ToastCtx.Provider value={notify}>
      {children}
      {createPortal(
        <div className="fixed right-4 top-4 z-[90] flex w-72 flex-col gap-2">
          {items.map((t) => (
            <div key={t.id} className="rounded-xl border border-line bg-surface px-3 py-2.5 shadow-brand">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: KIND_COR[t.kind] }} />
                <p className="text-sm font-semibold text-ink">{t.title}</p>
              </div>
              {t.desc && <p className="mt-0.5 pl-4 text-xs text-muted">{t.desc}</p>}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastCtx.Provider>
  )
}

export function useToast() {
  return { notify: useContext(ToastCtx) }
}
