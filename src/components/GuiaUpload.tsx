import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Botão "Guia" + modal de ajuda para os pontos de upload da plataforma
 * (DRE, Faturamento, Fluxo de Caixa, etc.). Dirigido por conteúdo — cada
 * módulo passa o seu texto (ver guiasUpload.tsx). Passo a passo em linguagem
 * simples, chrome neutro do Core. O texto aceita **negrito** e `código`.
 */
export interface GuiaUploadProps {
  /** Título do modal (ex.: "Como atualizar o Faturamento"). */
  title: string
  /** Subtítulo curto abaixo do título. */
  subtitle?: string
  /** Rótulo do botão que abre o modal (padrão "Guia"). */
  botaoLabel?: string
  /** Botão menor, para toolbars compactas. */
  compact?: boolean
  /** Caixa de resumo destacada no topo (a ideia central). */
  resumo?: string
  /** Passos, em ordem — viram uma lista numerada. */
  passos: { titulo: string; texto: string }[]
  /** Seções extras com cards (ex.: "Mês, vários meses ou ano?"). */
  secoes?: { titulo: string; itens: { titulo: string; texto: string }[] }[]
  /** Caixa de aviso no rodapé (âmbar). */
  aviso?: { titulo: string; itens: string[] }
  className?: string
}

/** Formata **negrito** e `código` dentro de um texto simples. */
function rich(s: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>
    if (p.startsWith('`') && p.endsWith('`')) return <code key={i} className="rounded bg-paper px-1 py-0.5 text-[12px]">{p.slice(1, -1)}</code>
    return <span key={i}>{p}</span>
  })
}

export function GuiaUpload({ title, subtitle, botaoLabel = 'Guia', compact, resumo, passos, secoes, aviso, className = '' }: GuiaUploadProps) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const btnCls = compact
    ? 'inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-[12px] font-bold text-ink transition hover:bg-paper'
    : 'inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-[13px] font-bold text-ink transition hover:bg-paper'

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title={title} className={`${btnCls} ${className}`}>
        <svg viewBox="0 0 24 24" width={compact ? 14 : 16} height={compact ? 14 : 16} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z" />
          <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z" />
        </svg>
        {botaoLabel}
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/40 p-4 py-10" onClick={() => setOpen(false)}>
          <div className="w-full max-w-[640px] rounded-2xl bg-surface shadow-brand" onClick={(e) => e.stopPropagation()}>
            {/* Cabeçalho */}
            <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
              <div>
                <h2 className="font-serif text-lg font-semibold text-ink">{title}</h2>
                {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="shrink-0 rounded-md p-1.5 text-muted transition hover:bg-paper hover:text-ink">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"><path d="M6 6l12 12M18 6L6 18" strokeWidth="1.8" strokeLinecap="round" /></svg>
              </button>
            </div>

            {/* Conteúdo */}
            <div className="max-h-[70vh] overflow-y-auto px-6 py-5 text-[13.5px] leading-relaxed text-ink/85">
              {resumo && (
                <div className="mb-5 rounded-xl border border-line bg-paper px-4 py-3.5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Em resumo</p>
                  <p className="mt-1 text-ink">{rich(resumo)}</p>
                </div>
              )}

              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted">Passo a passo</p>
              <ol className="flex flex-col gap-3">
                {passos.map((p, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink text-[12px] font-bold text-white">{i + 1}</span>
                    <div>
                      <p className="font-semibold text-ink">{p.titulo}</p>
                      <p className="text-ink/75">{rich(p.texto)}</p>
                    </div>
                  </li>
                ))}
              </ol>

              {secoes?.map((sec, i) => (
                <div key={i}>
                  <p className="mb-2 mt-6 text-[11px] font-bold uppercase tracking-wider text-muted">{sec.titulo}</p>
                  <ul className="flex flex-col gap-2">
                    {sec.itens.map((it, j) => (
                      <li key={j} className="rounded-lg border border-line bg-surface px-3.5 py-2.5">
                        <p className="font-semibold text-ink">{it.titulo}</p>
                        <p className="text-ink/75">{rich(it.texto)}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              {aviso && (
                <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3.5 text-[13px] text-amber-800">
                  <p className="mb-1.5 font-bold">{aviso.titulo}</p>
                  <ul className="flex list-disc flex-col gap-1 pl-4">
                    {aviso.itens.map((it, i) => <li key={i}>{rich(it)}</li>)}
                  </ul>
                </div>
              )}
            </div>

            {/* Rodapé */}
            <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
              <button type="button" onClick={() => setOpen(false)} className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:brightness-125">
                Entendi
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
