import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../../auth/AuthContext'
import type { AppUser, Role } from '../../auth/types'

export function Usuarios() {
  const { listUsers, createUser } = useAuth()
  const [usuarios, setUsuarios] = useState<AppUser[]>([])
  const [carregando, setCarregando] = useState(true)

  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [role, setRole] = useState<Role>('user')
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function recarregar() {
    setCarregando(true)
    setUsuarios(await listUsers())
    setCarregando(false)
  }

  useEffect(() => {
    recarregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleCriar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    setOk('')
    setSalvando(true)
    const { error } = await createUser({ nome, email, senha, role })
    setSalvando(false)
    if (error) {
      setErro(error)
      return
    }
    setOk(`Usuário "${nome}" criado com sucesso.`)
    setNome('')
    setEmail('')
    setSenha('')
    setRole('user')
    recarregar()
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-copper">Administração</span>
        <h1 className="mt-1 font-serif text-2xl font-semibold text-ink">Usuários</h1>
        <p className="mt-1 text-muted">Cadastre e gerencie quem acessa a plataforma.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* Lista */}
        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-paper/60 text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-semibold">Nome</th>
                <th className="px-4 py-3 font-semibold">E-mail</th>
                <th className="px-4 py-3 font-semibold">Perfil</th>
              </tr>
            </thead>
            <tbody>
              {carregando ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-muted">Carregando…</td>
                </tr>
              ) : (
                usuarios.map((u) => (
                  <tr key={u.id} className="border-b border-line/70 last:border-0">
                    <td className="px-4 py-3 font-medium text-ink">{u.nome}</td>
                    <td className="px-4 py-3 text-muted">{u.email}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          u.role === 'admin' ? 'bg-copper/15 text-copper' : 'bg-teal-tint text-teal'
                        }`}
                      >
                        {u.role === 'admin' ? 'Admin' : 'Usuário'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Form de criação */}
        <form onSubmit={handleCriar} className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6 shadow-card">
          <h2 className="font-serif text-lg font-semibold text-ink">Novo usuário</h2>

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
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold uppercase tracking-wide text-muted">Senha provisória</span>
            <input
              type="text"
              required
              minLength={6}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="rounded-lg border border-line bg-surface px-3.5 py-2.5 text-ink outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/20"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold uppercase tracking-wide text-muted">Perfil</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="rounded-lg border border-line bg-surface px-3.5 py-2.5 text-ink outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/20"
            >
              <option value="user">Usuário</option>
              <option value="admin">Administrador</option>
            </select>
          </label>

          {erro && <div className="rounded-lg border border-neg/30 bg-neg/5 px-3.5 py-2.5 text-sm text-neg">{erro}</div>}
          {ok && <div className="rounded-lg border border-pos/30 bg-pos/5 px-3.5 py-2.5 text-sm text-pos">{ok}</div>}

          <button
            type="submit"
            disabled={salvando}
            className="mt-1 rounded-lg bg-teal px-4 py-2.5 font-semibold text-white transition hover:bg-band disabled:opacity-60"
          >
            {salvando ? 'Criando…' : 'Criar usuário'}
          </button>
        </form>
      </div>
    </div>
  )
}
