import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase, fetchAllRows } from '../../lib/supabase'
import { useAuth } from '../../auth/AuthContext'

/* ================================================================== *
 *  Cadastros · Clientes — Razão Social, CNPJ(s) e sócios de cada cliente.
 *  Um cliente pode ter vários CNPJs; cada CNPJ pode ter vários sócios.
 *  Dados no Supabase (cad_clientes / cad_empresas / cad_socios).
 *  Módulo ADMIN-ONLY (CPF e data de nascimento são dados sensíveis) —
 *  a RLS no Supabase já garante isso; a checagem aqui é só UX.
 * ================================================================== */

interface Cliente { id: string; nome: string; observacoes: string; bloqueado: boolean }
interface Empresa {
  id: string; clienteId: string; razaoSocial: string; nomeFantasia: string; cnpj: string
  ie: string; im: string; endereco: string; telefone: string; email: string; observacoes: string; bloqueado: boolean
}
interface Socio {
  id: string; empresaId: string; nome: string; cpf: string; dataNascimento: string
  telefone: string; email: string; participacao: number | null
}
interface SocioForm {
  id: string | null; empresaId: string; nome: string; cpf: string; dataNascimento: string
  telefone: string; email: string; participacao: string
}

/* ------------------------------- utils ------------------------------- */
const onlyDigits = (s: string) => (s || '').replace(/\D/g, '')
function formatCNPJ(v: string): string {
  const d = onlyDigits(v).slice(0, 14)
  if (d.length <= 2) return d
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}
function formatCPF(v: string): string {
  const d = onlyDigits(v).slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}
