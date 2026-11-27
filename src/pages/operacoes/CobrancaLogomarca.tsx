import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { podeVerValorFornecedor } from '../../auth/types'
import { FiltrosToggle } from '../../components/FiltrosToggle'
import { fmtBRL, fmtBRfull, fmtMesAno, hojeISO, ANO_MIN, ANO_MAX } from './helpers'
import { loadCadastros, loadPedidos, type Cadastros, type Pedido, type TipoLogo } from './data'

const CADASTROS_VAZIO: Cadastros = { clientes: [], uniformes: [], cores: [], tecidos: [], fornecedores: [] }

interface LinhaCobranca {
  fornecedor: string
  cliente: string
  peca: string
  tipo: TipoLogo
  qtd: number
  valorUnit: number
  valorTotal: number
  mesFechamento: string
  dataEnvio: string
  dataPedido: string
}

/** Mês corrente (YYYY-MM), usado como período padrão do fechamento. */
const mesAtual = () => hojeISO().slice(0, 7)

export function CobrancaLogomarca() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [cadastros, setCadastros] = useState<Cadastros>(CADASTROS_VAZIO)
  const [pedidos, setPedidos] = useState<Pedido[]>([])

  const [mesDe, setMesDe] = useState(mesAtual())
  const [mesAte, setMesAte] = useState(mesAtual())
  const [busca, setBusca] = useState('')
  const [filtrosAbertos, setFiltrosAbertos] = useState(true)

  const carregar = useCallback(async () => {
    setLoading(true); setErro(null)
    try {
      const [cad, peds] = await Promise.all([loadCadastros(), loadPedidos()])
      setCadastros(cad); setPedidos(peds)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao carregar.')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { carregar() }, [carregar])

  // Uma linha de cobrança por aplicação de logomarca (um item pode ter mais de uma: Bordado/Silk/DTF).
  const linhas = useMemo<LinhaCobranca[]>(() => {
    const nomeForn = new Map(cadastros.fornecedores.map((f) => [f.id, f.nome]))
    const out: LinhaCobranca[] = []
    for (const p of pedidos) for (const it of p.produtos) {
      for (const lg of it.logos) {
        if (!lg || (!lg.fornecedorId && !lg.valorUnitario && !lg.mesFechamento)) continue
        out.push({
          fornecedor: (lg.fornecedorId && nomeForn.get(lg.fornecedorId)) || lg.fornecedorNome || '—',
          cliente: p.clienteNome || '—',
          peca: it.uniformeNome || '—',
          tipo: lg.tipo,
          qtd: it.qtd,
          valorUnit: lg.valorUnitario,
          valorTotal: it.qtd * lg.valorUnitario,
          mesFechamento: lg.mesFechamento,
          dataEnvio: lg.dataEnvio,
          dataPedido: p.dataPedido,
        })
      }
    }
    return out
  }, [pedidos, cadastros])

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return linhas
      .filter((l) => {
        // Corte da cobrança = mês de fechamento. Sem mês definido não entra no período.
        if (mesDe && (!l.mesFechamento || l.mesFechamento < mesDe)) return false
        if (mesAte && (!l.mesFechamento || l.mesFechamento > mesAte)) return false
        if (t && ![l.fornecedor, l.cliente, l.peca, l.tipo].join(' ').toLowerCase().includes(t)) return false
        return true
      })
      // Sempre do mais recente para o mais antigo.
      .sort((a, b) =>
        b.mesFechamento.localeCompare(a.mesFechamento) ||
        b.dataEnvio.localeCompare(a.dataEnvio) ||
        b.dataPedido.localeCompare(a.dataPedido),
      )
  }, [linhas, mesDe, mesAte, busca])

  const totais = useMemo(() => {
    const pecas = visiveis.reduce((s, l) => s + l.qtd, 0)
    const valor = visiveis.reduce((s, l) => s + l.valorTotal, 0)
    const fornecedores = new Set(visiveis.map((l) => l.fornecedor)).size
    return { pecas, valor, fornecedores, itens: visiveis.length }
  }, [visiveis])

  async function exportar() {
    const XLSX = await import('xlsx')
    const dados = visiveis.map((l) => ({
      'Fornecedor': l.fornecedor,
      'Cliente': l.cliente,
      'Peça': l.peca,
      'Tipo': l.tipo,
      'Qtde de peças': l.qtd,
      'Valor unitário': l.valorUnit,
      'Valor total': l.valorTotal,
      'Mês de fechamento': fmtMesAno(l.mesFechamento),
      'Data de envio': fmtBRfull(l.dataEnvio),
    }))
    const ws = XLSX.utils.json_to_sheet(dados)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Cobrança Logomarca')
    const periodo = mesDe === mesAte ? fmtMesAno(mesDe) : `${fmtMesAno(mesDe) || '...'} a ${fmtMesAno(mesAte) || '...'}`
    XLSX.writeFile(wb, `Cobranca Logomarca - ${periodo}.xlsx`.replace(/\//g, '-'))
  }

  if (user && !podeVerValorFornecedor(user.role))
    return <div className="mx-auto mt-10 max-w-lg rounded-xl border border-line bg-surface p-6 text-center text-muted">Seu perfil não tem acesso ao relatório de cobrança.</div>
  if (loading) return <div className="py-20 text-center text-muted">Carregando…</div>
  if (erro) return <div className="mx-auto mt-10 max-w-lg rounded-xl border border-neg/30 bg-neg/5 p-5 text-center text-neg">{erro}</div>

  const th = 'sticky top-0 z-10 bg-paper px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted'
  const td = 'px-3 py-2.5 text-sm text-ink'
  const inp = 'rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-ink/40 focus:outline-none'

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted">Operações · Cobrança</div>
          <h1 className="mt-1 font-serif text-2xl font-semibold text-ink">Cobrança de Logomarca</h1>
          {filtrosAbertos && (
            <p className="mt-1 text-sm text-muted">Aplicações de logomarca feitas por fornecedores terceiros, agrupadas pelo <b>mês de fechamento</b> (a data de corte da cobrança).</p>
          )}
        </div>
        {!filtrosAbertos && <FiltrosToggle aberto={filtrosAbertos} onToggle={() => setFiltrosAbertos((v) => !v)} />}
      </div>

      {/* Filtros */}
      {filtrosAbertos && (
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-[12px] font-medium text-muted">Fechamento de</label>
            <input type="month" className={inp} value={mesDe} min={`${ANO_MIN}-01`} max={`${ANO_MAX}-12`} onChange={(e) => setMesDe(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-medium text-muted">até</label>
            <input type="month" className={inp} value={mesAte} min={`${ANO_MIN}-01`} max={`${ANO_MAX}-12`} onChange={(e) => setMesAte(e.target.value)} />
          </div>
          <button type="button" onClick={() => { setMesDe(''); setMesAte('') }} className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-muted transition hover:bg-paper">Todos os meses</button>
          <div className="relative min-w-[200px] flex-1">
            <label className="mb-1 block text-[12px] font-medium text-muted">Buscar</label>
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Fornecedor, cliente, peça ou tipo…" className={`${inp} w-full`} />
          </div>
          <button type="button" onClick={exportar} disabled={visiveis.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-ink px-3 py-2 text-sm font-medium text-surface transition hover:bg-ink/90 disabled:opacity-40">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m0 0 4-4m-4 4-4-4" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>
            Exportar
          </button>
          <FiltrosToggle aberto={filtrosAbertos} onToggle={() => setFiltrosAbertos((v) => !v)} />
        </div>
      )}

      {/* Resumo */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Valor total" valor={fmtBRL(totais.valor)} destaque />
        <Kpi label="Aplicações" valor={String(totais.itens)}
          info="Número de aplicações de logomarca (Bordado, Silk ou DTF). Uma mesma peça pode ter mais de uma aplicação, de fornecedores diferentes — cada uma é listada e cobrada separadamente." />
        <Kpi label="Peças" valor={totais.pecas.toLocaleString('pt-BR')}
          info="Soma a quantidade de peças de cada aplicação. Uma peça com mais de uma aplicação (ex.: Bordado + Silk) é contada uma vez para cada aplicação." />
        <Kpi label="Fornecedores" valor={String(totais.fornecedores)} />
      </div>

      {visiveis.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-surface p-12 text-center text-muted">
          Nenhuma cobrança de logomarca {mesDe || mesAte || busca ? 'com esse filtro' : 'lançada ainda'}.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>Fornecedor</th>
                <th className={th}>Cliente</th>
                <th className={th}>Peça</th>
                <th className={th}>Tipo</th>
                <th className={`${th} text-right`}>Qtde de peças</th>
                <th className={`${th} text-right`}>Valor unitário</th>
                <th className={`${th} text-right`}>Valor total</th>
                <th className={th}>Fechamento</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((l, i) => (
                <tr key={i} className="border-t border-line-2 hover:bg-paper">
                  <td className={`${td} font-medium`}>{l.fornecedor}</td>
                  <td className={td}>{l.cliente}</td>
                  <td className={td}>{l.peca}</td>
                  <td className={td}>{l.tipo}</td>
                  <td className={`${td} tnum text-right`}>{l.qtd.toLocaleString('pt-BR')}</td>
                  <td className={`${td} tnum text-right text-muted`}>{fmtBRL(l.valorUnit)}</td>
                  <td className={`${td} tnum text-right font-semibold`}>{fmtBRL(l.valorTotal)}</td>
                  <td className={`${td} tnum`}>{fmtMesAno(l.mesFechamento) || '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-line bg-paper">
                <td className={`${td} font-semibold`} colSpan={4}>Total ({totais.itens} {totais.itens === 1 ? 'aplicação' : 'aplicações'})</td>
                <td className={`${td} tnum text-right font-semibold`}>{totais.pecas.toLocaleString('pt-BR')}</td>
                <td className={td}></td>
                <td className={`${td} tnum text-right font-semibold`}>{fmtBRL(totais.valor)}</td>
                <td className={td}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

function Kpi({ label, valor, destaque, info }: { label: string; valor: string; destaque?: boolean; info?: string }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${destaque ? 'border-brand/30 bg-brand/5' : 'border-line bg-surface'}`}>
      <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted">
        <span>{label}</span>
        {info && (
          <span title={info} aria-label={info} tabIndex={0}
            className="inline-flex size-3.5 cursor-help items-center justify-center rounded-full border border-muted/40 text-[9px] font-bold leading-none text-muted/80 focus:outline-none focus:ring-1 focus:ring-muted/50">?</span>
        )}
      </div>
      <div className={`mt-0.5 font-serif text-xl font-semibold tabular-nums ${destaque ? 'text-brand' : 'text-ink'}`}>{valor}</div>
    </div>
  )
}
