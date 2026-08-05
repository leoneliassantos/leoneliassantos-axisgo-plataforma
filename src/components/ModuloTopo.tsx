import { useLayoutEffect, useRef, type ReactNode } from 'react'

/**
 * Cabeçalho PADRÃO dos módulos com tabela de meses (DRE, Fluxo de Caixa…).
 * Envolve título + ações + cards de resumo e fica CONGELADO no topo da área de
 * conteúdo (sticky) enquanto a tabela rola.
 *
 * Mede a própria altura e a publica na CSS var `--topo-h`, para a linha de
 * cabeçalho da tabela (os meses) congelar EXATAMENTE embaixo dos cards:
 *   thead th { position: sticky; top: var(--topo-h) }
 */
export function ModuloTopo({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const publica = () => document.documentElement.style.setProperty('--topo-h', `${el.offsetHeight}px`)
    publica()
    const ro = new ResizeObserver(publica)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={ref} className="sticky top-0 z-20 flex flex-col gap-3 border-b border-line bg-paper pb-3">
      {children}
    </div>
  )
}
