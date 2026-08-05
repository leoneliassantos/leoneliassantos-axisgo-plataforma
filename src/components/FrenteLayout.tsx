import { Outlet } from 'react-router-dom'
import type { Frente } from '../modules/registry'

/**
 * Layout de uma frente. A navegação entre os módulos passou para a barra
 * lateral (submenu da frente); aqui fica só um título compacto de contexto
 * e o conteúdo do módulo, aproveitando a largura para os indicadores.
 */
export function FrenteLayout({ frente }: { frente: Frente }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brand">{frente.nome}</span>
      <Outlet />
    </div>
  )
}
