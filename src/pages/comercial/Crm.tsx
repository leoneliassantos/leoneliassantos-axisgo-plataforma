import {
  useCallback, useMemo, useRef, useState,
  type ChangeEvent, type ReactNode,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { Modal } from '../operacoes/Modal'
import {
  Badge, Btn, Card, Field, Ico, Input, Select, Sheet, Tabs, Textarea,
  ToastProvider, useToast,
} from './ui'
import {
  agora, brl, brlc, corEtapa, dmy, ehAtrasado, iniciais,
  loadDB, resetDB, saveDB, tempCor, uid, propCor,
  CANAIS, ETAPAS, MOTIVOS_PERDA, ORIGENS, TEMPS, TIPOS_ATIVIDADE, TIPOS_OP,
  type ComercialDB, type Compromisso, type EtapaCRM, type Lead,
  type OrigemComercial, type StatusProposta, type Temperatura, type TipoOportunidade,
} from './data'

/* ================================================================== *
 *  Store local (localStorage) — espelha o update() do MVP da Fukuda
 * ================================================================== */

function useStore() {
  const [db, setDb] = useState<ComercialDB>(loadDB)
  const update = useCallback((fn: (d: ComercialDB) => void) => {
    setDb((prev) => {
      const next = structuredClone(prev) as ComercialDB
      fn(next)
      saveDB(next)
      return next
    })
  }, [])
  return { db, setDb, update }
}

/* ================================================================== *
 *  Componente do módulo (registrado no registry)
 * ================================================================== */

export function Crm() {
  return (
    <ToastProvider>
      <CrmBoard />
    </ToastProvider>
  )
}

function CrmBoard() {
  const { db, setDb, update } = useStore()
  const { user } = useAuth()
  const { notify } = useToast()

  const [fConsultor, setFConsultor] = useState('all')
  const [fOrigem, setFOrigem] = useState('all')
  const [fTipo, setFTipo] = useState('all')
  const [fTemp, setFTemp] = useState('all')
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<string | null>(null)
  const [novo, setNovo] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)

  const consultores = useMemo(
    () => [...new Set(db.leads.map((l) => l.consultor).filter(Boolean))].sort(),
    [db.leads],
  )

  const leads = useMemo(
    () =>
      db.leads.filter((l) => {
        if (fConsultor !== 'all' && l.consultor !== fConsultor) return false
        if (fOrigem !== 'all' && l.origem !== fOrigem) return false
        if (fTipo !== 'all' && l.tipo !== fTipo) return false
        if (fTemp !== 'all' && l.temperatura !== fTemp) return false
        if (q && !`${l.nome} ${l.empresa} ${l.produtoInteresse}`.toLowerCase().includes(q.toLowerCase())) return false
        return true
      }),
    [db.leads, fConsultor, fOrigem, fTipo, fTemp, q],
  )

  const porEtapa = (et: EtapaCRM) => leads.filter((l) => l.etapa === et)
  const selLead = sel ? db.leads.find((l) => l.id === sel) ?? null : null
  const temFiltro = fConsultor !== 'all' || fOrigem !== 'all' || fTipo !== 'all' || fTemp !== 'all' || !!q

  const moverEtapa = (leadId: string, etapa: EtapaCRM) => {
    update((d) => {
      const l = d.leads.find((x) => x.id === leadId)
      if (!l || l.etapa === etapa) return
      l.atividades.unshift({ data: agora(), tipo: 'Etapa', texto: `Etapa: ${l.etapa} → ${etapa}` })
      l.etapa = etapa
      l.atualizadoEm = agora()
      if (etapa === 'Fechado ganho') l.probabilidade = 100
      if (etapa === 'Fechado perdido') l.probabilidade = 0
    })
  }

  const onDropLead = (etapa: EtapaCRM) => {
    if (!dragId) return
    const lead = db.leads.find((l) => l.id === dragId)
    setDragId(null)
    if (lead && lead.etapa !== etapa) {
      moverEtapa(lead.id, etapa)
      notify({ title: 'Lead movido', desc: `${lead.nome} → ${etapa}` })
    }
  }

  const limparExemplos = () => {
    if (!window.confirm('Isto apaga TODOS os leads e a agenda deste navegador. Continuar?')) return
    setDb(resetDB())
    setSel(null)
    notify({ kind: 'info', title: 'Dados zerados', desc: 'CRM pronto para os dados reais da MM.' })
  }

  const totalPipeline = leads
    .filter((l) => l.etapa !== 'Fechado perdido' && l.etapa !== 'Fechado ganho')
    .reduce((a, l) => a + l.valorPotencial, 0)

  return (
    <div className="mx-auto max-w-content">
      {/* Cabeçalho */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-xl font-semibold text-ink">CRM — Funil comercial</h1>
          <p className="text-sm text-muted">Arraste os cards entre as etapas do funil.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge color="#7A6CF0">{leads.length} oportunidades</Badge>
          <Badge color="#15805A">{brlc(totalPipeline)} em pipeline</Badge>
          <Btn variant="secondary" sm onClick={limparExemplos} title="Apagar os dados de exemplo">
            <Ico n="broom" s={14} /> Limpar exemplos
          </Btn>
          <Btn variant="accent" sm onClick={() => setNovo(true)}>
            <Ico n="plus" s={15} /> Novo lead
          </Btn>
        </div>
      </div>

      {/* Filtros */}
      <Card className="mb-4 flex flex-wrap items-end gap-2 p-3">
        <div className="w-48"><Field label="Buscar"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Contato, empresa ou produto…" /></Field></div>
        <div className="w-40"><Field label="Consultor"><Select value={fConsultor} onChange={(e) => setFConsultor(e.target.value)}><option value="all">Todos</option>{consultores.map((c) => <option key={c}>{c}</option>)}</Select></Field></div>
        <div className="w-44"><Field label="Tipo"><Select value={fTipo} onChange={(e) => setFTipo(e.target.value)}><option value="all">Todos</option>{TIPOS_OP.map((t) => <option key={t}>{t}</option>)}</Select></Field></div>
        <div className="w-40"><Field label="Origem"><Select value={fOrigem} onChange={(e) => setFOrigem(e.target.value)}><option value="all">Todas</option>{ORIGENS.map((o) => <option key={o}>{o}</option>)}</Select></Field></div>
        <div className="w-36"><Field label="Temperatura"><Select value={fTemp} onChange={(e) => setFTemp(e.target.value)}><option value="all">Todas</option>{TEMPS.map((t) => <option key={t}>{t}</option>)}</Select></Field></div>
        {temFiltro && (
          <Btn variant="ghost" sm onClick={() => { setFConsultor('all'); setFOrigem('all'); setFTipo('all'); setFTemp('all'); setQ('') }}>Limpar</Btn>
        )}
      </Card>

      {/* Board */}
      <div className="flex gap-3 overflow-x-auto pb-3">
        {ETAPAS.map((et) => (
          <Coluna
            key={et.key}
            etapa={et.key}
            cor={et.cor}
            leads={porEtapa(et.key)}
            dragging={!!dragId}
            onOpen={setSel}
            onDrop={() => onDropLead(et.key)}
            onDragStart={setDragId}
            onDragEnd={() => setDragId(null)}
          />
        ))}
      </div>

      {selLead && (
        <PainelLead
          lead={selLead}
          usuario={user?.nome || user?.email || 'Usuário'}
          onClose={() => setSel(null)}
          onMover={moverEtapa}
          update={update}
        />
      )}
      {novo && (
        <NovoLead
          consultorPadrao={user?.nome || ''}
          onClose={() => setNovo(false)}
          onSave={(l) => {
            update((d) => d.leads.unshift(l))
            notify({ title: 'Lead cadastrado', desc: l.nome })
            setNovo(false)
          }}
        />
      )}
    </div>
  )
}

/* ================================================================== *
 *  Coluna do funil (área de soltar — drag nativo)
 * ================================================================== */

function Coluna({
  etapa, cor, leads, dragging, onOpen, onDrop, onDragStart, onDragEnd,
}: {
  etapa: EtapaCRM
  cor: string
  leads: Lead[]
  dragging: boolean
  onOpen: (id: string) => void
  onDrop: () => void
  onDragStart: (id: string) => void
  onDragEnd: () => void
}) {
  const [over, setOver] = useState(false)
  const total = leads.reduce((a, l) => a + l.valorPotencial, 0)
  return (
    <div
      onDragOver={(e) => { if (dragging) { e.preventDefault(); setOver(true) } }}
      onDragLeave={() => setOver(false)}
      onDrop={() => { setOver(false); onDrop() }}
      className={`flex w-72 shrink-0 flex-col rounded-2xl border transition-colors ${
        over ? 'border-brand bg-brand/5' : 'border-line bg-paper/60'
      }`}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: cor }} />
          <span className="text-sm font-semibold text-ink">{etapa}</span>
          <span className="rounded-full bg-surface px-1.5 text-xs font-medium text-muted tnum">{leads.length}</span>
        </div>
        <span className="text-[11px] text-muted tnum">{brlc(total)}</span>
      </div>
      <div className="flex max-h-[calc(100vh-330px)] flex-col gap-2 overflow-y-auto px-2 pb-2">
        {leads.map((l) => (
          <CardLead key={l.id} lead={l} onOpen={onOpen} onDragStart={onDragStart} onDragEnd={onDragEnd} />
        ))}
        {leads.length === 0 && (
          <div className="rounded-xl border border-dashed border-line py-8 text-center text-xs text-muted/70">
            Solte um card aqui
          </div>
        )}
      </div>
    </div>
  )
}

