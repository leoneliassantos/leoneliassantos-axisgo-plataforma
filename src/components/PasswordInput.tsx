import { useState } from 'react'
import { avaliarSenha, REGRAS_SENHA } from '../lib/password'

interface Props {
  value: string
  onChange: (v: string) => void
  label?: string
  /** Mostra o medidor de força + checklist. */
  strengthMeter?: boolean
  required?: boolean
  placeholder?: string
  autoComplete?: string
}

const CORES: Record<string, string> = {
  vazia: 'bg-line',
  fraca: 'bg-neg',
  media: 'bg-brand',
  forte: 'bg-pos',
}
const ROTULO: Record<string, string> = {
  vazia: '—',
  fraca: 'Fraca',
  media: 'Média',
  forte: 'Forte',
}

export function PasswordInput({
  value,
  onChange,
  label = 'Senha',
  strengthMeter = false,
  required = false,
  placeholder = '••••••••',
  autoComplete = 'new-password',
}: Props) {
  const [visivel, setVisivel] = useState(false)
  const forca = avaliarSenha(value)

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] font-semibold uppercase tracking-wide text-muted">{label}</span>
      <div className="relative">
        <input
          type={visivel ? 'text' : 'password'}
          required={required}
          value={value}
          autoComplete={autoComplete}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 pr-11 text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
        <button
          type="button"
          onClick={() => setVisivel((v) => !v)}
          aria-label={visivel ? 'Ocultar senha' : 'Mostrar senha'}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted transition hover:text-ink"
        >
          {visivel ? (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor">
              <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8" strokeWidth="1.6" strokeLinecap="round" />
              <path
                d="M9.9 5.1A9.5 9.5 0 0112 5c5 0 9 4.5 10 7-.4 1-1.4 2.6-3 4M6.1 6.1C3.9 7.5 2.5 9.6 2 12c1 2.5 5 7 10 7 1.2 0 2.3-.2 3.3-.6"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor">
              <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" strokeWidth="1.6" strokeLinejoin="round" />
              <circle cx="12" cy="12" r="3" strokeWidth="1.6" />
            </svg>
          )}
        </button>
      </div>

      {strengthMeter && value.length > 0 && (
        <div className="mt-1 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-1.5 flex-1 gap-1">
              {[0, 1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className={`h-full flex-1 rounded-full transition ${
                    i < forca.score ? CORES[forca.nivel] : 'bg-line'
                  }`}
                />
              ))}
            </div>
            <span
              className={`text-[11px] font-semibold ${
                forca.nivel === 'forte' ? 'text-pos' : forca.nivel === 'media' ? 'text-brand' : 'text-neg'
              }`}
            >
              {ROTULO[forca.nivel]}
            </span>
          </div>
          <ul className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
            {REGRAS_SENHA.map((r) => {
              const ok = forca.requisitos[r.chave]
              return (
                <li key={r.chave} className={`flex items-center gap-1.5 text-[12px] ${ok ? 'text-pos' : 'text-muted'}`}>
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor">
                    {ok ? (
                      <path d="M5 12l4 4 10-10" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    ) : (
                      <circle cx="12" cy="12" r="8" strokeWidth="1.6" />
                    )}
                  </svg>
                  {r.label}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
