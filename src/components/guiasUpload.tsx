import { type GuiaUploadProps } from './GuiaUpload'

/* Conteúdo dos guias de upload, por módulo. Texto em pt-BR, linguagem leiga.
   Aceita **negrito** e `código`. Reaproveitado pelo componente GuiaUpload. */

export const GUIA_DRE: GuiaUploadProps = {
  title: 'Como subir a base do DRE',
  subtitle: 'Enviando o Razão Contábil ou a Base DRE — passo a passo',
  resumo:
    'Você pode subir **um mês por vez**, **vários meses juntos** ou o **ano inteiro** — tanto faz. O sistema atualiza apenas os meses que estiverem no arquivo e **preserva todo o resto**. Cada envio é independente.',
  passos: [
    { titulo: 'Tenha o arquivo em Excel', texto: 'Dá para subir **dois formatos**, o sistema reconhece sozinho: o **Razão Contábil** bruto (como sai da contabilidade) ou a planilha **“Base DRE”** — a mesma do botão **“Baixar base”** (colunas Empresa · Código · Conta · Ano · Mês · Débito · Crédito). Arquivo `.xls` ou `.xlsx`.' },
    { titulo: 'Clique em “Subir Razão”', texto: 'No canto superior direito desta tela, clique no botão azul **“Subir Razão”**. Abre a janela para escolher o arquivo.' },
    { titulo: 'Escolha o arquivo', texto: 'Selecione o arquivo e confirme. O botão mostra **“Processando…”** por alguns segundos — aguarde.' },
    { titulo: 'Confira a confirmação verde', texto: 'Ao terminar aparece um aviso verde com a **empresa** e os **meses** atualizados. Se vier aviso vermelho, confira se é o arquivo certo em Excel.' },
    { titulo: 'Uma ou várias empresas', texto: 'A empresa é reconhecida **automaticamente pelo arquivo**. No Razão bruto é uma empresa por arquivo; a planilha **“Base DRE” pode trazer várias empresas juntas** — sobem todas de uma vez.' },
  ],
  secoes: [
    {
      titulo: 'Mês a mês, vários meses ou o ano inteiro?',
      itens: [
        { titulo: 'Mês a mês (recomendado)', texto: 'Fechou o mês? Suba só aquele mês. Qualquer correção fica isolada e fácil de refazer.' },
        { titulo: 'Vários meses de uma vez', texto: 'Um arquivo de jan a jun atualiza todos esses meses juntos, sem tocar nos demais.' },
        { titulo: 'Ano inteiro', texto: 'Um arquivo com o ano completo atualiza os 12 meses de uma vez.' },
      ],
    },
  ],
  aviso: {
    titulo: 'Pode ficar tranquilo',
    itens: [
      'Re-subir o mesmo mês **não duplica** — o sistema apaga e regrava aquele mês.',
      'Subir julho **não mexe** em janeiro–junho.',
      'Seus **ajustes gerenciais e classificações (de-para)** são preservados.',
      'Subiu a empresa errada? É só reenviar o arquivo certo.',
    ],
  },
}

