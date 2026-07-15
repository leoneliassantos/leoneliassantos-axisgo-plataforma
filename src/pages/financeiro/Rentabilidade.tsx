import { EmConstrucao } from '../../components/EmConstrucao'

export function Rentabilidade() {
  return (
    <EmConstrucao
      titulo="Rentabilidade de Projetos"
      descricao="Aqui vamos cruzar receita e custos por projeto para apurar a margem de cada entrega, a partir da base de dados centralizada."
      itens={['Margem por projeto', 'Custo x Receita', 'Ranking de rentabilidade', 'Importação via Excel']}
    />
  )
}
