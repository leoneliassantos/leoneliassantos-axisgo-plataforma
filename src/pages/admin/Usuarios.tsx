import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { PasswordInput } from '../../components/PasswordInput'
import { avaliarSenha } from '../../lib/password'
import type { AppUser, Role } from '../../auth/types'

type ModalMode = 'novo' | 'editar' | null

export function Usuarios() {
  const { user, listUsers, createUser, updateUser } = useAuth()
  const [usuarios, setUsuarios] = useState<AppUser[]>([])
  const [carregando, setCarregando] = useState(true)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)

  const [modal, setModal] = useState<ModalMode>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [role, setRole] = useState<Role>('user')
  const [erroForm, setErroForm] = useState('')
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

  function abrirNovo() {
    setModal('novo')
    setEditId(null)
    setNome('')
    setEmail('')
    setSenha('')
    setRole('user')
    setErroForm('')
  }

  function abrirEditar(u: AppUser) {
    setModal('editar')
    setEditId(u.id)
    setNome(u.nome)
    setEmail(u.email)
    setSenha('')
    setRole(u.role)
    setErroForm('')
  }

  function fechar() {
    setModal(null)
  }

  const senhaValida = senha === '' ? modal === 'editar' : avaliarSenha(senha).ok
  const podeSalvar = nome.trim() !== '' && email.trim() !== '' && senhaValida

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErroForm('')
    setSalvando(true)
    let res: { error?: string }
    if (modal === 'novo') {
      res = await createUser({ nome, email, senha, role })
    } else {
      res = await updateUser(editId!, {
        nome,
        email,
        role,
        ...(senha !== '' ? { senha } : {}),
      })
    }
    setSalvando(false)
    if (res.error) {
      setErroForm(res.error)
      return
    }
    setAviso({ tipo: 'ok', texto: modal === 'novo' ? `Usuário "${nome}" criado.` : `Usuário "${nome}" atualizado.` })
    fechar()
    recarregar()
  }

  async function toggleBloqueio(u: AppUser) {
    const res = await updateUser(u.id, { bloqueado: !u.bloqueado })
    if (res.error) {
      setAviso({ tipo: 'erro', texto: res.error })
      return
    }
    setAviso({ tipo: 'ok', texto: `${u.nome} ${!u.bloqueado ? 'bloqueado' : 'desbloqueado'}.` })
    recarregar()
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-brand">Administração</span>
          <h1 className="mt-1 font-serif text-2xl font-semibold text-ink">Gestão de Usuários</h1>
          <p className="mt-1 text-muted">Crie, edite, bloqueie e defina o perfil de acesso de cada pessoa.</p>
        </div>
        <button
          type="button"
          onClick={abrirNovo}
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 font-semibold text-white transition hover:brightness-95"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor">
            <path d="M12 5v14M5 12h14" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Novo usuário
        </button>
      </div>

      {aviso && (
        <div
          className={`rounded-lg border px-3.5 py-2.5 text-sm ${
            aviso.tipo === 'ok' ? 'border-pos/30 bg-pos/5 text-pos' : 'border-neg/30 bg-neg/5 text-neg'
          }`}
        >
          {aviso.texto}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-line bg-paper/60 text-left text-[11px] uppercase tracking-wide text-muted">
              <th className="px-4 py-3 font-semibold">Nome</th>
              <th className="px-4 py-3 font-semibold">E-mail</th>
              <th className="px-4 py-3 font-semibold">Perfil</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 text-right font-semibold">Ações</th>
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted">Carregando…</td>
              </tr>
            ) : (
              usuarios.map((u) => {
                const isSelf = u.id === user?.id
                return (
                  <tr key={u.id} className="border-b border-line/70 last:border-0">
                    <td className="px-4 py-3 font-medium text-ink">
                      {u.nome}
                      {isSelf && <span className="ml-2 text-[11px] font-normal text-muted">(você)</span>}
                    </td>
                    <td className="px-4 py-3 text-muted">{u.email}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          u.role === 'admin' ? 'bg-brand/15 text-brand' : 'bg-brand/10 text-brand'
                        }`}
                      >
                        {u.role === 'admin' ? 'Admin' : 'Usuário'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 text-[12px] font-medium ${
                          u.bloqueado ? 'text-neg' : 'text-pos'
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${u.bloqueado ? 'bg-neg' : 'bg-pos'}`} />
                        {u.bloqueado ? 'Bloqueado' : 'Ativo'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => abrirEditar(u)}
                          className="rounded-md border border-line px-2.5 py-1.5 text-[13px] text-ink transition hover:bg-paper"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleBloqueio(u)}
                          disabled={isSelf}
                          title={isSelf ? 'Você não pode bloquear a própria conta' : undefined}
                          className={`rounded-md border px-2.5 py-1.5 text-[13px] transition disabled:cursor-not-allowed disabled:opacity-40 ${
                            u.bloqueado
                              ? 'border-pos/40 text-pos hover:bg-pos/5'
                              : 'border-neg/40 text-neg hover:bg-neg/5'
                          }`}
                        >
                          {u.bloqueado ? 'Desbloquear' : 'Bloquear'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-ink/40 p-4" onClick={fechar}>
          <form
            onSubmit={salvar}
            onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-md flex-col gap-4 rounded-2xl border border-line bg-surface p-6 shadow-card"
          >
            <div>
              <h2 className="font-serif text-xl font-semibold text-ink">
                {modal === 'novo' ? 'Novo usuário' : 'Editar usuário'}
              </h2>
              <p className="text-sm text-muted">
                {modal === 'novo'
                  ? 'Defina os dados e uma senha segura.'
                  : 'Atualize os dados. Deixe a senha em branco para mantê-la.'}
              </p>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-semibold uppercase tracking-wide text-muted">Nome</span>
              <input
                required
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="rounded-lg border border-line bg-surface px-3.5 py-2.5 text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-semibold uppercase tracking-wide text-muted">E-mail</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-lg border border-line bg-surface px-3.5 py-2.5 text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-semibold uppercase tracking-wide text-muted">Perfil de acesso</span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="rounded-lg border border-line bg-surface px-3.5 py-2.5 text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
              >
                <option value="user">Usuário</option>
                <option value="admin">Administrador</option>
              </select>
            </label>

            <PasswordInput
              value={senha}
              onChange={setSenha}
              strengthMeter
              required={modal === 'novo'}
              label={modal === 'novo' ? 'Senha' : 'Nova senha (opcional)'}
            />

            {erroForm && (
              <div className="rounded-lg border border-neg/30 bg-neg/5 px-3.5 py-2.5 text-sm text-neg">{erroForm}</div>
            )}

            <div className="mt-1 flex justify-end gap-2">
              <button
                type="button"
                onClick={fechar}
                className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-paper"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvando || !podeSalvar}
                className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-50"
              >
                {salvando ? 'Salvando…' : modal === 'novo' ? 'Criar usuário' : 'Salvar alterações'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
