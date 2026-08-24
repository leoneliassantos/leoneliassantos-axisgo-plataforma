import type { ReactNode } from 'react'
import { podeVerValorFornecedor, type Role } from '../auth/types'
import { EmConstrucao } from '../components/EmConstrucao'
import { Rentabilidade } from '../pages/financeiro/Rentabilidade'
import { FluxoCaixaHub } from '../pages/financeiro/FluxoCaixaHub'
import { FaturamentoHub } from '../pages/financeiro/FaturamentoHub'
import { Dre } from '../pages/financeiro/Dre'
import { Vendas } from '../pages/financeiro/Vendas'
import { Caixa } from '../pages/financeiro/Caixa'
import { FluxoProducao } from '../pages/operacoes/FluxoProducao'
import { OrdensProducao } from '../pages/operacoes/OrdensProducao'
import { Acompanhamento } from '../pages/operacoes/Acompanhamento'
import { CobrancaOficinas } from '../pages/operacoes/CobrancaOficinas'
import { Cadastros } from '../pages/operacoes/Cadastros'

/**
 * ============================================================
 *  PAINEL DE MONTAGEM DO CLIENTE (AxisGo Core)
 * ============================================================
 * Este é o ponto de personalização de CADA cliente. Aqui você declara
 * quais FRENTES o cliente tem e quais MÓDULOS existem dentro de cada uma.
 *
 * - Cliente só tem Financeiro? Deixe apenas a frente "financeiro" na lista.
 * - Cliente tem os 3? Mantenha as três.
 * - Módulo sob medida? Crie o componente e adicione um item em `modulos`.
 *
 * O restante da plataforma (login, usuários, segurança, hub, rotas) é o
 * NÚCLEO reutilizável e não muda de cliente para cliente.
 */

export interface Modulo {
  slug: string
  label: string
  element: ReactNode
  /**
   * true = módulo "sob demanda": só aparece na instância que o pedir
   * explicitamente via VITE_MODULES. Assim um módulo específico de um
   * cliente (ex.: Vendas da MC) não vaza para os outros que usam o mesmo Core.
   */
  optIn?: boolean
  /**
   * Rótulo de agrupamento no menu lateral. Módulos com o mesmo `grupo`
   * aparecem juntos, sob um submenu recolhível (ex.: "Cadastros").
   */
  grupo?: string
  /**
   * Visibilidade por perfil. Se definido, o módulo só aparece (menu + acesso)
   * quando o predicado é verdadeiro para o role do usuário. Ausente = todos veem.
   */
  podeVer?: (role: Role) => boolean
}

export interface Frente {
  slug: string
  nome: string
  descricao: string
  /** false = aparece como "Em breve" no hub. */
  disponivel: boolean
  icon: ReactNode
  modulos: Modulo[]
}

const iconComercial = (
  <path d="M3 3v18h18M7 15l4-4 3 3 5-6" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
)
const iconOperacoes = (
  <>
    <circle cx="12" cy="12" r="3.2" strokeWidth="1.6" />
    <path
      d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </>
)
const iconFinanceiro = (
  <>
    <rect x="3" y="4" width="18" height="16" rx="2" strokeWidth="1.6" />
    <path d="M3 9h18M8 14h3M8 17h6" strokeWidth="1.6" strokeLinecap="round" />
  </>
)

