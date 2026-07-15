import { EmConstrucao } from '../../components/EmConstrucao'

export function Indicadores() {
  return (
    <EmConstrucao
      titulo="Indicadores Financeiros"
      descricao="Painel de indicadores gerados automaticamente a partir dos dados da plataforma — liquidez, endividamento, margens e evolução mês a mês."
      itens={['EBITDA', 'Margem líquida', 'Ponto de equilíbrio', 'Fluxo de caixa']}
    />
  )
}