function CardLead({
  lead, onOpen, onDragStart, onDragEnd,
}: {
  lead: Lead
  onOpen: (id: string) => void
  onDragStart: (id: string) => void
  onDragEnd: () => void
}) {
  const frio = lead.diasSemContato > 5 && lead.etapa !== 'Fechado ganho' && lead.etapa !== 'Fechado perdido'
  const atrasado = ehAtrasado(lead)
  return (
    <div
      draggable
      onClick={() => onOpen(lead.id)}
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', lead.id); e.dataTransfer.effectAllowed = 'move'; onDragStart(lead.id) }}
      onDragEnd={onDragEnd}
      className="group cursor-pointer rounded-xl border border-line bg-surface p-3 shadow-card transition-shadow hover:border-brand/50 active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-1">
        <p className="min-w-0 truncate text-sm font-semibold text-ink group-hover:underline">{lead.empresa}</p>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full" style={{ background: tempCor[lead.temperatura] }} title={lead.temperatura} />
          <span className="text-muted/40" title="Arraste para mover de etapa"><Ico n="grip" s={14} /></span>
        </span>
      </div>
      <p className="mt-0.5 truncate text-xs text-muted">{lead.nome}</p>
      <p className="mt-1.5 truncate text-xs text-ink">{lead.produtoInteresse || '—'}</p>
      <div className="mt-2 flex items-center justify-between">
        <Badge>{lead.tipo}</Badge>
        <span className="text-sm font-semibold text-ink tnum">{brlc(lead.valorPotencial)}</span>
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
        <span className="flex items-center gap-1 text-[11px] text-muted">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink text-[8px] font-bold text-white">{iniciais(lead.consultor)}</span>
          {lead.origem}
        </span>
        {atrasado ? (
          <Badge color="#C0392B"><Ico n="alert" s={11} /> Atrasado</Badge>
        ) : frio ? (
          <Badge color="#C0392B"><Ico n="clock" s={11} /> {lead.diasSemContato}d</Badge>
        ) : (
          <span className="text-[11px] text-muted tnum">{lead.probabilidade}%</span>
        )}
      </div>
    </div>
  )
}

