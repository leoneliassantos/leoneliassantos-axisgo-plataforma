-- =====================================================================
-- AxisGo · Módulo Financeiro → DRE · Classificação de contas (parte 2)
-- Ambiente de reclassificação: guarda, POR CÓDIGO DE CONTA, em qual grupo
-- (nível 1) e subgrupo (nível 2) do DRE a conta entra; e os grupos nível 1
-- criados pelo cliente (com seu "papel"). É por código (plano de contas),
-- valendo para todas as empresas do grupo.
-- Componente reutilizável do Core (serve a qualquer cliente).
-- Execute no SQL Editor do Supabase (depois de dre.sql).
--
-- Segurança: leitura = autenticado · escrita = admin (public.is_admin()).
-- =====================================================================

-- Override de classificação por conta (sobrepõe a classificação padrão do código).
create table if not exists public.dre_classificacao (
  codigo     text primary key,
  grupo      text not null,               -- nível 1
  subgrupo   text not null default '',     -- nível 2 (livre; '' = sem subgrupo)
  updated_at timestamptz not null default now()
);

alter table public.dre_classificacao enable row level security;

drop policy if exists "drecl_leitura_autenticado" on public.dre_classificacao;
create policy "drecl_leitura_autenticado"
  on public.dre_classificacao for select to authenticated using (true);

drop policy if exists "drecl_escrita_admin" on public.dre_classificacao;
create policy "drecl_escrita_admin"
  on public.dre_classificacao for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Grupos de nível 1 criados pelo cliente (estendem o catálogo padrão).
-- papel: define onde o grupo entra no DRE e se soma ou subtrai. Valores:
--   receita_bruta, deducao, custo, despesa_op, outra_desp_op, outra_rec_op,
--   depreciacao, rec_fin, desp_fin, equiv, imposto
create table if not exists public.dre_grupos (
  nome       text primary key,
  papel      text not null,
  ordem      integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.dre_grupos enable row level security;

drop policy if exists "dregr_leitura_autenticado" on public.dre_grupos;
create policy "dregr_leitura_autenticado"
  on public.dre_grupos for select to authenticated using (true);

drop policy if exists "dregr_escrita_admin" on public.dre_grupos;
create policy "dregr_escrita_admin"
  on public.dre_grupos for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Catálogo de subgrupos (nível 2) por grupo. Antes o subgrupo só existia
-- "colado" a uma conta em dre_classificacao; agora vira catálogo de primeira
-- classe (igual dre_grupos), para poder ser SELECIONADO nos Ajustes e existir
-- mesmo em grupos sem conta nativa (ex.: um grupo de Custo criado para receber
-- reclassificações). Vale para todas as empresas.
create table if not exists public.dre_subgrupos (
  grupo      text not null,               -- nível 1 (referencia o nome do grupo)
  subgrupo   text not null,               -- nível 2
  ordem      integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (grupo, subgrupo)
);

alter table public.dre_subgrupos enable row level security;

drop policy if exists "dresg_leitura_autenticado" on public.dre_subgrupos;
create policy "dresg_leitura_autenticado"
  on public.dre_subgrupos for select to authenticated using (true);

drop policy if exists "dresg_escrita_admin" on public.dre_subgrupos;
create policy "dresg_escrita_admin"
  on public.dre_subgrupos for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Pronto. O DRE lê estas três tabelas e monta a estrutura; sem elas, usa a
-- classificação padrão embutida no código.
