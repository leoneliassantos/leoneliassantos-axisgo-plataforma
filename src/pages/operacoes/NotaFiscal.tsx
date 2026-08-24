import { useState } from 'react'
import { Modal, BtnPrimary, BtnGhost } from './Modal'
import { fmtBRL, fmtBRfull, ANO_MIN, ANO_MAX } from './helpers'
import { temNf, type Nf } from './data'

interface NfDraft {
  numero: string
  dataEmissao: string
  valor: string
  fretePorMM: boolean
  freteEmpresa: string
  freteValor: string
}

const nfToDraft = (nf: Nf): NfDraft => ({
  numero: nf.numero,
  dataEmissao: nf.dataEmissao,
  valor: nf.valor ? String(nf.valor) : '',
  fretePorMM: nf.fretePorMM,
  freteEmpresa: nf.freteEmpresa,
  freteValor: nf.freteValor ? String(nf.freteValor) : '',
})

const draftToNf = (d: NfDraft): Nf => ({
  numero: d.numero.trim(),
  dataEmissao: d.dataEmissao,
  valor: Number(d.valor) || 0,
  fretePorMM: d.fretePorMM,
  freteEmpresa: d.fretePorMM ? d.freteEmpresa.trim() : '',
  freteValor: d.fretePorMM ? (Number(d.freteValor) || 0) : 0,
})

const lab = 'block text-[12px] font-medium text-muted mb-1'
const inp = 'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-ink/40 focus:outline-none'

/** Modal para preencher/editar os Dados da Nota Fiscal do pedido. */
export function NfModal({ nf, saving, onSave, onClose }: { nf: Nf; saving: boolean; onSave: (nf: Nf) => void; onClose: () => void }) {
  const [d, setD] = useState<NfDraft>(() => nfToDraft(nf))
  const upd = (patch: Partial<NfDraft>) => setD((prev) => ({ ...prev, ...patch }))

  return (
    <Modal
      title="Dados da Nota Fiscal"
      subtitle="Informações da NF deste pedido (visível só para Admin e Diretoria)."
      width={560}
      onClose={onClose}
      footer={
        <>
          <BtnGhost onClick={onClose} disabled={saving}>Cancelar</BtnGhost>
          <BtnPrimary onClick={() => onSave(draftToNf(d))} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</BtnPrimary>
        </>
      }
    >
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

      <label className="mt-4 flex items-center gap-2 text-sm text-ink">
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
    </Modal>
  )
}

/** Resumo somente-leitura da NF, usado na aba Financeiro do card do item. */
export function NfResumo({ nf }: { nf: Nf }) {
  if (!temNf(nf)) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-paper p-8 text-center text-sm text-muted">
        Nota fiscal ainda não informada.<br />
        Use o botão <b>“Dados da Nota Fiscal”</b> no topo do pedido para preencher.
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-3">
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
