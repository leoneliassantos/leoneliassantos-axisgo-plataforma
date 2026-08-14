import { useCallback, useEffect, useMemo, useState } from 'react'
import { Modal, BtnPrimary, BtnGhost } from './Modal'
import { loadCadastros, addCadastro, updateCadastro, setBloqueado, type Cadastro, type TabelaCadastro } from './data'

const TITULO: Record<TabelaCadastro, { titulo: string; singular: string; label: string }> = {
  clientes: { titulo: 'Cadastro de Clientes', singular: 'cliente', label: 'Nome do cliente' },
  uniformes: { titulo: 'Cadastro de Uniformes', singular: 'uniforme', label: 'Nome do uniforme' },
  cores: { titulo: 'Cadastro de Cores', singular: 'cor', label: 'Nome / código da cor' },
  tecidos: { titulo: 'Cadastro de Tecidos', singular: 'tecido', label: 'Nome do tecido' },
  fornecedores: { titulo: 'Cadastro de Fornecedores', singular: 'fornecedor', label: 'Nome do fornecedor' },
}

interface FormState {
  id: string | null
  nome: string
  apelido: string
  contato: string
}

export function Cadastros({ tipo }: { tipo: TabelaCadastro }) {
  const cfg = TITULO[tipo]
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [itens, setItens] = useState<Cadastro[]>([])
  const [busca, setBusca] = useState('')
  const [form, setForm] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [erroForm, setErroForm] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true); setErro(null)
    try { const cad = await loadCadastros(); setItens(cad[tipo]) }
    catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao carregar.') }
    finally { setLoading(false) }
  }, [tipo])
  useEffect(() => { carregar() }, [carregar])

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return t ? itens.filter((c) => [c.nome, c.apelido, c.contato].join(' ').toLowerCase().includes(t)) : itens
  }, [itens, busca])

  async function salvar() {
    if (!form) return
    setErroForm(null)
    if (!form.nome.trim()) { setErroForm('Informe o nome.'); return }
    setSaving(true)
    try {
      if (form.id) {
        await updateCadastro(tipo, form.id, { nome: form.nome, apelido: form.apelido, contato: form.contato })
      } else {
        await addCadastro(tipo, form.nome, tipo === 'clientes' ? { apelido: form.apelido, contato: form.contato } : undefined)
      }
      await carregar()
      setForm(null)
    } catch (e) { setErroForm(e instanceof Error ? e.message : 'Não foi possível salvar.') }
    finally { setSaving(false) }
  }

  async function alternarBloqueio(c: Cadastro) {
    setSaving(true)
    try { await setBloqueado(tipo, c.id, !c.bloqueado); await carregar() }
    catch (e) { alert('Não foi possível alterar: ' + (e instanceof Error ? e.message : '')) }
    finally { setSaving(false) }
  }

  if (loading) return <div className="py-20 text-center text-muted">Carregando…</div>
  if (erro) return <div className="mx-auto mt-10 max-w-lg rounded-xl border border-neg/30 bg-neg/5 p-5 text-center text-neg">{erro}</div>

  const th = 'px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted'
  const td = 'px-3 py-2.5 text-sm text-ink'
  const inp = 'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-ink/40 focus:outline-none'

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted">Operações · Cadastros</div>
          <h1 className="mt-1 font-serif text-2xl font-semibold text-ink">{cfg.titulo}</h1>
        </div>
        <BtnPrimary onClick={() => { setErroForm(null); setForm({ id: null, nome: '', apelido: '', contato: '' }) }}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"><path d="M12 5v14M5 12h14" strokeWidth="2" strokeLinecap="round" /></svg>
          Novo {cfg.singular}
        </BtnPrimary>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"><circle cx="11" cy="11" r="7" strokeWidth="1.8" /><path d="M21 21l-4-4" strokeWidth="1.8" strokeLinecap="round" /></svg>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={`Buscar ${cfg.singular}…`} className="w-full rounded-lg border border-line bg-surface py-2 pl-9 pr-3 text-sm text-ink focus:border-ink/40 focus:outline-none" />
        </div>
        <span className="text-sm text-muted">{visiveis.length} {visiveis.length === 1 ? 'registro' : 'registros'}</span>
      </div>

      {visiveis.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-surface p-12 text-center text-muted">
          Nenhum {cfg.singular} {busca ? 'encontrado' : 'cadastrado'} ainda.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full border-collapse">
            <thead className="bg-paper">
              <tr>
                <th className={th}>Nome</th>
                {tipo === 'clientes' && <><th className={th}>Apelido</th><th className={th}>Contato</th></>}
                <th className={th}>Situação</th>
                <th className={`${th} text-right`}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((c) => (
                <tr key={c.id} className={`border-t border-line-2 ${c.bloqueado ? 'bg-paper/60' : ''}`}>
                  <td className={`${td} font-medium ${c.bloqueado ? 'text-muted line-through' : ''}`}>{c.nome}</td>
                  {tipo === 'clientes' && <><td className={`${td} text-muted`}>{c.apelido || '—'}</td><td className={`${td} text-muted`}>{c.contato || '—'}</td></>}
                  <td className={td}>
                    {c.bloqueado
                      ? <span className="rounded px-1.5 py-0.5 text-[11px] font-medium bg-neg/10 text-neg">Bloqueado</span>
                      : <span className="rounded px-1.5 py-0.5 text-[11px] font-medium bg-pos/10 text-pos">Ativo</span>}
                  </td>
                  <td className={`${td} text-right`}>
                    <div className="inline-flex gap-1.5">
                      <button type="button" onClick={() => { setErroForm(null); setForm({ id: c.id, nome: c.nome, apelido: c.apelido ?? '', contato: c.contato ?? '' }) }} className="rounded-md border border-line px-2.5 py-1 text-[12px] font-medium text-ink transition hover:bg-paper">Editar</button>
                      <button type="button" disabled={saving} onClick={() => alternarBloqueio(c)} className={`rounded-md border px-2.5 py-1 text-[12px] font-medium transition disabled:opacity-50 ${c.bloqueado ? 'border-pos/30 text-pos hover:bg-pos/10' : 'border-neg/30 text-neg hover:bg-neg/10'}`}>
                        {c.bloqueado ? 'Desbloquear' : 'Bloquear'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-[12px] text-muted">Cadastros não são excluídos — para tirar de uso, clique em <b>Bloquear</b> (some do lançamento de novas OPs, mas o histórico é preservado).</p>

      {form && (
        <Modal
          title={form.id ? `Editar ${cfg.singular}` : `Novo ${cfg.singular}`}
          width={460}
          onClose={() => setForm(null)}
          footer={<><BtnGhost onClick={() => setForm(null)} disabled={saving}>Cancelar</BtnGhost><BtnPrimary onClick={salvar} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</BtnPrimary></>}
        >
          <label className="block text-[12px] font-medium text-muted mb-1">{cfg.label} *</label>
          <input autoFocus className={inp} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          {tipo === 'clientes' && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div><label className="block text-[12px] font-medium text-muted mb-1">Apelido / Sigla</label><input className={inp} value={form.apelido} onChange={(e) => setForm({ ...form, apelido: e.target.value })} /></div>
              <div><label className="block text-[12px] font-medium text-muted mb-1">Contato</label><input className={inp} value={form.contato} onChange={(e) => setForm({ ...form, contato: e.target.value })} /></div>
            </div>
          )}
          {erroForm && <p className="mt-3 rounded-lg bg-neg/10 px-3 py-2 text-sm text-neg">{erroForm}</p>}
        </Modal>
      )}
    </div>
  )
}
