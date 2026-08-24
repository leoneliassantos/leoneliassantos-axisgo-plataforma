import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { minhasNotificacoes, marcarLida, marcarTodasLidas, type Notificacao } from '../lib/notificacoes'

const SESSION_FLAG = 'axg_alertas_abertos'

function quando(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** Sino flutuante de alertas/menções. Abre sozinho no login quando há não lidas. */
export function CentralAlertas() {
  const { user } = useAuth()
  const [notifs, setNotifs] = useState<Notificacao[]>([])
  const [aberto, setAberto] = useState(false)

  const carregar = useCallback(async () => {
    try { setNotifs(await minhasNotificacoes()) } catch { /* silencioso */ }
  }, [])

  useEffect(() => {
    if (!user) return
    let ativo = true
    minhasNotificacoes()
      .then((ns) => {
        if (!ativo) return
        setNotifs(ns)
        const naoLidas = ns.filter((n) => !n.lida).length
        // Abre sozinho uma vez por sessão quando há mensagens não lidas.
        if (naoLidas > 0 && sessionStorage.getItem(SESSION_FLAG) !== '1') {
          setAberto(true)
          sessionStorage.setItem(SESSION_FLAG, '1')
        }
      })
      .catch(() => {})
    return () => { ativo = false }
  }, [user])

  if (!user) return null
  const naoLidas = notifs.filter((n) => !n.lida).length

  async function lerUma(id: string) {
    setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, lida: true } : n)))
    try { await marcarLida(id) } catch { carregar() }
  }
  async function lerTodas() {
    setNotifs((prev) => prev.map((n) => ({ ...n, lida: true })))
    try { await marcarTodasLidas() } catch { carregar() }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setAberto((v) => !v); if (!aberto) carregar() }}
        title="Alertas"
        className="fixed bottom-5 right-5 z-[60] grid size-12 place-items-center rounded-full border border-line bg-surface text-ink shadow-card transition hover:bg-paper"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
        {naoLidas > 0 && (
          <span className="tnum absolute -right-1 -top-1 grid min-w-[20px] place-items-center rounded-full bg-neg px-1 text-[11px] font-bold text-white" style={{ height: 20 }}>
            {naoLidas > 99 ? '99+' : naoLidas}
          </span>
        )}
      </button>

      {aberto && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setAberto(false)} />
          <div className="fixed bottom-20 right-5 z-[61] flex max-h-[70vh] w-[360px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div className="font-serif text-base font-semibold text-ink">Alertas</div>
              <div className="flex items-center gap-2">
                {naoLidas > 0 && <button type="button" onClick={lerTodas} className="text-[12px] font-medium text-muted hover:text-ink">Marcar todas</button>}
                <button type="button" onClick={() => setAberto(false)} className="text-muted hover:text-ink" aria-label="Fechar">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {notifs.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-muted">Nenhum alerta.</p>
              ) : (
                notifs.map((n) => (
                  <div key={n.id} className={`border-b border-line/70 px-4 py-3 ${n.lida ? '' : 'bg-brand/5'}`}>
                    <div className="flex items-start gap-2">
                      {!n.lida && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand" />}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-ink">{n.mensagem}</p>
                        {n.contexto && <p className="mt-0.5 text-[12px] text-muted">{n.contexto}</p>}
                        <p className="mt-1 text-[11px] text-muted">{n.deNome ? `de ${n.deNome} · ` : ''}{quando(n.createdAt)}</p>
                      </div>
                      {!n.lida && (
                        <button type="button" onClick={() => lerUma(n.id)} title="Marcar como lida" className="shrink-0 rounded-md p-1 text-muted transition hover:bg-paper hover:text-ink">
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}
