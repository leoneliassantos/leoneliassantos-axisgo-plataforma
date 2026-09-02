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
   * Ícone do módulo no menu lateral (conteúdo interno de um <svg viewBox="0 0 24 24">,
   * traço em currentColor). Aparece principalmente com o menu recolhido. Se ausente,
   * o menu usa um ícone genérico.
   */
  icon?: ReactNode
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

/* ---- Ícones dos módulos (menu lateral, sobretudo recolhido) ---- */
// Financeiro
const icDre = (
  <>
    <path d="M6 3h9l4 4v14a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1z" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M14 3v5h5M8 13h8M8 17h6M8 9h3" strokeWidth="1.6" strokeLinecap="round" />
  </>
)
const icFaturamento = (
  <>
    <path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2z" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M9 7h6M9 11h6M9 15h4" strokeWidth="1.6" strokeLinecap="round" />
  </>
)
const icFluxoCaixa = (
  <>
    <rect x="2" y="6" width="20" height="12" rx="2" strokeWidth="1.6" />
    <circle cx="12" cy="12" r="2.5" strokeWidth="1.6" />
    <path d="M6 9v6M18 9v6" strokeWidth="1.6" strokeLinecap="round" />
  </>
)
const icCaixaTitulos = (
  <>
    <ellipse cx="12" cy="6" rx="7" ry="3" strokeWidth="1.6" />
    <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" strokeWidth="1.6" />
  </>
)
const icRentabilidade = (
  <>
    <path d="M3 17l6-6 4 4 8-8" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M17 7h4v4" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </>
)
const icVendas = (
  <>
    <circle cx="9" cy="20" r="1.4" strokeWidth="1.6" />
    <circle cx="18" cy="20" r="1.4" strokeWidth="1.6" />
    <path d="M3 4h2l2.4 12.2a1 1 0 001 .8h9a1 1 0 001-.8L21 8H6" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </>
)
// Operações
const icFluxoProducao = (
  <>
    <circle cx="6" cy="6" r="2" strokeWidth="1.6" />
    <circle cx="6" cy="18" r="2" strokeWidth="1.6" />
    <circle cx="18" cy="12" r="2" strokeWidth="1.6" />
    <path d="M8 6h4a4 4 0 014 4M8 18h4a4 4 0 004-4" strokeWidth="1.6" strokeLinecap="round" />
  </>
)
const icOrdens = (
  <>
    <rect x="6" y="4" width="12" height="17" rx="2" strokeWidth="1.6" />
    <path d="M9 4h6v3H9z" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M9 12h6M9 16h4" strokeWidth="1.6" strokeLinecap="round" />
  </>
)
const icAcompanhamento = (
  <path d="M3 12h4l2-6 4 12 2-6h6" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
)
const icCobranca = (
  <>
    <circle cx="12" cy="12" r="9" strokeWidth="1.6" />
    <path d="M12 7v10M9.5 9.2c0-1.2 1.1-1.9 2.5-1.9s2.5.7 2.5 1.9c0 2.6-5 1.4-5 4 0 1.2 1.1 1.9 2.5 1.9s2.5-.7 2.5-1.9" strokeWidth="1.5" strokeLinecap="round" />
  </>
)
// Cadastros
const icClientes = (
  <>
    <circle cx="12" cy="8" r="3.2" strokeWidth="1.6" />
    <path d="M5 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5" strokeWidth="1.6" strokeLinecap="round" />
  </>
)
const icUniformes = (
  <path d="M8 3l4 2 4-2 4 4-3 2v10a1 1 0 01-1 1H8a1 1 0 01-1-1V9L4 7z" strokeWidth="1.5" strokeLinejoin="round" />
)
const icCores = (
  <path d="M12 3c-4 4-6 6.5-6 9a6 6 0 0012 0c0-2.5-2-5-6-9z" strokeWidth="1.6" strokeLinejoin="round" />
)
const icTecidos = (
  <path d="M3 5h18M3 12h18M3 19h18M8 5v14M16 5v14" strokeWidth="1.4" />
)
const icFornecedores = (
  <>
    <rect x="1" y="6" width="13" height="10" rx="1" strokeWidth="1.5" />
    <path d="M14 9h4l3 3v4h-7z" strokeWidth="1.5" strokeLinejoin="round" />
    <circle cx="6" cy="18" r="1.6" strokeWidth="1.5" />
    <circle cx="17" cy="18" r="1.6" strokeWidth="1.5" />
  </>
)
// Comercial
const icVisaoGeral = (
  <path d="M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
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
        icon: icVisaoGeral,
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
      { slug: 'fluxo-producao', label: 'Fluxo de Produção', icon: icFluxoProducao, element: <FluxoProducao /> },
      { slug: 'ordens-producao', label: 'Ordens de Produção', icon: icOrdens, element: <OrdensProducao /> },
      { slug: 'acompanhamento', label: 'Acompanhamento', icon: icAcompanhamento, element: <Acompanhamento /> },
      { slug: 'cobranca-oficinas', label: 'Cobrança de Oficinas', icon: icCobranca, element: <CobrancaOficinas />, podeVer: podeVerValorFornecedor },
      { slug: 'cad-clientes', label: 'Clientes', grupo: 'Cadastros', icon: icClientes, element: <Cadastros tipo="clientes" /> },
      { slug: 'cad-uniformes', label: 'Uniformes', grupo: 'Cadastros', icon: icUniformes, element: <Cadastros tipo="uniformes" /> },
      { slug: 'cad-cores', label: 'Cores', grupo: 'Cadastros', icon: icCores, element: <Cadastros tipo="cores" /> },
      { slug: 'cad-tecidos', label: 'Tecidos', grupo: 'Cadastros', icon: icTecidos, element: <Cadastros tipo="tecidos" /> },
      { slug: 'cad-fornecedores', label: 'Fornecedores', grupo: 'Cadastros', icon: icFornecedores, element: <Cadastros tipo="fornecedores" /> },
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
      { slug: 'vendas', label: 'Vendas', icon: icVendas, element: <Vendas />, optIn: true },
      // Fluxo de Caixa por títulos (Foodpro) — específico da MC (VITE_MODULES incluir "caixa").
      { slug: 'caixa', label: 'Fluxo de Caixa', icon: icCaixaTitulos, element: <Caixa />, optIn: true },
      { slug: 'dre', label: 'DRE', icon: icDre, element: <Dre /> },
      { slug: 'faturamento', label: 'Faturamento', icon: icFaturamento, element: <FaturamentoHub /> },
      { slug: 'fluxo-caixa', label: 'Fluxo de Caixa', icon: icFluxoCaixa, element: <FluxoCaixaHub /> },
      { slug: 'rentabilidade', label: 'Rentabilidade de Projetos', icon: icRentabilidade, element: <Rentabilidade /> },
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
