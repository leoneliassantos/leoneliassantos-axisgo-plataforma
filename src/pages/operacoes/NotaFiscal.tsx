import { useState } from 'react'
import { Modal, BtnPrimary, BtnGhost } from './Modal'
import { fmtBRL, fmtBRfull, ANO_MIN, ANO_MAX } from './helpers'
import type { Nf } from './data'

interface NfDraft {
  numero: string
  dataEmissao: string
  valor: string
  fretePorMM: boolean
  freteEmpresa: string
  freteValor: string
}

const NF_DRAFT_VAZIO: NfDraft = { numero: '', dataEmissao: '', valor: '', fretePorMM: false, freteEmpresa: '', freteValor: '' }

const nfToDraft = (nf: Nf): NfDraft => ({
  numero: nf.numero,
  dataEmissao: nf.dataEmissao,
  valor: nf.valor ? String(nf.valor) : '',
  fretePorMM: nf.fretePorMM,
  freteEmpresa: nf.freteEmpresa,
  freteValor: nf.freteValor ? String(nf.freteValor) : '',
})

const draftToNf = (d: NfDraft): Omit<Nf, 'id'> => ({
  numero: d.numero.trim(),
  dataEmissao: d.dataEmissao,
  valor: Number(d.valor) || 0,
  fretePorMM: d.fretePorMM,
  freteEmpresa: d.fretePorMM ? d.freteEmpresa.trim() : '',
  freteValor: d.fretePorMM ? (Number(d.freteValor) || 0) : 0,
})

const draftPreenchido = (d: NfDraft): boolean => !!(d.numero.trim() || d.dataEmissao || d.valor || d.freteEmpresa.trim() || d.freteValor)

/** Id local (só p/ React key das linhas novas ainda não salvas — nunca persistido). */
const tempId = () => (crypto?.randomUUID ? crypto.randomUUID() : `tmp-${Date.now()}-${Math.round(Math.random() * 1e6)}`)

const lab = 'block text-[12px] font-medium text-muted mb-1'
const inp = 'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-ink/40 focus:outline-none'

/** Campos de uma Nota Fiscal (compartilhado entre linha existente e linha nova). */
function NfCampos({ d, upd }: { d: NfDraft; upd: (patch: Partial<NfDraft>) => void }) {
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className={lab}>Número da NF</label>
          <input className={inp} value={d.numero} onChange={(e) => upd({ numero: e.target.value })} placeholder="Ex.: 12345" />
        </div>
        <div>
          <label className={lab}>Data de emissão</label>
          <input type="date" className={inp} value={d.dataEmissao} min={`${ANO_MIN}-01-01`} max={`${ANO_MAX}-12-31`} onChange={(e) => upd({ dataEmissao: e.target.value })} />
        </div>
        <div>
          <label className={lab}>Valor</label>
          <input type="number" min={0} step="0.01" inputMode="decimal" className={inp} value={d.valor} onChange={(e) => upd({ valor: e.target.value })} placeholder="0,00" />
        </div>
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={d.fretePorMM} onChange={(e) => upd({ fretePorMM: e.target.checked })} className="accent-ink" />
        Frete por conta da MM
      </label>

      {d.fretePorMM && (
        <div className="mt-2 grid grid-cols-1 gap-3 rounded-lg bg-paper p-3 sm:grid-cols-2">
          <div>
            <label className={lab}>Empresa do frete</label>
            <input className={inp} value={d.freteEmpresa} onChange={(e) => upd({ freteEmpresa: e.target.value })} placeholder="Nome da transportadora" />
          </div>
          <div>
            <label className={lab}>Valor do frete</label>
            <input type="number" min={0} step="0.01" inputMode="decimal" className={inp} value={d.freteValor} onChange={(e) => upd({ freteValor: e.target.value })} placeholder="0,00" />
          </div>
        </div>
      )}
    </>
  )
}

