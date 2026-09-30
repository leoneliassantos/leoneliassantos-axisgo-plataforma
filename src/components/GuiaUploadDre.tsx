import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Botão "Guia" + modal explicando, passo a passo e em linguagem simples,
 * como subir a base do DRE (o Razão Contábil). Responde a dúvida recorrente:
 * subir mês a mês, vários meses ou o ano inteiro? — todas funcionam, o sistema
 * substitui apenas os meses que vierem no arquivo. Chrome neutro, como o Core.
 */
export function GuiaUploadDre({ className = '' }: { className?: string }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Como subir a base do DRE — passo a passo"
        className={`inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-[13px] font-bold text-ink transition hover:bg-paper ${className}`}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z" />
          <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z" />
        </svg>
        Guia
      </button>

      {open && createPortal(
        <div
          className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/40 p-4 py-10"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-[640px] rounded-2xl bg-surface shadow-brand"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabeçalho */}
            <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
              <div>
                <h2 className="font-serif text-lg font-semibold text-ink">Como subir a base do DRE</h2>
                <p className="mt-0.5 text-sm text-muted">Enviando o Razão Contábil — passo a passo</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar"
                className="shrink-0 rounded-md p-1.5 text-muted transition hover:bg-paper hover:text-ink"
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"><path d="M6 6l12 12M18 6L6 18" strokeWidth="1.8" strokeLinecap="round" /></svg>
              </button>
            </div>

            {/* Conteúdo */}
            <div className="max-h-[70vh] overflow-y-auto px-6 py-5 text-[13.5px] leading-relaxed text-ink/85">
              {/* Resposta rápida — a dúvida do mês x ano */}
              <div className="mb-5 rounded-xl border border-line bg-paper px-4 py-3.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Em resumo</p>
                <p className="mt-1 text-ink">
                  Você pode subir <strong>um mês por vez</strong>, <strong>vários meses juntos</strong> ou
                  o <strong>ano inteiro</strong> — tanto faz. O sistema atualiza apenas os meses que
                  estiverem dentro do arquivo enviado e <strong>preserva todo o resto</strong>.
                  Não existe uma base única que precise ser "continuada": cada envio é independente.
                </p>
              </div>

              {/* Passo a passo */}
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted">Passo a passo</p>
              <ol className="flex flex-col gap-3">
                <Passo n={1} titulo="Exporte o Razão na contabilidade">
                  No sistema contábil da empresa, exporte o <strong>Razão Contábil</strong> em Excel
                  (arquivo terminado em <code className="rounded bg-paper px-1 py-0.5 text-[12px]">.xls</code> ou
                  <code className="ml-1 rounded bg-paper px-1 py-0.5 text-[12px]">.xlsx</code>). Salve no computador.
                </Passo>
                <Passo n={2} titulo="Clique em “Subir Razão”">
                  Aqui nesta tela, no canto superior direito, clique no botão azul
                  <strong> “Subir Razão”</strong>. Vai abrir a janela para escolher o arquivo.
                </Passo>
                <Passo n={3} titulo="Escolha o arquivo">
                  Selecione o Razão que você salvou e confirme. O botão vai mostrar
                  <strong> “Processando…”</strong> por alguns segundos — aguarde.
                </Passo>
                <Passo n={4} titulo="Confira a confirmação verde">
                  Ao terminar, aparece um aviso verde dizendo qual <strong>empresa</strong> foi atualizada
                  e <strong>quais meses</strong> entraram. Se aparecer aviso vermelho, o arquivo não foi lido —
                  confira se é mesmo o Razão em Excel.
                </Passo>
                <Passo n={5} titulo="Repita para cada empresa">
                  A empresa é reconhecida <strong>automaticamente pelo próprio arquivo</strong> (pelo CNPJ).
                  Para atualizar outra empresa do grupo, é só subir o Razão dela — não precisa escolher nada.
                </Passo>
              </ol>

              {/* Mês, vários meses ou ano */}
              <p className="mb-2 mt-6 text-[11px] font-bold uppercase tracking-wider text-muted">
                Mês a mês, vários meses ou o ano inteiro?
              </p>
              <ul className="flex flex-col gap-2">
                <Item titulo="Mês a mês (recomendado)">
                  Fechou o mês na contabilidade? Suba só o Razão daquele mês. Assim, qualquer correção
                  fica isolada em um único mês e é fácil de refazer.
                </Item>
                <Item titulo="Vários meses de uma vez">
                  Se o arquivo trouxer, por exemplo, de janeiro a junho, o sistema atualiza todos esses
                  meses de uma vez — sem tocar nos demais.
                </Item>
                <Item titulo="Ano inteiro">
                  Um arquivo com o ano completo atualiza os 12 meses juntos. Útil no primeiro carregamento
                  ou para recompor tudo de uma vez.
                </Item>
              </ul>

              {/* Fique tranquilo */}
              <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3.5 text-[13px] text-amber-800">
                <p className="mb-1.5 font-bold">Pode ficar tranquilo</p>
                <ul className="flex list-disc flex-col gap-1 pl-4">
                  <li><strong>Re-subir o mesmo mês não duplica</strong> — o sistema apaga e regrava aquele mês.</li>
                  <li><strong>Subir julho não mexe em janeiro–junho</strong> — só o que vem no arquivo é atualizado.</li>
                  <li>Seus <strong>ajustes gerenciais e classificações (de-para)</strong> são preservados a cada envio.</li>
                  <li>Se subir a empresa errada, dá para corrigir — é só reenviar o arquivo certo ou pedir apoio.</li>
                </ul>
              </div>
            </div>

            {/* Rodapé */}
            <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:brightness-125"
              >
                Entendi
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

function Passo({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink text-[12px] font-bold text-white">{n}</span>
      <div>
        <p className="font-semibold text-ink">{titulo}</p>
        <p className="text-ink/75">{children}</p>
      </div>
    </li>
  )
}

function Item({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <li className="rounded-lg border border-line bg-surface px-3.5 py-2.5">
      <p className="font-semibold text-ink">{titulo}</p>
      <p className="text-ink/75">{children}</p>
    </li>
  )
}