export const GUIA_FATURAMENTO: GuiaUploadProps = {
  title: 'Como atualizar o Faturamento',
  subtitle: 'Mapa do Publi ou Base exportada — passo a passo',
  resumo:
    'Dá para subir **dois formatos**, o sistema reconhece sozinho: o **Mapa de Faturamento** do Publi (por mês/empresa selecionados) ou a planilha **“Base”** — a mesma do botão **“Baixar base”**. Em qualquer caso, **só os meses enviados são atualizados**; os demais ficam intactos.',
  secoes: [
    {
      titulo: 'Opção A — Mapa do Publi (por mês)',
      itens: [
        { titulo: 'Escolha Empresa, Ano e Mês', texto: 'No topo da tela, selecione a **Empresa**, o **Ano** e o **Mês** que vai atualizar. É esse recorte que será substituído.' },
        { titulo: 'Exporte o Mapa no Publi', texto: 'No Publi, exporte o **Mapa de Faturamento** em Excel (`.xlsx`) e suba pelo botão **“Subir base do mês”**.' },
      ],
    },
    {
      titulo: 'Opção B — Base exportada (Baixar base)',
      itens: [
        { titulo: 'Baixe a base atual', texto: 'Clique em **“Baixar base”** para partir da planilha que já está no ar (colunas Empresa · Cliente · … · Emissão · … · Valor Faturado).' },
        { titulo: 'Edite e suba', texto: 'Ajuste no Excel e suba pelo mesmo botão. **Não precisa** escolher empresa/mês — o arquivo já traz isso, e pode ter **várias empresas e meses juntos**.' },
      ],
    },
  ],
  passos: [
    { titulo: 'Escolha o arquivo', texto: 'Clique no botão de upload e selecione a planilha (`.xlsx` ou `.xls`). O botão mostra **“Processando…”** por alguns segundos.' },
    { titulo: 'Confira a confirmação verde', texto: 'Ao terminar aparece o aviso verde com a **empresa** e os **meses** atualizados.' },
  ],
  aviso: {
    titulo: 'Pode ficar tranquilo',
    itens: [
      'Só os **meses enviados** são atualizados; os **demais ficam intactos**.',
      'Re-subir o mesmo mês **não duplica** — substitui o que havia.',
      'Na **Base**, cada empresa atualiza só as competências (meses) presentes no arquivo.',
    ],
  },
}

export const GUIA_FLUXO_CAIXA: GuiaUploadProps = {
  title: 'Como atualizar o Fluxo de Caixa',
  subtitle: 'Subindo a planilha de lançamentos — passo a passo',
  resumo:
    'É **arquivo único**: o envio substitui **TODA a base** (todos os meses de uma vez). Por isso, comece **baixando a base atual** para não perder nada.',
  passos: [
    { titulo: 'Baixe a base atual (recomendado)', texto: 'Clique em **“Baixar base”** para partir da planilha que já está no ar. Assim você não perde o histórico.' },
    { titulo: 'Edite no Excel', texto: 'Mantenha as colunas **TIPO, DESCRIÇÃO, CATEGORIA, VALOR e DATA**. Uma **linha por lançamento**.' },
    { titulo: 'Junte todos os meses', texto: 'Coloque **todos os meses na mesma planilha** — como o envio substitui a base inteira, tudo que deve ficar precisa estar no arquivo.' },
    { titulo: 'Clique em “Atualizar base”', texto: 'Clique em **“Atualizar base”** e selecione o arquivo (`.xlsx` ou `.xls`).' },
    { titulo: 'Confira a confirmação verde', texto: 'Ao terminar aparece o aviso verde com a base atualizada.' },
  ],
  aviso: {
    titulo: 'Atenção',
    itens: [
      'O envio **substitui TODA a base** (todos os meses).',
      'Sempre **baixe a base antes** e edite em cima dela, para não perder lançamentos.',
      'Só o que estiver **no arquivo** permanece.',
    ],
  },
}

/* Fluxo de Caixa Projetado alimentado pelo Bling (2 abas). */
export const GUIA_CAIXA_PROJETADO_BLING: GuiaUploadProps = {
  title: 'Como atualizar o Projetado',
  subtitle: 'Subindo Contas a Pagar e a Receber (Bling) — passo a passo',
  resumo:
    'É **arquivo único**: o envio substitui **TODA a base projetada**. Não afeta o **saldo de abertura** nem os **lançamentos fixos**.',
  passos: [
    { titulo: 'Exporte no Bling', texto: 'No Bling, exporte **Contas a Pagar** e **Contas a Receber** (em aberto) para Excel.' },
    { titulo: 'Monte o arquivo com 2 abas', texto: 'Num único Excel, crie duas abas: **“Contas a Pagar”** e **“Contas a Receber”**.' },
    { titulo: 'Clique em “Atualizar base”', texto: 'Clique em **“Atualizar base”** e selecione o arquivo (`.xlsx` ou `.xls`).' },
    { titulo: 'Confira a confirmação verde', texto: 'Ao terminar aparece o aviso verde com a base projetada atualizada.' },
  ],
  aviso: {
    titulo: 'Pode ficar tranquilo',
    itens: [
      'Substitui **toda a base projetada** de uma vez.',
      '**Não afeta** o saldo de abertura nem os lançamentos fixos.',
    ],
  },
}