/** Uma NF já lançada: edita e persiste sozinha, ou exclui. */
function NfLinhaExistente({
  nf, indice, saving, onUpdate, onDelete,
}: {
  nf: Nf; indice: number; saving: boolean
  onUpdate: (nf: Omit<Nf, 'id'>) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [d, setD] = useState<NfDraft>(() => nfToDraft(nf))
  const upd = (patch: Partial<NfDraft>) => setD((prev) => ({ ...prev, ...patch }))
  const mudou = JSON.stringify(draftToNf(d)) !== JSON.stringify(draftToNf(nfToDraft(nf)))

  return (
    <div className="rounded-xl border border-line bg-paper p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-ink">Nota Fiscal {indice}</span>
        <button type="button" onClick={() => onDelete().catch(() => {})} disabled={saving} className="text-sm font-medium text-neg hover:brightness-125 disabled:opacity-50">Excluir</button>
      </div>
      <NfCampos d={d} upd={upd} />
      {mudou && (
        <div className="mt-3 flex justify-end">
          <BtnPrimary onClick={() => onUpdate(draftToNf(d)).catch(() => {})} disabled={saving}>{saving ? 'Salvando…' : 'Salvar alterações'}</BtnPrimary>
        </div>
      )}
    </div>
  )
}

/** Linha em branco p/ lançar uma NF nova (entrega parcial = várias NFs por pedido). */
function NfLinhaNova({
  indice, saving, onAdd, onCancelar,
}: {
  indice: number; saving: boolean
  onAdd: (nf: Omit<Nf, 'id'>) => Promise<void>
  onCancelar: () => void
}) {
  const [d, setD] = useState<NfDraft>(NF_DRAFT_VAZIO)
  const upd = (patch: Partial<NfDraft>) => setD((prev) => ({ ...prev, ...patch }))

  return (
    <div className="rounded-xl border border-dashed border-line bg-paper p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-ink">Nota Fiscal {indice} (nova)</span>
        <button type="button" onClick={onCancelar} disabled={saving} className="text-sm font-medium text-muted hover:text-ink disabled:opacity-50">Remover</button>
      </div>
      <NfCampos d={d} upd={upd} />
      <div className="mt-3 flex justify-end">
        <BtnPrimary onClick={() => onAdd(draftToNf(d))} disabled={saving || !draftPreenchido(d)}>{saving ? 'Salvando…' : 'Salvar'}</BtnPrimary>
      </div>
    </div>
  )
}

/** Modal com as Notas Fiscais do pedido — várias, para cobrir entrega parcial. */
export function NfModal({
  nfs, saving, onAdd, onUpdate, onDelete, onClose,
}: {
  nfs: Nf[]; saving: boolean
  onAdd: (nf: Omit<Nf, 'id'>) => Promise<void>
  onUpdate: (nfId: string, nf: Omit<Nf, 'id'>) => Promise<void>
  onDelete: (nfId: string) => Promise<void>
  onClose: () => void
}) {
  const [novas, setNovas] = useState<string[]>(nfs.length === 0 ? [tempId()] : [])

  return (
    <Modal
      title="Dados da Nota Fiscal"
      subtitle="Informações das NFs deste pedido (visível só para Admin e Diretoria). Entrega parcial: lance uma NF por remessa."
      width={620}
      onClose={onClose}
      footer={<BtnGhost onClick={onClose}>Fechar</BtnGhost>}
    >
      <div className="flex flex-col gap-3">
        {nfs.map((nf, i) => (
          <NfLinhaExistente
            key={nf.id}
            nf={nf}
            indice={i + 1}
            saving={saving}
            onUpdate={(patch) => onUpdate(nf.id, patch)}
            onDelete={() => onDelete(nf.id)}
          />
        ))}
        {novas.map((id) => (
          <NfLinhaNova
            key={id}
            indice={nfs.length + novas.indexOf(id) + 1}
            saving={saving}
            onAdd={(nf) => onAdd(nf).then(() => setNovas((prev) => prev.filter((x) => x !== id)))}
            onCancelar={() => setNovas((prev) => prev.filter((x) => x !== id))}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => setNovas((prev) => [...prev, tempId()])}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-line px-3 py-2 text-sm font-medium text-ink transition hover:bg-paper"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"><path d="M12 5v14M5 12h14" strokeWidth="2" strokeLinecap="round" /></svg>
        Acrescentar Nota Fiscal
      </button>
    </Modal>
  )
}

/** Resumo somente-leitura das NFs, usado na aba Financeiro do card do item. */
export function NfResumo({ nfs }: { nfs: Nf[] }) {
  if (nfs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-paper p-8 text-center text-sm text-muted">
        Nota fiscal ainda não informada.<br />
        Use o botão <b>“Dados da Nota Fiscal”</b> no topo do pedido para preencher.
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      {nfs.map((nf, i) => (
        <div key={nf.id} className="flex flex-col gap-2">
          {nfs.length > 1 && <div className="text-[12px] font-semibold uppercase tracking-wide text-muted">Nota Fiscal {i + 1}</div>}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Campo label="Número da NF" valor={nf.numero || '—'} />
            <Campo label="Data de emissão" valor={fmtBRfull(nf.dataEmissao) || '—'} />
            <Campo label="Valor" valor={fmtBRL(nf.valor)} destaque />
          </div>
          <div className="rounded-xl border border-line bg-paper p-3">
            <div className="text-[12px] font-semibold uppercase tracking-wide text-muted">Frete</div>
            {nf.fretePorMM ? (
              <div className="mt-1.5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Campo label="Por conta" valor="MM" />
                <Campo label="Empresa" valor={nf.freteEmpresa || '—'} />
                <Campo label="Valor do frete" valor={fmtBRL(nf.freteValor)} />
              </div>
            ) : (
              <div className="mt-1 text-sm text-ink">Frete <b>não</b> é por conta da MM.</div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function Campo({ label, valor, destaque }: { label: string; valor: string; destaque?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold tabular-nums ${destaque ? 'text-brand' : 'text-ink'}`}>{valor}</div>
    </div>
  )
}
