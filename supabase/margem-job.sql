-- AxisGo · Módulo Financeiro → Rentabilidade de Projetos (Margem Job)
-- Base analítica (uma linha por job) + parâmetros do módulo. Roda uma vez.
-- Leitura: todo autenticado · Escrita (lançar/editar/excluir/importar): admin.
-- Os campos de margem NÃO ficam no banco — são calculados na tela a partir
-- de faturado, custo e encargos (a taxa do ganho tributário vem de margem_config).

create table if not exists public.margem_job (
  id               bigint generated always as identity primary key,
  empresa          text not null,          -- Batuque | Batux
  cliente          text not null,
  data             date,
  competencia      text,                   -- nome do mês (Janeiro, Fevereiro...)
  pit              text,
  ec               text,
  unidade_negocio  text,                   -- antigo "Ferramenta"
  campanha         text,
  valor_faturado   numeric(16, 2) not null default 0,
  custo_total      numeric(16, 2) not null default 0,  -- CUSTO TOTAL /IMPOSTOS
  encargos         numeric(16, 2) not null default 0,
  receita          numeric(16, 2),                     -- override manual; null = Faturado − Custo
  created_at       timestamptz not null default now()
);

-- Para bases já criadas antes da receita editável:
alter table public.margem_job add column if not exists receita numeric(16, 2);

create index if not exists margem_job_emp_idx on public.margem_job (empresa, data);
create index if not exists margem_job_cli_idx on public.margem_job (cliente);

alter table public.margem_job enable row level security;

drop policy if exists "margem_job_leitura" on public.margem_job;
create policy "margem_job_leitura"
  on public.margem_job for select
  to authenticated
  using (true);

drop policy if exists "margem_job_escrita_admin" on public.margem_job;
create policy "margem_job_escrita_admin"
  on public.margem_job for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Parâmetros do módulo (linha única, id = 1). taxa_ganho_trib = ganho
-- tributário estimado sobre os encargos (padrão 52%).
create table if not exists public.margem_config (
  id               smallint primary key default 1,
  taxa_ganho_trib  numeric(6, 4) not null default 0.52,
  atualizado_em    timestamptz not null default now(),
  constraint margem_config_unica check (id = 1)
);

insert into public.margem_config (id) values (1) on conflict (id) do nothing;

alter table public.margem_config enable row level security;

drop policy if exists "margem_config_leitura" on public.margem_config;
create policy "margem_config_leitura"
  on public.margem_config for select
  to authenticated
  using (true);

drop policy if exists "margem_config_escrita_admin" on public.margem_config;
create policy "margem_config_escrita_admin"
  on public.margem_config for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Pronto. Nenhum dado real fica no repositório — a base entra pela tela
-- (importar a planilha "Margem Job" na carga inicial, depois lançar manual).
