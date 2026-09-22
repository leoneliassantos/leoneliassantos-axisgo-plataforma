-- =====================================================================
-- AxisGo · Cadastros — Clientes, CNPJs (empresas) e Sócios
-- Módulo específico da MC Distribuidora. Rodar no SQL Editor do Supabase
-- da MC, DEPOIS do schema.sql (usa public.is_admin()).
--
-- Hierarquia: 1 Cliente pode ter VÁRIOS CNPJs (empresas); cada CNPJ pode
-- ter VÁRIOS sócios.
--
-- Segurança: dados de sócios incluem CPF e data de nascimento (PII), então
-- este módulo é ADMIN-ONLY de ponta a ponta — tanto para LER quanto para
-- ESCREVER, nas 3 tabelas (não só "autenticado lê / admin escreve" como no
-- resto do app). O front-end reforça isso escondendo o módulo do menu e
-- bloqueando a tela para quem não é admin (ver registry.tsx e Clientes.tsx),
-- mas a garantia de verdade é esta RLS — sem ela, alguém com a anon key
-- conseguiria ler CPF/nascimento direto pela API REST.
-- =====================================================================

-- 1) Clientes (o "grupo" — pode ter mais de um CNPJ)
create table if not exists public.cad_clientes (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  observacoes text,
  bloqueado   boolean not null default false,
  created_at  timestamptz not null default now()
);
alter table public.cad_clientes enable row level security;
drop policy if exists "cad_clientes_leitura" on public.cad_clientes;
create policy "cad_clientes_leitura" on public.cad_clientes
  for select to authenticated using (public.is_admin());
drop policy if exists "cad_clientes_escrita" on public.cad_clientes;
create policy "cad_clientes_escrita" on public.cad_clientes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 2) Empresas (cada linha = um CNPJ do cliente)
create table if not exists public.cad_empresas (
  id                   uuid primary key default gen_random_uuid(),
  cliente_id           uuid not null references public.cad_clientes(id) on delete cascade,
  razao_social         text not null,
  nome_fantasia        text,
  cnpj                 text not null unique,   -- só dígitos (14), formatado no front
  inscricao_estadual   text,
  inscricao_municipal  text,
  endereco             text,
  telefone             text,
  email                text,
  observacoes          text,
  bloqueado            boolean not null default false,
  created_at           timestamptz not null default now()
);
create index if not exists cad_empresas_cliente_idx on public.cad_empresas (cliente_id);
alter table public.cad_empresas enable row level security;
drop policy if exists "cad_empresas_leitura" on public.cad_empresas;
create policy "cad_empresas_leitura" on public.cad_empresas
  for select to authenticated using (public.is_admin());
drop policy if exists "cad_empresas_escrita" on public.cad_empresas;
create policy "cad_empresas_escrita" on public.cad_empresas
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 3) Sócios (cada linha = uma pessoa ligada a um CNPJ) — CPF e data de
--    nascimento moram aqui, por isso a tabela mais sensível das três.
create table if not exists public.cad_socios (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references public.cad_empresas(id) on delete cascade,
  nome             text not null,
  cpf              text,
  data_nascimento  date,
  telefone         text,
  email            text,
  participacao     numeric(5, 2),  -- % de participação societária (opcional)
  created_at       timestamptz not null default now()
);
create index if not exists cad_socios_empresa_idx on public.cad_socios (empresa_id);
alter table public.cad_socios enable row level security;
drop policy if exists "cad_socios_leitura" on public.cad_socios;
create policy "cad_socios_leitura" on public.cad_socios
  for select to authenticated using (public.is_admin());
drop policy if exists "cad_socios_escrita" on public.cad_socios;
create policy "cad_socios_escrita" on public.cad_socios
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Pronto. Tela: Financeiro → Cadastros → Clientes (visível e utilizável só
-- para quem tem role='admin' no Supabase da MC).