/* ================================================================== *
 *  Painel do lead (Sheet lateral) — abas Dados / Propostas / Histórico
 * ================================================================== */

function PainelLead({
  lead, usuario, onClose, onMover, update,
}: {
  lead: Lead
  usuario: string
  onClose: () => void
  onMover: (id: string, e: EtapaCRM) => void
  update: (fn: (d: ComercialDB) => void) => void
}) {
  const { notify } = useToast()
  const navigate = useNavigate()
  const [aba, setAba] = useState('dados')
  const [nota, setNota] = useState('')
  const [atividadeOpen, setAtividadeOpen] = useState(false)
  const [interacaoOpen, setInteracaoOpen] = useState(false)
  const [perdaOpen, setPerdaOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const zapDigitos = (lead.telefone || '').replace(/\D/g, '')
  const zapUrl = zapDigitos ? `https://wa.me/55${zapDigitos}` : null
  const mailUrl = lead.email ? `mailto:${lead.email}` : null
  const atrasado = ehAtrasado(lead)

  const mut = (fn: (l: Lead) => void) =>
    update((d) => { const l = d.leads.find((x) => x.id === lead.id); if (!l) return; fn(l); l.atualizadoEm = agora() })
  const log = (l: Lead, tipo: string, texto: string) => l.atividades.unshift({ data: agora(), tipo, texto })

  const setTemp = (t: Temperatura) => {
    if (t === lead.temperatura) return
    mut((l) => { log(l, 'Temperatura', `Temperatura: ${l.temperatura} → ${t}`); l.temperatura = t })
    notify({ title: `Temperatura: ${t}` })
  }
  const commitNum = (campo: 'valorPotencial' | 'probabilidade', valor: number, rotulo: string, fmt: (n: number) => string) => {
    if (Number.isNaN(valor) || valor === lead[campo]) return
    mut((l) => { log(l, 'Alteração', `${rotulo}: ${fmt(l[campo])} → ${fmt(valor)}`); l[campo] = valor })
  }
  const setConsultor = (c: string) => {
    if (c === lead.consultor) return
    mut((l) => { log(l, 'Consultor', `Consultor: ${l.consultor} → ${c}`); l.consultor = c })
  }
  const addNota = () => {
    if (!nota.trim()) return
    mut((l) => { log(l, 'Nota', nota.trim()); l.diasSemContato = 0 })
    setNota('')
    notify({ title: 'Movimentação registrada' })
  }
  const salvarInteracao = (canal: string, desc: string) => {
    mut((l) => { log(l, 'Interação', `${canal}${desc ? `: ${desc}` : ''}`); l.diasSemContato = 0 })
    notify({ title: 'Interação registrada', desc: canal })
    setInteracaoOpen(false)
  }
  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    mut((l) => {
      l.propostas.unshift({ id: uid(), nome: f.name, data: agora(), status: 'Enviada' })
      log(l, 'Proposta', `Proposta anexada: ${f.name}`)
    })
    notify({ title: 'Proposta anexada', desc: f.name })
    e.target.value = ''
  }
  const setPropStatus = (pid: string, status: StatusProposta) =>
    mut((l) => {
      const p = l.propostas.find((x) => x.id === pid)
      if (p) { log(l, 'Proposta', `Proposta "${p.nome}": ${p.status} → ${status}`); p.status = status }
    })
  const removerProp = (pid: string) =>
    mut((l) => {
      const p = l.propostas.find((x) => x.id === pid)
      l.propostas = l.propostas.filter((x) => x.id !== pid)
      if (p) log(l, 'Proposta', `Proposta removida: ${p.nome}`)
    })

  const salvarAtividade = (c: Compromisso) => {
    update((d) => {
      d.compromissos.push(c)
      const l = d.leads.find((x) => x.id === lead.id)
      if (!l) return
      log(l, 'Atividade', `Atividade agendada: ${c.titulo} (${dmy(c.data)}).`)
      l.proximaAtividade = c.data
      l.diasSemContato = 0
      l.atualizadoEm = agora()
    })
    notify({ title: 'Atividade agendada' })
    setAtividadeOpen(false)
  }

  const converterPedido = () => {
    mut((l) => log(l, 'Conversão', 'Convertido em Pedido — criar a OP no módulo Operações.'))
    notify({ title: 'Vamos criar a OP', desc: 'Abrindo o Fluxo de Produção…' })
    navigate('/operacoes/fluxo-producao')
  }

  const marcarPerdido = (motivo: string, obs: string) => {
    mut((l) => {
      log(l, 'Perda', `Marcado como perdido — motivo: ${motivo}${obs ? ` (${obs})` : ''}`)
      l.etapa = 'Fechado perdido'
      l.probabilidade = 0
      l.motivoPerda = motivo
    })
    notify({ kind: 'info', title: 'Lead marcado como perdido', desc: motivo })
    setPerdaOpen(false)
  }

  const ganho = lead.etapa === 'Fechado ganho'
  const perdido = lead.etapa === 'Fechado perdido'

  return (
    <Sheet
      title={lead.empresa}
      subtitle={`${lead.nome} · ${lead.tipo}`}
      width={480}
      onClose={onClose}
      footer={
        <div className="flex flex-wrap gap-2">
          {!ganho && !perdido && (
            <>
              <Btn variant="accent" sm onClick={() => { onMover(lead.id, 'Fechado ganho'); notify({ title: 'Negócio ganho! 🎉' }) }}>
                <Ico n="check" s={14} /> Ganho
              </Btn>
              <Btn variant="danger" sm onClick={() => setPerdaOpen(true)}>
                <Ico n="x" s={14} /> Perdido
              </Btn>
            </>
          )}
          {ganho && (
            <Btn variant="primary" sm onClick={converterPedido}>
              <Ico n="arrow" s={14} /> Converter em Pedido (OP)
            </Btn>
          )}
        </div>
      }
    >
      {/* selos de status */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge color={corEtapa(lead.etapa)}>{lead.etapa}</Badge>
        <Badge color={tempCor[lead.temperatura]}><Ico n="flame" s={11} /> {lead.temperatura}</Badge>
        <Badge><Ico n="target" s={11} /> {lead.probabilidade}%</Badge>
        {atrasado && <Badge color="#C0392B"><Ico n="alert" s={11} /> Follow-up atrasado</Badge>}
        {lead.diasSemContato > 5 && !ganho && !perdido && !atrasado && (
          <Badge color="#C0392B"><Ico n="clock" s={11} /> {lead.diasSemContato} dias sem contato</Badge>
        )}
      </div>

      {/* ações rápidas de contato */}
      <div className="mb-4 flex gap-2">
        <a href={zapUrl ?? undefined} target="_blank" rel="noreferrer"
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${
            zapUrl ? 'bg-pos/10 text-pos hover:bg-pos/20' : 'pointer-events-none bg-paper text-muted/60'
          }`}>
          <Ico n="msg-circle" s={15} /> WhatsApp
        </a>
        <a href={mailUrl ?? undefined}
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition ${
            mailUrl ? 'border-line text-ink hover:bg-paper' : 'pointer-events-none border-line text-muted/60'
          }`}>
          <Ico n="mail" s={15} /> E-mail
        </a>
        {zapDigitos && (
          <a href={`tel:${zapDigitos}`} title="Ligar" className="flex items-center justify-center rounded-xl border border-line px-3 py-2 text-ink hover:bg-paper">
            <Ico n="phone" s={15} />
          </a>
        )}
      </div>

      <Tabs value={aba} onChange={setAba} tabs={[
        { value: 'dados', label: 'Dados' },
        { value: 'propostas', label: `Propostas (${lead.propostas.length})` },
        { value: 'historico', label: 'Histórico' },
      ]} />

      {/* ---------------- DADOS ---------------- */}
      {aba === 'dados' && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted/80">Editar</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <span className="mb-1 block text-xs font-medium text-muted">Temperatura</span>
              <div className="flex gap-1.5">
                {TEMPS.map((t) => (
                  <button key={t} onClick={() => setTemp(t)}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition ${
                      lead.temperatura === t ? 'border-transparent text-white' : 'border-line text-muted hover:bg-paper'
                    }`}
                    style={lead.temperatura === t ? { background: tempCor[t] } : undefined}>{t}</button>
                ))}
              </div>
            </div>
            <Field label="Etapa"><Select value={lead.etapa} onChange={(e) => onMover(lead.id, e.target.value as EtapaCRM)}>{ETAPAS.map((e) => <option key={e.key}>{e.key}</option>)}</Select></Field>
            <Field label="Consultor"><Input key={`c${lead.id}`} defaultValue={lead.consultor} onBlur={(e) => setConsultor(e.target.value.trim())} /></Field>
            <Field label="Valor potencial (R$)"><Input key={`v${lead.id}`} type="number" defaultValue={lead.valorPotencial} onBlur={(e) => commitNum('valorPotencial', Number(e.target.value), 'Valor potencial', (n) => brl(n))} /></Field>
            <Field label="Probabilidade (%)"><Input key={`p${lead.id}`} type="number" defaultValue={lead.probabilidade} onBlur={(e) => commitNum('probabilidade', Number(e.target.value), 'Probabilidade', (n) => `${n}%`)} /></Field>
          </div>

          {lead.proximaAtividade && (
            <div className={`mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
              atrasado ? 'bg-neg/8 font-medium text-neg' : 'bg-paper text-muted'
            }`}>
              <Ico n={atrasado ? 'alert' : 'calendar-plus'} s={13} /> Próxima atividade: {dmy(lead.proximaAtividade)}{atrasado ? ' · atrasada' : ''}
            </div>
          )}

          <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-muted/80">Contato</p>
          <div className="grid grid-cols-2 gap-3">
            <Info icon={<Ico n="phone" s={14} />} label="Telefone" value={lead.telefone || '—'} />
            <Info icon={<Ico n="mail" s={14} />} label="E-mail" value={lead.email || '—'} />
            <Info icon={<Ico n="map-pin" s={14} />} label="Empresa" value={lead.empresa} />
            <Info icon={<Ico n="tag" s={14} />} label="Origem" value={lead.origem} />
          </div>
          {perdido && lead.motivoPerda && <p className="mt-3 rounded-lg bg-neg/5 px-3 py-2 text-xs text-neg">Motivo da perda: <b>{lead.motivoPerda}</b></p>}

          {!ganho && !perdido && (
            <div className="mt-5 flex flex-col gap-2">
              <Btn variant="accent" sm onClick={() => setAtividadeOpen(true)}><Ico n="calendar-plus" s={14} /> Agendar nova atividade</Btn>
              <Btn variant="secondary" sm onClick={() => setInteracaoOpen(true)}><Ico n="msg-plus" s={14} /> Registrar interação</Btn>
            </div>
          )}
        </div>
      )}

      {/* ---------------- PROPOSTAS ---------------- */}
      {aba === 'propostas' && (
        <div className="mt-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted/80">Propostas anexadas</p>
            <Btn variant="secondary" sm onClick={() => fileRef.current?.click()}><Ico n="paperclip" s={14} /> Anexar</Btn>
            <input ref={fileRef} type="file" hidden onChange={onFile} accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg" />
          </div>
          {lead.propostas.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line px-3 py-8 text-center text-xs text-muted/70">
              Nenhuma proposta anexada. Clique em <b>Anexar</b> para adicionar um arquivo (PDF, Word, Excel…).
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {lead.propostas.map((p) => (
                <div key={p.id} className="rounded-xl border border-line bg-surface p-3">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-copper/10 text-copper"><Ico n="file" s={16} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink" title={p.nome}>{p.nome}</p>
                      <p className="text-[11px] text-muted/70">{dmy(p.data)}{p.valor ? ` · ${brl(p.valor)}` : ''}</p>
                    </div>
                    <button onClick={() => notify({ kind: 'info', title: 'Pré-visualização simulada', desc: p.nome })} className="rounded-lg p-1.5 text-muted hover:bg-paper" title="Abrir"><Ico n="external" s={15} /></button>
                    <button onClick={() => removerProp(p.id)} className="rounded-lg p-1.5 text-muted hover:bg-neg/10 hover:text-neg" title="Remover"><Ico n="trash" s={15} /></button>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge color={propCor[p.status]}>{p.status}</Badge>
                    <Select value={p.status} onChange={(e) => setPropStatus(p.id, e.target.value as StatusProposta)} className="ml-auto h-8 w-36 py-1 text-xs">
                      {(['Enviada', 'Em análise', 'Aceita', 'Recusada'] as StatusProposta[]).map((s) => <option key={s}>{s}</option>)}
                    </Select>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---------------- HISTÓRICO ---------------- */}
      {aba === 'historico' && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted/80">Registrar movimentação</p>
          <div className="flex gap-2">
            <Input value={nota} onChange={(e) => setNota(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addNota()} placeholder="Ex.: Liguei, cliente pediu retorno na quinta…" />
            <Btn variant="accent" sm disabled={!nota.trim()} onClick={addNota}>Registrar</Btn>
          </div>
          <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-muted/80">Linha do tempo ({lead.atividades.length})</p>
          <div className="flex flex-col gap-2.5 border-l border-line pl-4">
            {lead.atividades.map((a, i) => (
              <div key={i} className="relative">
                <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full ring-2 ring-surface" style={{ background: 'rgb(var(--brand))' }} />
                <div className="flex items-center gap-2">
                  <span className="rounded bg-paper px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">{a.tipo}</span>
                  <span className="text-[10px] text-muted/70">{dmy(a.data)}</span>
                </div>
                <p className="mt-0.5 text-xs text-ink">{a.texto}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {atividadeOpen && <NovaAtividade cliente={lead.empresa} responsavelPadrao={lead.consultor || usuario} onClose={() => setAtividadeOpen(false)} onSave={salvarAtividade} />}
      {interacaoOpen && <RegistrarInteracao onClose={() => setInteracaoOpen(false)} onSave={salvarInteracao} />}
      {perdaOpen && <MotivoPerda onClose={() => setPerdaOpen(false)} onSave={marcarPerdido} />}
    </Sheet>
  )
}

/* ================================================================== *
 *  Modais auxiliares
 * ================================================================== */

function MotivoPerda({ onClose, onSave }: { onClose: () => void; onSave: (motivo: string, obs: string) => void }) {
  const [motivo, setMotivo] = useState(MOTIVOS_PERDA[0])
  const [obs, setObs] = useState('')
  return (
    <Modal title="Marcar como perdido" subtitle="Por que este lead foi perdido?" width={440} onClose={onClose}
      footer={<><Btn variant="ghost" onClick={onClose}>Cancelar</Btn><Btn variant="danger" onClick={() => onSave(motivo, obs)}>Confirmar perda</Btn></>}>
      <div className="grid gap-3">
        <Field label="Motivo da perda"><Select value={motivo} onChange={(e) => setMotivo(e.target.value)}>{MOTIVOS_PERDA.map((m) => <option key={m}>{m}</option>)}</Select></Field>
        <Field label="Observação (opcional)"><Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} placeholder="Detalhe o que aconteceu…" /></Field>
      </div>
    </Modal>
  )
}

function RegistrarInteracao({ onClose, onSave }: { onClose: () => void; onSave: (canal: string, desc: string) => void }) {
  const [canal, setCanal] = useState(CANAIS[0])
  const [desc, setDesc] = useState('')
  return (
    <Modal title="Registrar interação" subtitle="Registre um contato que já aconteceu" width={440} onClose={onClose}
      footer={<><Btn variant="ghost" onClick={onClose}>Cancelar</Btn><Btn variant="accent" onClick={() => onSave(canal, desc)}>Registrar</Btn></>}>
      <div className="grid gap-3">
        <Field label="Canal"><Select value={canal} onChange={(e) => setCanal(e.target.value)}>{CANAIS.map((c) => <option key={c}>{c}</option>)}</Select></Field>
        <Field label="O que aconteceu?"><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} placeholder="Ex.: Liguei, cliente pediu para retornar na quinta com a proposta ajustada." /></Field>
      </div>
    </Modal>
  )
}

function NovaAtividade({
  cliente, responsavelPadrao, onClose, onSave,
}: {
  cliente: string
  responsavelPadrao: string
  onClose: () => void
  onSave: (c: Compromisso) => void
}) {
  const hoje = new Date().toISOString().slice(0, 10)
  const [titulo, setTitulo] = useState('Follow-up')
  const [tipo, setTipo] = useState(TIPOS_ATIVIDADE[0])
  const [responsavel, setResponsavel] = useState(responsavelPadrao)
  const [data, setData] = useState(hoje)
  const [hora, setHora] = useState('09:00')
  const salvar = () => {
    onSave({
      id: uid(),
      titulo: titulo.trim() || tipo,
      tipo,
      data: new Date(`${data}T${hora || '09:00'}`).toISOString(),
      responsavel: responsavel.trim(),
      concluido: false,
      cliente,
    })
  }
  return (
    <Modal title="Agendar nova atividade" subtitle={`Cliente: ${cliente}`} width={460} onClose={onClose}
      footer={<><Btn variant="ghost" onClick={onClose}>Cancelar</Btn><Btn variant="accent" disabled={!data} onClick={salvar}>Agendar</Btn></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Título" className="col-span-2"><Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Ligar para retomar a proposta" /></Field>
        <Field label="Tipo"><Select value={tipo} onChange={(e) => setTipo(e.target.value)}>{TIPOS_ATIVIDADE.map((t) => <option key={t}>{t}</option>)}</Select></Field>
        <Field label="Responsável"><Input value={responsavel} onChange={(e) => setResponsavel(e.target.value)} placeholder="Quem faz" /></Field>
        <Field label="Data"><Input type="date" value={data} min="2000-01-01" max="2100-12-31" onChange={(e) => setData(e.target.value)} /></Field>
        <Field label="Hora"><Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} /></Field>
      </div>
    </Modal>
  )
}

function NovoLead({
  consultorPadrao, onClose, onSave,
}: {
  consultorPadrao: string
  onClose: () => void
  onSave: (l: Lead) => void
}) {
  const [nome, setNome] = useState('')
  const [empresa, setEmpresa] = useState('')
  const [tipo, setTipo] = useState('')
  const [produto, setProduto] = useState('')
  const [origem, setOrigem] = useState('')
  const [consultor, setConsultor] = useState(consultorPadrao)
  const [valor, setValor] = useState('')
  const [temp, setTemp] = useState('')
  const [telefone, setTelefone] = useState('')
  const [email, setEmail] = useState('')

  const salvar = () =>
    onSave({
      id: uid(),
      nome: nome.trim(),
      empresa: empresa.trim() || nome.trim(),
      tipo: (tipo || 'Uniforme profissional') as TipoOportunidade,
      produtoInteresse: produto.trim(),
      origem: (origem || 'Indicação') as OrigemComercial,
      consultor: consultor.trim() || 'Comercial MM',
      valorPotencial: Number(valor) || 0,
      etapa: 'Novo lead',
      probabilidade: 10,
      temperatura: (temp || 'Morno') as Temperatura,
      diasSemContato: 0,
      criadoEm: agora(),
      atualizadoEm: agora(),
      telefone: telefone.trim(),
      email: email.trim(),
      atividades: [{ data: agora(), tipo: 'Criação', texto: 'Lead cadastrado manualmente.' }],
      propostas: [],
    })

  return (
    <Modal title="Novo lead" subtitle="Cadastro rápido de oportunidade" width={560} onClose={onClose}
      footer={<><Btn variant="ghost" onClick={onClose}>Cancelar</Btn><Btn variant="accent" disabled={!empresa.trim() && !nome.trim()} onClick={salvar}>Cadastrar lead</Btn></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Empresa*" className="col-span-2"><Input value={empresa} onChange={(e) => setEmpresa(e.target.value)} placeholder="Nome da empresa/cliente" /></Field>
        <Field label="Contato"><Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome da pessoa" /></Field>
        <Field label="Tipo"><Select value={tipo} onChange={(e) => setTipo(e.target.value)}><option value="">Selecione…</option>{TIPOS_OP.map((t) => <option key={t}>{t}</option>)}</Select></Field>
        <Field label="Produto de interesse" className="col-span-2"><Input value={produto} onChange={(e) => setProduto(e.target.value)} placeholder="Ex.: Camisas polo + agasalho (80 peças)" /></Field>
        <Field label="Origem"><Select value={origem} onChange={(e) => setOrigem(e.target.value)}><option value="">Selecione…</option>{ORIGENS.map((o) => <option key={o}>{o}</option>)}</Select></Field>
        <Field label="Consultor"><Input value={consultor} onChange={(e) => setConsultor(e.target.value)} placeholder="Vendedor responsável" /></Field>
        <Field label="Valor potencial (R$)"><Input type="number" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0" /></Field>
        <Field label="Temperatura"><Select value={temp} onChange={(e) => setTemp(e.target.value)}><option value="">Selecione…</option>{TEMPS.map((t) => <option key={t}>{t}</option>)}</Select></Field>
        <Field label="Telefone"><Input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(11) 9…" /></Field>
        <Field label="E-mail"><Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@cliente.com" /></Field>
      </div>
    </Modal>
  )
}

function Info({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-paper/50 px-3 py-2">
      <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted/80">{icon} {label}</p>
      <p className="mt-0.5 truncate text-sm text-ink" title={value}>{value}</p>
    </div>
  )
}