function formatDateBR(iso: string): string {
  const m = (iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}
function idade(iso: string): number | null {
  const m = (iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const y = +m[1], mo = +m[2], d = +m[3]
  const hoje = new Date()
  let a = hoje.getFullYear() - y
  if (hoje.getMonth() + 1 < mo || (hoje.getMonth() + 1 === mo && hoje.getDate() < d)) a--
  return a
}
const novoId = () => crypto.randomUUID()

/* --------------------- dados de demonstração (modo local) --------------------- */
function seedDemo(): { clientes: Cliente[]; empresas: Empresa[]; socios: Socio[] } {
  const c1 = novoId(), c2 = novoId()
  const e1 = novoId(), e2 = novoId(), e3 = novoId()
  return {
    clientes: [
      { id: c1, nome: 'Grupo Exemplo Alimentos', observacoes: '', bloqueado: false },
      { id: c2, nome: 'Distribuidora Modelo Ltda', observacoes: '', bloqueado: false },
    ],
    empresas: [
      { id: e1, clienteId: c1, razaoSocial: 'Exemplo Matriz Alimentos Ltda', nomeFantasia: 'Exemplo Matriz', cnpj: '11222333000181', ie: '123.456.789.110', im: '', endereco: '', telefone: '', email: '', observacoes: '', bloqueado: false },
      { id: e2, clienteId: c1, razaoSocial: 'Exemplo Filial Alimentos Ltda', nomeFantasia: 'Exemplo Filial', cnpj: '11222333000262', ie: '123.456.789.220', im: '', endereco: '', telefone: '', email: '', observacoes: '', bloqueado: false },
      { id: e3, clienteId: c2, razaoSocial: 'Distribuidora Modelo Ltda', nomeFantasia: '', cnpj: '44555666000199', ie: '', im: '', endereco: '', telefone: '', email: '', observacoes: '', bloqueado: false },
    ],
    socios: [
      { id: novoId(), empresaId: e1, nome: 'Fulano de Tal', cpf: '11122233344', dataNascimento: '1980-05-12', telefone: '', email: '', participacao: 60 },
      { id: novoId(), empresaId: e1, nome: 'Ciclana de Souza', cpf: '', dataNascimento: '1985-11-03', telefone: '', email: '', participacao: 40 },
      { id: novoId(), empresaId: e3, nome: 'Beltrano Silva', cpf: '', dataNascimento: '1975-02-20', telefone: '', email: '', participacao: null },
    ],
  }
}

/* ============================ Componente ============================ */
export function CadastroClientes() {
  const { user, mode } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [socios, setSocios] = useState<Socio[]>([])
  const [busca, setBusca] = useState('')
  const [abertos, setAbertos] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [erroForm, setErroForm] = useState<string | null>(null)

  const [formCliente, setFormCliente] = useState<{ id: string | null; nome: string; observacoes: string } | null>(null)
  const [formEmpresa, setFormEmpresa] = useState<{
    id: string | null; clienteId: string; razaoSocial: string; nomeFantasia: string; cnpj: string
    ie: string; im: string; endereco: string; telefone: string; email: string; observacoes: string
  } | null>(null)
  const [socioEmpresa, setSocioEmpresa] = useState<Empresa | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true); setErro(null)
    if (mode !== 'supabase' || !supabase) {
      const seed = seedDemo()
      setClientes(seed.clientes); setEmpresas(seed.empresas); setSocios(seed.socios)
      setLoading(false)
      return
    }
    const [rc, re, rs] = await Promise.all([
      fetchAllRows<{ id: string; nome: string; observacoes: string | null; bloqueado: boolean }>((from, to) =>
        supabase!.from('cad_clientes').select('id, nome, observacoes, bloqueado').order('nome').range(from, to)),
      fetchAllRows<{
        id: string; cliente_id: string; razao_social: string; nome_fantasia: string | null; cnpj: string
        inscricao_estadual: string | null; inscricao_municipal: string | null; endereco: string | null
        telefone: string | null; email: string | null; observacoes: string | null; bloqueado: boolean
      }>((from, to) =>
        supabase!.from('cad_empresas')
          .select('id, cliente_id, razao_social, nome_fantasia, cnpj, inscricao_estadual, inscricao_municipal, endereco, telefone, email, observacoes, bloqueado')
          .order('razao_social').range(from, to)),
      fetchAllRows<{
        id: string; empresa_id: string; nome: string; cpf: string | null; data_nascimento: string | null
        telefone: string | null; email: string | null; participacao: number | null
      }>((from, to) =>
        supabase!.from('cad_socios').select('id, empresa_id, nome, cpf, data_nascimento, telefone, email, participacao').order('nome').range(from, to)),
    ])
    if (rc.error || re.error || rs.error) {
      setErro('Não foi possível carregar os cadastros. Verifique se as tabelas cad_clientes/cad_empresas/cad_socios foram criadas no Supabase.')
      setLoading(false)
      return
    }
    setClientes(rc.data.map((r) => ({ id: r.id, nome: r.nome, observacoes: r.observacoes ?? '', bloqueado: r.bloqueado })))
    setEmpresas(re.data.map((r) => ({
      id: r.id, clienteId: r.cliente_id, razaoSocial: r.razao_social, nomeFantasia: r.nome_fantasia ?? '', cnpj: r.cnpj,
      ie: r.inscricao_estadual ?? '', im: r.inscricao_municipal ?? '', endereco: r.endereco ?? '', telefone: r.telefone ?? '',
      email: r.email ?? '', observacoes: r.observacoes ?? '', bloqueado: r.bloqueado,
    })))
    setSocios(rs.data.map((r) => ({
      id: r.id, empresaId: r.empresa_id, nome: r.nome, cpf: r.cpf ?? '', dataNascimento: r.data_nascimento ?? '',
      telefone: r.telefone ?? '', email: r.email ?? '', participacao: r.participacao,
    })))
    setLoading(false)
  }, [mode])
  useEffect(() => { carregar() }, [carregar])

  const empresasPorCliente = useMemo(() => {
    const mp = new Map<string, Empresa[]>()
    for (const e of empresas) { const arr = mp.get(e.clienteId) ?? []; arr.push(e); mp.set(e.clienteId, arr) }
    return mp
  }, [empresas])
  const sociosPorEmpresa = useMemo(() => {
    const mp = new Map<string, Socio[]>()
    for (const s of socios) { const arr = mp.get(s.empresaId) ?? []; arr.push(s); mp.set(s.empresaId, arr) }
    return mp
  }, [socios])

  const clientesVisiveis = useMemo(() => {
    const t = busca.trim().toLowerCase()
    if (!t) return clientes
    const td = onlyDigits(busca)
    return clientes.filter((c) => {
      if (c.nome.toLowerCase().includes(t)) return true
      const emp = empresasPorCliente.get(c.id) ?? []
      return emp.some((e) =>
        e.razaoSocial.toLowerCase().includes(t) ||
        e.nomeFantasia.toLowerCase().includes(t) ||
        (td.length > 0 && e.cnpj.includes(td)))
    })
  }, [clientes, busca, empresasPorCliente])

  function toggleAberto(id: string) {
    setAbertos((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  /* ---------------- cliente ---------------- */
  async function salvarCliente() {
    if (!formCliente) return
    setErroForm(null)
    if (!formCliente.nome.trim()) { setErroForm('Informe o nome do cliente.'); return }
    setSaving(true)
    try {
      if (mode === 'supabase' && supabase) {
        if (formCliente.id) {
          const { error } = await supabase.from('cad_clientes').update({ nome: formCliente.nome.trim(), observacoes: formCliente.observacoes.trim() || null }).eq('id', formCliente.id)
          if (error) throw new Error(error.message)
        } else {
          const { error } = await supabase.from('cad_clientes').insert({ nome: formCliente.nome.trim(), observacoes: formCliente.observacoes.trim() || null })
          if (error) throw new Error(error.message)
        }
        await carregar()
      } else if (formCliente.id) {
        setClientes((prev) => prev.map((c) => c.id === formCliente.id ? { ...c, nome: formCliente.nome.trim(), observacoes: formCliente.observacoes.trim() } : c))
      } else {
        setClientes((prev) => [...prev, { id: novoId(), nome: formCliente.nome.trim(), observacoes: formCliente.observacoes.trim(), bloqueado: false }])
      }
      setFormCliente(null)
    } catch (e) { setErroForm(e instanceof Error ? e.message : 'Não foi possível salvar.') }
    finally { setSaving(false) }
  }
  async function alternarBloqueioCliente(c: Cliente) {
    setSaving(true)
    try {
      if (mode === 'supabase' && supabase) {
        const { error } = await supabase.from('cad_clientes').update({ bloqueado: !c.bloqueado }).eq('id', c.id)
        if (error) throw new Error(error.message)
        await carregar()
      } else {
        setClientes((prev) => prev.map((x) => x.id === c.id ? { ...x, bloqueado: !x.bloqueado } : x))
      }
    } catch (e) { window.alert('Não foi possível alterar: ' + (e instanceof Error ? e.message : '')) }
    finally { setSaving(false) }
  }

  /* ---------------- empresa (CNPJ) ---------------- */
  async function salvarEmpresa() {
    if (!formEmpresa) return
    setErroForm(null)
    if (!formEmpresa.razaoSocial.trim()) { setErroForm('Informe a razão social.'); return }
    const cnpjDigits = onlyDigits(formEmpresa.cnpj)
    if (cnpjDigits.length !== 14) { setErroForm('CNPJ inválido — precisa ter 14 dígitos.'); return }
    setSaving(true)
    try {
      const payload = {
        cliente_id: formEmpresa.clienteId,
        razao_social: formEmpresa.razaoSocial.trim(),
        nome_fantasia: formEmpresa.nomeFantasia.trim() || null,
        cnpj: cnpjDigits,
        inscricao_estadual: formEmpresa.ie.trim() || null,
        inscricao_municipal: formEmpresa.im.trim() || null,
        endereco: formEmpresa.endereco.trim() || null,
        telefone: formEmpresa.telefone.trim() || null,
        email: formEmpresa.email.trim() || null,
        observacoes: formEmpresa.observacoes.trim() || null,
      }
      if (mode === 'supabase' && supabase) {
        const dupMsg = 'Este CNPJ já está cadastrado em outra empresa.'
        if (formEmpresa.id) {
          const { error } = await supabase.from('cad_empresas').update(payload).eq('id', formEmpresa.id)
          if (error) throw new Error(/duplicate key/i.test(error.message) ? dupMsg : error.message)
        } else {
          const { error } = await supabase.from('cad_empresas').insert(payload)
          if (error) throw new Error(/duplicate key/i.test(error.message) ? dupMsg : error.message)
        }
        await carregar()
      } else {
        if (empresas.some((e) => e.cnpj === cnpjDigits && e.id !== formEmpresa.id)) throw new Error('Este CNPJ já está cadastrado em outra empresa.')
        if (formEmpresa.id) {
          setEmpresas((prev) => prev.map((e) => e.id === formEmpresa.id ? {
            ...e, razaoSocial: payload.razao_social, nomeFantasia: payload.nome_fantasia ?? '', cnpj: payload.cnpj,
            ie: payload.inscricao_estadual ?? '', im: payload.inscricao_municipal ?? '', endereco: payload.endereco ?? '',
            telefone: payload.telefone ?? '', email: payload.email ?? '', observacoes: payload.observacoes ?? '',
          } : e))
        } else {
          setEmpresas((prev) => [...prev, {
            id: novoId(), clienteId: formEmpresa.clienteId, razaoSocial: payload.razao_social, nomeFantasia: payload.nome_fantasia ?? '',
            cnpj: payload.cnpj, ie: payload.inscricao_estadual ?? '', im: payload.inscricao_municipal ?? '', endereco: payload.endereco ?? '',
            telefone: payload.telefone ?? '', email: payload.email ?? '', observacoes: payload.observacoes ?? '', bloqueado: false,
          }])
        }
      }
      setFormEmpresa(null)
    } catch (e) { setErroForm(e instanceof Error ? e.message : 'Não foi possível salvar.') }
    finally { setSaving(false) }
  }
  async function alternarBloqueioEmpresa(e: Empresa) {
    setSaving(true)
    try {
      if (mode === 'supabase' && supabase) {
        const { error } = await supabase.from('cad_empresas').update({ bloqueado: !e.bloqueado }).eq('id', e.id)
        if (error) throw new Error(error.message)
        await carregar()
      } else {
        setEmpresas((prev) => prev.map((x) => x.id === e.id ? { ...x, bloqueado: !x.bloqueado } : x))
      }
    } catch (err) { window.alert('Não foi possível alterar: ' + (err instanceof Error ? err.message : '')) }
    finally { setSaving(false) }
  }

  /* ---------------- sócios ---------------- */
  async function salvarSocio(s: SocioForm) {
    if (!s.nome.trim()) { window.alert('Informe o nome do sócio.'); return }
    const cpfDigits = onlyDigits(s.cpf)
    if (cpfDigits && cpfDigits.length !== 11) { window.alert('CPF inválido — precisa ter 11 dígitos (ou deixe em branco).'); return }
    const participacao = s.participacao.trim() ? Number(s.participacao.replace(',', '.')) : null
    const payload = {
      empresa_id: s.empresaId, nome: s.nome.trim(), cpf: cpfDigits || null, data_nascimento: s.dataNascimento || null,
      telefone: s.telefone.trim() || null, email: s.email.trim() || null, participacao,
    }
    setSaving(true)
    try {
      if (mode === 'supabase' && supabase) {
        if (s.id) { const { error } = await supabase.from('cad_socios').update(payload).eq('id', s.id); if (error) throw new Error(error.message) }
        else { const { error } = await supabase.from('cad_socios').insert(payload); if (error) throw new Error(error.message) }
        await carregar()
      } else if (s.id) {
        setSocios((prev) => prev.map((x) => x.id === s.id ? {
          ...x, nome: payload.nome, cpf: payload.cpf ?? '', dataNascimento: payload.data_nascimento ?? '',
          telefone: payload.telefone ?? '', email: payload.email ?? '', participacao: payload.participacao,
        } : x))
      } else {
        setSocios((prev) => [...prev, {
          id: novoId(), empresaId: payload.empresa_id, nome: payload.nome, cpf: payload.cpf ?? '',
          dataNascimento: payload.data_nascimento ?? '', telefone: payload.telefone ?? '', email: payload.email ?? '',
          participacao: payload.participacao,
        }])
      }
    } catch (e) { window.alert('Não foi possível salvar o sócio: ' + (e instanceof Error ? e.message : '')) }
    finally { setSaving(false) }
  }
  async function excluirSocio(id: string) {
    if (!window.confirm('Excluir este sócio? Essa ação não pode ser desfeita.')) return
    setSaving(true)
    try {
      if (mode === 'supabase' && supabase) {
        const { error } = await supabase.from('cad_socios').delete().eq('id', id)
        if (error) throw new Error(error.message)
        await carregar()
      } else {
        setSocios((prev) => prev.filter((x) => x.id !== id))
      }
    } catch (e) { window.alert('Não foi possível excluir: ' + (e instanceof Error ? e.message : '')) }
    finally { setSaving(false) }
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-2xl border border-line bg-surface p-8 text-center">
        <h1 className="font-serif text-xl font-semibold text-ink">Acesso restrito</h1>
        <p className="mt-2 text-[13px] text-muted">Este cadastro guarda dados pessoais dos sócios (CPF, data de nascimento) e por isso é visível só para administradores.</p>
      </div>
    )
  }
  if (loading) return <div className="py-20 text-center text-muted">Carregando…</div>
  if (erro) return <div className="mx-auto mt-10 max-w-lg rounded-xl border border-neg/30 bg-neg/5 p-5 text-center text-neg">{erro}</div>

  const inp = 'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-ink/40 focus:outline-none'
  const th = 'px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted'
  const td = 'px-3 py-2.5 text-sm text-ink'

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted">Cadastros</div>
          <h1 className="mt-1 font-serif text-2xl font-semibold text-ink">Clientes</h1>
          <p className="mt-1 max-w-xl text-[12.5px] text-muted">Razão social, CNPJ(s) e sócios de cada cliente — um cliente pode ter quantos CNPJs forem necessários.</p>
        </div>
        <button onClick={() => { setErroForm(null); setFormCliente({ id: null, nome: '', observacoes: '' }) }} className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3.5 py-2 text-[13px] font-bold text-white transition hover:brightness-125">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"><path d="M12 5v14M5 12h14" strokeWidth="2" strokeLinecap="round" /></svg>
          Novo cliente
        </button>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"><circle cx="11" cy="11" r="7" strokeWidth="1.8" /><path d="M21 21l-4-4" strokeWidth="1.8" strokeLinecap="round" /></svg>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por cliente, razão social ou CNPJ…" className="w-full rounded-lg border border-line bg-surface py-2 pl-9 pr-3 text-sm text-ink focus:border-ink/40 focus:outline-none" />
        </div>
        <span className="text-sm text-muted">{clientesVisiveis.length} {clientesVisiveis.length === 1 ? 'cliente' : 'clientes'}</span>
      </div>

      {clientesVisiveis.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-surface p-12 text-center text-muted">Nenhum cliente {busca ? 'encontrado' : 'cadastrado'} ainda.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full border-collapse">
            <thead className="bg-paper">
              <tr>
                <th className={th} />
                <th className={th}>Cliente</th>
                <th className={th}>CNPJs</th>
                <th className={th}>Situação</th>
                <th className={`${th} text-right`}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {clientesVisiveis.map((c) => {
                const emp = (empresasPorCliente.get(c.id) ?? []).slice().sort((a, b) => a.razaoSocial.localeCompare(b.razaoSocial))
                const aberto = abertos.has(c.id)
                return (
                  <Fragment key={c.id}>
                    <tr className={`border-t border-line-2 ${c.bloqueado ? 'bg-paper/60' : ''}`}>
                      <td className={`${td} w-8`}>
                        <button onClick={() => toggleAberto(c.id)} className="grid h-6 w-6 place-items-center rounded text-muted hover:bg-paper" title={aberto ? 'Recolher' : 'Ver CNPJs'}>
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" style={{ transform: aberto ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}><path d="M9 6l6 6-6 6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </button>
                      </td>
                      <td className={`${td} font-medium ${c.bloqueado ? 'text-muted line-through' : ''}`}>{c.nome}</td>
                      <td className={`${td} text-muted`}>{emp.length}</td>
                      <td className={td}>
                        {c.bloqueado
                          ? <span className="rounded bg-neg/10 px-1.5 py-0.5 text-[11px] font-medium text-neg">Bloqueado</span>
                          : <span className="rounded bg-pos/10 px-1.5 py-0.5 text-[11px] font-medium text-pos">Ativo</span>}
                      </td>
                      <td className={`${td} text-right`}>
                        <div className="inline-flex gap-1.5">
                          <button onClick={() => { setErroForm(null); setFormEmpresa({ id: null, clienteId: c.id, razaoSocial: '', nomeFantasia: '', cnpj: '', ie: '', im: '', endereco: '', telefone: '', email: '', observacoes: '' }) }} className="rounded-md border border-line px-2.5 py-1 text-[12px] font-medium text-ink transition hover:bg-paper">+ CNPJ</button>
                          <button onClick={() => { setErroForm(null); setFormCliente({ id: c.id, nome: c.nome, observacoes: c.observacoes }) }} className="rounded-md border border-line px-2.5 py-1 text-[12px] font-medium text-ink transition hover:bg-paper">Editar</button>
                          <button disabled={saving} onClick={() => alternarBloqueioCliente(c)} className={`rounded-md border px-2.5 py-1 text-[12px] font-medium transition disabled:opacity-50 ${c.bloqueado ? 'border-pos/30 text-pos hover:bg-pos/10' : 'border-neg/30 text-neg hover:bg-neg/10'}`}>
                            {c.bloqueado ? 'Desbloquear' : 'Bloquear'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {aberto && (
                      <tr className="border-t border-line-2 bg-paper/40">
                        <td />
                        <td colSpan={4} className="px-3 py-3">
                          {emp.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-line bg-surface px-4 py-3 text-[12.5px] text-muted">Nenhum CNPJ cadastrado para este cliente ainda.</div>
                          ) : (
                            <div className="overflow-x-auto rounded-lg border border-line bg-surface">
                              <table className="w-full border-collapse text-[12.5px]">
                                <thead className="bg-paper/70">
                                  <tr>
                                    <th className={th}>Razão social</th>
                                    <th className={th}>CNPJ</th>
                                    <th className={th}>Insc. Estadual</th>
                                    <th className={th}>Sócios</th>
                                    <th className={th}>Situação</th>
                                    <th className={`${th} text-right`}>Ações</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {emp.map((e) => {
                                    const soc = sociosPorEmpresa.get(e.id) ?? []
                                    return (
                                      <tr key={e.id} className={`border-t border-line-2 ${e.bloqueado ? 'bg-paper/60' : ''}`}>
                                        <td className={`px-3 py-2 ${e.bloqueado ? 'text-muted line-through' : 'text-ink'}`}>
                                          <div className="font-medium">{e.razaoSocial}</div>
                                          {e.nomeFantasia && <div className="text-[11px] text-muted">{e.nomeFantasia}</div>}
                                        </td>
                                        <td className="px-3 py-2 tabular-nums text-muted">{formatCNPJ(e.cnpj)}</td>
                                        <td className="px-3 py-2 text-muted">{e.ie || '—'}</td>
                                        <td className="px-3 py-2">
                                          <button onClick={() => setSocioEmpresa(e)} className="rounded-md border border-line px-2 py-0.5 text-[11px] font-semibold text-ink hover:bg-paper">{soc.length} {soc.length === 1 ? 'sócio' : 'sócios'}</button>
                                        </td>
                                        <td className="px-3 py-2">
                                          {e.bloqueado
                                            ? <span className="rounded bg-neg/10 px-1.5 py-0.5 text-[11px] font-medium text-neg">Bloqueado</span>
                                            : <span className="rounded bg-pos/10 px-1.5 py-0.5 text-[11px] font-medium text-pos">Ativo</span>}
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                          <div className="inline-flex gap-1.5">
                                            <button onClick={() => { setErroForm(null); setFormEmpresa({ id: e.id, clienteId: e.clienteId, razaoSocial: e.razaoSocial, nomeFantasia: e.nomeFantasia, cnpj: formatCNPJ(e.cnpj), ie: e.ie, im: e.im, endereco: e.endereco, telefone: e.telefone, email: e.email, observacoes: e.observacoes }) }} className="rounded-md border border-line px-2 py-0.5 text-[11px] font-medium text-ink transition hover:bg-paper">Editar</button>
                                            <button disabled={saving} onClick={() => alternarBloqueioEmpresa(e)} className={`rounded-md border px-2 py-0.5 text-[11px] font-medium transition disabled:opacity-50 ${e.bloqueado ? 'border-pos/30 text-pos hover:bg-pos/10' : 'border-neg/30 text-neg hover:bg-neg/10'}`}>
                                              {e.bloqueado ? 'Desbloquear' : 'Bloquear'}
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-[12px] text-muted">Clientes e CNPJs não são excluídos — para tirar de uso, clique em <b>Bloquear</b> (o histórico é preservado). Sócios podem ser excluídos individualmente.</p>

      {formCliente && (
        <Overlay onClose={() => setFormCliente(null)}>
          <h3 className="text-[15px] font-bold text-ink">{formCliente.id ? 'Editar cliente' : 'Novo cliente'}</h3>
          <div className="mt-3">
            <label className="mb-1 block text-[12px] font-medium text-muted">Nome do cliente *</label>
            <input autoFocus className={inp} value={formCliente.nome} onChange={(e) => setFormCliente({ ...formCliente, nome: e.target.value })} />
          </div>
          <div className="mt-3">
            <label className="mb-1 block text-[12px] font-medium text-muted">Observações</label>
            <textarea rows={2} className={inp} value={formCliente.observacoes} onChange={(e) => setFormCliente({ ...formCliente, observacoes: e.target.value })} />
          </div>
          {erroForm && <p className="mt-3 rounded-lg bg-neg/10 px-3 py-2 text-sm text-neg">{erroForm}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setFormCliente(null)} disabled={saving} className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-semibold text-muted hover:bg-paper">Cancelar</button>
            <button onClick={salvarCliente} disabled={saving} className="rounded-lg bg-ink px-4 py-1.5 text-[12px] font-bold text-white hover:brightness-125">{saving ? 'Salvando…' : 'Salvar'}</button>
          </div>
        </Overlay>
      )}

      {formEmpresa && (
        <Overlay onClose={() => setFormEmpresa(null)} wide>
          <h3 className="text-[15px] font-bold text-ink">{formEmpresa.id ? 'Editar CNPJ' : 'Novo CNPJ'}</h3>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="mb-1 block text-[12px] font-medium text-muted">Razão social *</label>
              <input autoFocus className={inp} value={formEmpresa.razaoSocial} onChange={(e) => setFormEmpresa({ ...formEmpresa, razaoSocial: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-muted">Nome fantasia</label>
              <input className={inp} value={formEmpresa.nomeFantasia} onChange={(e) => setFormEmpresa({ ...formEmpresa, nomeFantasia: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-muted">CNPJ *</label>
              <input className={inp} value={formEmpresa.cnpj} onChange={(e) => setFormEmpresa({ ...formEmpresa, cnpj: formatCNPJ(e.target.value) })} placeholder="00.000.000/0000-00" />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-muted">Inscrição Estadual</label>
              <input className={inp} value={formEmpresa.ie} onChange={(e) => setFormEmpresa({ ...formEmpresa, ie: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-muted">Inscrição Municipal</label>
              <input className={inp} value={formEmpresa.im} onChange={(e) => setFormEmpresa({ ...formEmpresa, im: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-muted">Telefone</label>
              <input className={inp} value={formEmpresa.telefone} onChange={(e) => setFormEmpresa({ ...formEmpresa, telefone: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-muted">E-mail</label>
              <input className={inp} value={formEmpresa.email} onChange={(e) => setFormEmpresa({ ...formEmpresa, email: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-[12px] font-medium text-muted">Endereço</label>
              <input className={inp} value={formEmpresa.endereco} onChange={(e) => setFormEmpresa({ ...formEmpresa, endereco: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-[12px] font-medium text-muted">Observações</label>
              <textarea rows={2} className={inp} value={formEmpresa.observacoes} onChange={(e) => setFormEmpresa({ ...formEmpresa, observacoes: e.target.value })} />
            </div>
          </div>
          {erroForm && <p className="mt-3 rounded-lg bg-neg/10 px-3 py-2 text-sm text-neg">{erroForm}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setFormEmpresa(null)} disabled={saving} className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-semibold text-muted hover:bg-paper">Cancelar</button>
            <button onClick={salvarEmpresa} disabled={saving} className="rounded-lg bg-ink px-4 py-1.5 text-[12px] font-bold text-white hover:brightness-125">{saving ? 'Salvando…' : 'Salvar'}</button>
          </div>
        </Overlay>
      )}

      {socioEmpresa && (
        <ModalSocios
          empresa={socioEmpresa}
          socios={(sociosPorEmpresa.get(socioEmpresa.id) ?? []).slice().sort((a, b) => a.nome.localeCompare(b.nome))}
          onSalvar={salvarSocio}
          onExcluir={excluirSocio}
          onClose={() => setSocioEmpresa(null)}
        />
      )}
    </div>
  )
}

/* ============================ overlay/modal ============================ */
function Overlay({ children, onClose, wide }: { children: ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className={`max-h-[90vh] w-full ${wide ? 'max-w-2xl' : 'max-w-md'} overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl`} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

function ModalSocios({ empresa, socios, onSalvar, onExcluir, onClose }: {
  empresa: Empresa; socios: Socio[]
  onSalvar: (s: SocioForm) => void | Promise<void>; onExcluir: (id: string) => void | Promise<void>; onClose: () => void
}) {
  const vazio: SocioForm = { id: null, empresaId: empresa.id, nome: '', cpf: '', dataNascimento: '', telefone: '', email: '', participacao: '' }
  const [editando, setEditando] = useState<SocioForm | null>(null)
  const inp = 'w-full rounded-md border border-line bg-white px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-ink/40'

  function abrirNovo() { setEditando(vazio) }
  function abrirEdicao(s: Socio) {
    setEditando({ id: s.id, empresaId: s.empresaId, nome: s.nome, cpf: formatCPF(s.cpf), dataNascimento: s.dataNascimento, telefone: s.telefone, email: s.email, participacao: s.participacao != null ? String(s.participacao) : '' })
  }
  async function salvar() { if (!editando) return; await onSalvar(editando); setEditando(null) }

  return (
    <Overlay onClose={onClose} wide>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-bold text-ink">Sócios</h3>
          <p className="text-[12px] text-muted">{empresa.razaoSocial} · {formatCNPJ(empresa.cnpj)}</p>
        </div>
        {!editando && <button onClick={abrirNovo} className="shrink-0 rounded-lg bg-ink px-3 py-1.5 text-[12px] font-bold text-white hover:brightness-125">+ Novo sócio</button>}
      </div>

      {editando ? (
        <div className="mt-4 flex flex-col gap-3 rounded-lg border border-line bg-paper/40 p-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2 text-[12px] font-semibold text-ink">Nome *
              <input autoFocus value={editando.nome} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} className={`mt-1 ${inp}`} />
            </label>
            <label className="text-[12px] font-semibold text-ink">Data de nascimento
              <input type="date" value={editando.dataNascimento} onChange={(e) => setEditando({ ...editando, dataNascimento: e.target.value })} className={`mt-1 ${inp}`} />
            </label>
            <label className="text-[12px] font-semibold text-ink">CPF
              <input value={editando.cpf} onChange={(e) => setEditando({ ...editando, cpf: formatCPF(e.target.value) })} placeholder="000.000.000-00" className={`mt-1 ${inp}`} />
            </label>
            <label className="text-[12px] font-semibold text-ink">Telefone
              <input value={editando.telefone} onChange={(e) => setEditando({ ...editando, telefone: e.target.value })} className={`mt-1 ${inp}`} />
            </label>
            <label className="text-[12px] font-semibold text-ink">E-mail
              <input value={editando.email} onChange={(e) => setEditando({ ...editando, email: e.target.value })} className={`mt-1 ${inp}`} />
            </label>
            <label className="text-[12px] font-semibold text-ink">Participação (%)
              <input value={editando.participacao} onChange={(e) => setEditando({ ...editando, participacao: e.target.value })} placeholder="ex.: 50" inputMode="decimal" className={`mt-1 ${inp}`} />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditando(null)} className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-semibold text-muted hover:bg-paper">Cancelar</button>
            <button onClick={salvar} className="rounded-lg bg-ink px-4 py-1.5 text-[12px] font-bold text-white hover:brightness-125">Salvar</button>
          </div>
        </div>
      ) : (
        <div className="mt-3 max-h-[46vh] overflow-y-auto rounded-lg border border-line">
          <table className="w-full text-left text-[12px]">
            <thead className="sticky top-0 bg-paper">
              <tr className="text-[11px] uppercase tracking-wide text-muted">
                <th className="px-3 py-2 font-semibold">Nome</th>
                <th className="px-3 py-2 font-semibold">Nascimento</th>
                <th className="px-3 py-2 font-semibold">CPF</th>
                <th className="px-3 py-2 font-semibold">Participação</th>
                <th className="px-3 py-2 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {socios.map((s) => (
                <tr key={s.id} className="border-t border-line/60">
                  <td className="px-3 py-1.5 text-ink">{s.nome}</td>
                  <td className="px-3 py-1.5 text-muted">{s.dataNascimento ? `${formatDateBR(s.dataNascimento)} (${idade(s.dataNascimento)} anos)` : '—'}</td>
                  <td className="px-3 py-1.5 text-muted">{s.cpf ? formatCPF(s.cpf) : '—'}</td>
                  <td className="px-3 py-1.5 text-muted">{s.participacao != null ? `${s.participacao}%` : '—'}</td>
                  <td className="px-3 py-1.5 text-right">
                    <button onClick={() => abrirEdicao(s)} className="mr-2 text-[11px] font-semibold text-ink underline hover:opacity-70">editar</button>
                    <button onClick={() => onExcluir(s.id)} className="text-[11px] font-semibold text-red-700 underline hover:opacity-70">excluir</button>
                  </td>
                </tr>
              ))}
              {socios.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-muted">Nenhum sócio cadastrado para este CNPJ ainda.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <button onClick={onClose} className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-semibold text-muted hover:bg-paper">Fechar</button>
      </div>
    </Overlay>
  )
}
