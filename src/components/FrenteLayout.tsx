import { Outlet } from 'react-router-dom'
import type { Frente } from '../modules/registry'

/**
 * Layout de uma frente. A navegação entre módulos passou para a barra lateral
 * (submenu da frente), que também já indica em que frente/módulo você está.
 * Por isso aqui não há mais cabeçalho próprio: cada módulo renderiza o seu
 * título, e a área ganha altura para o conteúdo (indicadores, tabelas).
 */
export function FrenteLayout({ frente }: { frente: Frente }) {
  return (
    <div className="flex flex-col" data-frente={frente.slug}>
      <Outlet />
    </div>
  )
}
