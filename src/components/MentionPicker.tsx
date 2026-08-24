import { useEffect, useMemo, useRef, useState } from 'react'
import { listUsuariosMencionaveis, type UsuarioMencionavel } from '../lib/notificacoes'

/**
 * Seletor de usuários para "avisar" (mencionar) numa observação. Cada usuário
 * marcado recebe um alerta quando a observação é salva.
 */
export function MentionPicker({ selecionados, onChange }: { selecionados: string[]; onChange: (ids: string[]) => void }) {
  const [usuarios, setUsuarios] = useState<UsuarioMencionavel[]>([])
  const [aberto, setAberto] = useState(false)
  const [filtro, setFiltro] = useState('')
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let ativo = true
    listUsuariosMencionaveis().then((us) => { if (ativo) setUsuarios(us) }).catch(() => {})
    return () => { ativo = false }
  }, [])

  useEffect(() => {
    function fora(e: MouseEvent) { if (wrap.current && !wrap.current.contains(e.target as Node)) setAberto(false) }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [])

  const nomeDe = useMemo(() => new Map(usuarios.map((u) => [u.id, u.nome])), [usuarios])
  const visiveis = useMemo(() => {
    const t = filtro.trim().toLowerCase()
    return t ? usuarios.filter((u) => u.nome.toLowerCase().includes(t)) : usuarios
  }, [usuarios, filtro])

  function alternar(id: string) {
    onChange(selecionados.includes(id) ? selecionados.filter((x) => x !== id) : [...selecionados, id])
  }

  return (
    <div className="relative" ref={wrap}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition ${selecionados.length ? 'border-ink bg-ink text-surface' : 'border-line bg-surface text-ink hover:border-ink/30'}`}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3.2" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>
        {selecionados.length ? `Avisar (${selecionados.length})` : 'Avisar alguém'}
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
      </button>

      {aberto && (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-64 rounded-xl border border-line bg-surface p-2 shadow-card">
          <input
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Buscar pessoa…"
            className="mb-2 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink focus:border-ink/40 focus:outline-none"
          />
          <div className="max-h-56 overflow-y-auto">
            {visiveis.length === 0 ? (
              <p className="px-2 py-3 text-center text-[13px] text-muted">Nenhum usuário.</p>
            ) : (
              visiveis.map((u) => (
                <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ink hover:bg-paper">
                  <input type="checkbox" checked={selecionados.includes(u.id)} onChange={() => alternar(u.id)} className="accent-ink" />
                  {u.nome}
                </label>
              ))
            )}
          </div>
        </div>
      )}

      {selecionados.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {selecionados.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 rounded-full bg-paper px-2 py-0.5 text-[12px] text-ink">
              {nomeDe.get(id) ?? 'Usuário'}
              <button type="button" onClick={() => alternar(id)} className="text-muted hover:text-neg" aria-label="Remover">×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
