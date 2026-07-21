import type { ReactNode } from 'react'
import { EmConstrucao } from '../components/EmConstrucao'
import { Rentabilidade } from '../pages/financeiro/Rentabilidade'
import { Indicadores } from '../pages/financeiro/Indicadores'

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

export const FRENTES: Frente[] = [
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
    descricao: 'Processos, entregas e produtividade das equipes.',
    disponivel: false,
    icon: iconOperacoes,
    modulos: [
      {
        slug: 'visao-geral',
        label: 'Visão geral',
        element: (
          <EmConstrucao
            titulo="Frente de Operações"
            descricao="Processos, projetos, capacidade das equipes e cumprimento de prazos (SLA)."
            itens={['Projetos', 'Capacidade', 'Produtividade', 'SLA']}
          />
        ),
      },
    ],
  },
  {
    slug: 'financeiro',
    nome: 'Financeiro',
    descricao: 'DRE, rentabilidade de projetos e indicadores financeiros.',
    disponivel: true,
    icon: iconFinanceiro,
    modulos: [
      {
        slug: 'dre',
        label: 'DRE',
        element: (
          <EmConstrucao
            titulo="DRE Contábil"
            descricao="Importe a base do cliente (Excel) para gerar a Demonstração do Resultado do Exercício automaticamente."
            itens={['Receita e deduções', 'Custos e despesas', 'Resultado por competência', 'Importação via Excel']}
          />
        ),
      },
      { slug: 'rentabilidade', label: 'Rentabilidade de Projetos', element: <Rentabilidade /> },
      { slug: 'indicadores', label: 'Indicadores', element: <Indicadores /> },
    ],
  },
]