/* Caixa (Foodpro) — Realizado por canal (Vendas / Distribuidora). */
export const GUIA_CAIXA_TITULOS: GuiaUploadProps = {
  title: 'Como atualizar os Títulos (Caixa)',
  subtitle: 'Subindo os Lançamentos Financeiros (Foodpro) — passo a passo',
  resumo:
    'Você tem **dois canais** — **Vendas** e **Distribuidora**. Envie **um de cada vez**; cada envio substitui **todo o canal** daquele arquivo.',
  passos: [
    { titulo: 'Exporte no Foodpro', texto: 'No Foodpro, exporte o Excel de **“Lançamentos Financeiros”**.' },
    { titulo: 'Um canal de cada vez', texto: 'Escolha o canal (**Vendas** ou **Distribuidora**) e envie o arquivo correspondente.' },
    { titulo: 'Clique em “Atualizar base”', texto: 'Clique em **“Atualizar base”** e selecione o arquivo (`.xlsx` ou `.xls`).' },
    { titulo: 'Repita para o outro canal', texto: 'Faça o mesmo com o outro canal para atualizar os dois.' },
  ],
  aviso: {
    titulo: 'Pode ficar tranquilo',
    itens: [
      'Cada envio substitui **só o canal** daquele arquivo.',
      'Só entram no fluxo os títulos com **pagamento efetivado**.',
    ],
  },
}

/* Caixa (Foodpro) — Projetado (orçado, dois canais no mesmo arquivo). */
export const GUIA_CAIXA_PROJETADO_FOODPRO: GuiaUploadProps = {
  title: 'Como atualizar o Projetado',
  subtitle: 'Subindo o Fluxo de Caixa Orçado (Foodpro) — passo a passo',
  resumo:
    'É **um upload só**: o arquivo já traz os **dois canais** (Vendas e Distribuidora) juntos. Cada envio substitui **TODA a base projetada**.',
  passos: [
    { titulo: 'Exporte no Foodpro', texto: 'No Foodpro, exporte o **“Fluxo de Caixa Orçado”** (títulos em aberto).' },
    { titulo: 'Clique em “Atualizar base”', texto: 'Clique em **“Atualizar base”** e selecione o arquivo (`.xlsx` ou `.xls`).' },
    { titulo: 'Confira a confirmação verde', texto: 'O arquivo já traz os **dois canais juntos** — é um upload só.' },
  ],
  aviso: {
    titulo: 'Pode ficar tranquilo',
    itens: [
      'Substitui **toda a base projetada** de uma vez.',
      '**Não afeta** o Realizado nem o saldo de abertura.',
    ],
  },
}

export const GUIA_VENDAS: GuiaUploadProps = {
  title: 'Como atualizar Vendas',
  subtitle: 'Subindo Olist (Excel) ou Foodpro (PDF) — passo a passo',
  resumo:
    '**Olist e Foodpro se somam** nos mesmos indicadores. No modo padrão, cada envio mexe **só no seu canal e período**.',
  passos: [
    { titulo: 'Baixe o relatório', texto: 'Baixe o **Excel do Olist** ou o **PDF do Foodpro** (Relatório de NFe Detalhado).' },
    { titulo: 'Escolha o modo em “Ao enviar”', texto: '**“Só este arquivo”** atualiza apenas o canal e o período do arquivo (o resto fica). **“Base inteira”** apaga tudo e regrava.' },
    { titulo: 'Clique em “Atualizar base”', texto: 'Clique em **“Atualizar base”** e selecione o arquivo.' },
    { titulo: 'Confira a confirmação verde', texto: 'Ao terminar aparece o aviso verde com o que foi atualizado.' },
  ],
  aviso: {
    titulo: 'Pode ficar tranquilo',
    itens: [
      'No modo **“Só este arquivo”**, cada envio mexe **só no seu canal e período**.',
      'Use **“Base inteira”** apenas quando quiser **apagar tudo e regravar**.',
    ],
  },
}