const TODAS_FRENTES: Frente[] = [
  {
    slug: 'comercial',
    nome: 'Comercial',
    descricao: 'Funil, propostas e indicadores de vendas.',
    disponivel: false,
    icon: iconComercial,
    modulos: [
      {
        slug: 'visao-geral',
        label: 'Visão geral',
        element: (
          <EmConstrucao
            titulo="Frente Comercial"
            descricao="Acompanhamento de funil de vendas, propostas e metas — a partir da base de dados do cliente."
            itens={['Pipeline', 'Propostas', 'Metas', 'Taxa de conversão']}
          />
        ),
      },
    ],
  },
  {
    slug: 'operacoes',
    nome: 'Operações',
    descricao: 'Fluxo de produção, ordens e acompanhamento das entregas.',
    disponivel: true,
    icon: iconOperacoes,
    modulos: [
      { slug: 'fluxo-producao', label: 'Fluxo de Produção', element: <FluxoProducao /> },
      { slug: 'ordens-producao', label: 'Ordens de Produção', element: <OrdensProducao /> },
      { slug: 'acompanhamento', label: 'Acompanhamento', element: <Acompanhamento /> },
      { slug: 'cobranca-oficinas', label: 'Cobrança de Oficinas', element: <CobrancaOficinas />, podeVer: podeVerValorFornecedor },
      { slug: 'cad-clientes', label: 'Clientes', grupo: 'Cadastros', element: <Cadastros tipo="clientes" /> },
      { slug: 'cad-uniformes', label: 'Uniformes', grupo: 'Cadastros', element: <Cadastros tipo="uniformes" /> },
      { slug: 'cad-cores', label: 'Cores', grupo: 'Cadastros', element: <Cadastros tipo="cores" /> },
      { slug: 'cad-tecidos', label: 'Tecidos', grupo: 'Cadastros', element: <Cadastros tipo="tecidos" /> },
      { slug: 'cad-fornecedores', label: 'Fornecedores', grupo: 'Cadastros', element: <Cadastros tipo="fornecedores" /> },
    ],
  },
  {
    slug: 'financeiro',
    nome: 'Financeiro',
    descricao: 'DRE, rentabilidade de projetos e indicadores financeiros.',
    disponivel: true,
    icon: iconFinanceiro,
    modulos: [
      // Módulo sob demanda (optIn): aparece só onde VITE_MODULES incluir "vendas".
      { slug: 'vendas', label: 'Vendas', element: <Vendas />, optIn: true },
      // Fluxo de Caixa por títulos (Foodpro) — específico da MC (VITE_MODULES incluir "caixa").
      { slug: 'caixa', label: 'Fluxo de Caixa', element: <Caixa />, optIn: true },
      { slug: 'dre', label: 'DRE', element: <Dre /> },
      { slug: 'faturamento', label: 'Faturamento', element: <FaturamentoHub /> },
      { slug: 'fluxo-caixa', label: 'Fluxo de Caixa', element: <FluxoCaixaHub /> },
      { slug: 'rentabilidade', label: 'Rentabilidade de Projetos', element: <Rentabilidade /> },
    ],
  },
]

/**
 * Frentes ATIVAS nesta instância.
 * Configurável por VITE_FRONTS = lista de slugs separados por vírgula.
 *   Ex.: VITE_FRONTS="financeiro"                  → só Financeiro (ex.: MC Distribuidora)
 *        VITE_FRONTS="comercial,operacoes,financeiro" ou vazio → todas
 */
const ativos = (import.meta.env.VITE_FRONTS as string | undefined)
  ?.split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean)

/**
 * Módulos ATIVOS nesta instância (opcional).
 * VITE_MODULES = lista de slugs separados por vírgula.
 *   • Se definido → mostra SÓ esses módulos (ex.: MC → VITE_MODULES="vendas").
 *   • Se vazio    → mostra todos, EXCETO os `optIn` (que só entram quando pedidos).
 */
const modulosAtivos = (import.meta.env.VITE_MODULES as string | undefined)
  ?.split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean)

function aplicaModulos(f: Frente): Frente {
  const mods =
    modulosAtivos && modulosAtivos.length
      ? f.modulos.filter((m) => modulosAtivos.includes(m.slug))
      : f.modulos.filter((m) => !m.optIn)
  return { ...f, modulos: mods }
}

export const FRENTES: Frente[] = (ativos && ativos.length
  ? TODAS_FRENTES.filter((f) => ativos.includes(f.slug))
  : TODAS_FRENTES
)
  .map(aplicaModulos)
  .filter((f) => f.modulos.length > 0)
