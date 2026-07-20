import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'
import { PasswordInput } from '../components/PasswordInput'
import { avaliarSenha } from '../lib/password'

export function MeuPerfil() {
  const { user, updateUser } = useAuth()
  const [nome, setNome] = useState(user?.nome ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [senha, setSenha] = useState('')
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [salvando, setSalvando] = useState(false)

  const senhaOk = senha === '' || avaliarSenha(senha).ok
  const podeSalvar = nome.trim() !== '' && email.trim() !== '' && senhaOk

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setAviso(null)
    setSalvando(true)
    const res = await updateUser(user!.id, { nome, email, ...(senha !== '' ? { senha } : {}) })
    setSalvando(false)
    if (res.error) {
      setAviso({ tipo: 'erro', texto: res.error })
      return
    }
    setSenha('')
    setAviso({ tipo: 'ok', texto: 'Seus dados foram atualizados.' })
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <div>
        <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-copper">Conta</span>
        <h1 className="mt-1 font-serif text-2xl font-semibold text-ink">Meu Perfil</h1>
        <p className="mt-1 text-muted">Atualize seus dados de acesso. Seu perfil é definido pelo administrador.</p>
      </div>

      <form onSubmit={salvar} className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6 shadow-card">
        <div className="flex items-center gap-3 border-b border-line pb-4">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-teal-tint font-serif text-lg font-semibold text-teal">
            {user?.nome?.charAt(0).toUpperCase()}
          </span>
          <div>
            <div className="font-medium text-ink">{user?.nome}</div>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                user?.role === 'admin' ? 'bg-copper/15 text-copper' : 'bg-teal-tint text-teal'
              }`}
            >
              {user?.role === 'admin' ? 'Administrador' : 'Usuário'}
            </span>
          </div>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold uppercase tracking-wide text-muted">Nome</span>
          <input
            required
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="rounded-lg border border-line bg-surface px-3.5 py-2.5 text-ink outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/20"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold uppercase tracking-wide text-muted">E-mail</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-line bg-surface px-3.5 py-2.5 text-ink outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/20"
          />
        </label>

        <PasswordInput value={senha} onChange={setSenha} strengthMeter label="Nova senha (opcional)" />

        {aviso && (
          <div
            className={`rounded-lg border px-3.5 py-2.5 text-sm ${
              aviso.tipo === 'ok' ? 'border-pos/30 bg-pos/5 text-pos' : 'border-neg/30 bg-neg/5 text-neg'
            }`}
          >
            {aviso.texto}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={salvando || !podeSalvar}
            className="rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-band disabled:opacity-50"
          >
            {salvando ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </div>
      </form>
    </div>
  )
}
