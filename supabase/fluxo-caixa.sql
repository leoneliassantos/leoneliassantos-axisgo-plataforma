-- =====================================================================
-- AxisGo · Módulo Financeiro → Fluxo de Caixa
-- Tabelas + RLS + função de substituição da base (upload).
-- Execute no SQL Editor do Supabase (depois do schema.sql principal).
--
-- Modelo de segurança:
--   • Qualquer usuário AUTENTICADO pode LER (visualizar o fluxo).
--   • Apenas ADMIN pode ESCREVER (subir/atualizar a base e o saldo inicial),
--     reaproveitando a função public.is_admin() já criada no schema.sql.
-- =====================================================================

-- 1) Lançamentos do fluxo de caixa (a "base" que o cliente atualiza)
create table if not exists public.fluxo_caixa (
  id         bigint generated always as identity primary key,
  tipo       text not null check (tipo in ('ENTRADA', 'SAÍDA')),
  descricao  text,
  categoria  text,
  valor      numeric(16, 2) not null default 0,
  data       date not null,
  created_at timestamptz not null default now()
);

create index if not exists fluxo_caixa_data_idx on public.fluxo_caixa (data);

alter table public.fluxo_caixa enable row level security;

-- Leitura: todo usuário autenticado
drop policy if exists "fc_leitura_autenticado" on public.fluxo_caixa;
create policy "fc_leitura_autenticado"
  on public.fluxo_caixa for select
  to authenticated
  using (true);

-- Escrita (insert/update/delete): apenas admin
drop policy if exists "fc_escrita_admin" on public.fluxo_caixa;
create policy "fc_escrita_admin"
  on public.fluxo_caixa for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 2) Configurações do módulo (ex.: saldo inicial de janeiro)
create table if not exists public.fluxo_caixa_config (
  chave      text primary key,
  valor      jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.fluxo_caixa_config enable row level security;

drop policy if exists "fcc_leitura_autenticado" on public.fluxo_caixa_config;
create policy "fcc_leitura_autenticado"
  on public.fluxo_caixa_config for select
  to authenticated
  using (true);

drop policy if exists "fcc_escrita_admin" on public.fluxo_caixa_config;
create policy "fcc_escrita_admin"
  on public.fluxo_caixa_config for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 3) Substituição atômica da base (usada no botão "Atualizar base")
--    Recebe a lista de lançamentos em JSON, apaga a base atual e insere a nova
--    dentro de uma única transação. Opcionalmente grava o saldo inicial.
create or replace function public.fluxo_caixa_replace(p_rows jsonb, p_saldo numeric default null)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  n integer;
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem atualizar a base.';
  end if;

  delete from public.fluxo_caixa;

  insert into public.fluxo_caixa (tipo, descricao, categoria, valor, data)
  select x.tipo, x.descricao, x.categoria, x.valor, x.data
  from jsonb_to_recordset(p_rows)
    as x(tipo text, descricao text, categoria text, valor numeric, data date);

  get diagnostics n = row_count;

  if p_saldo is not null then
    insert into public.fluxo_caixa_config (chave, valor, updated_at)
    values ('saldo_inicial', to_jsonb(p_saldo), now())
    on conflict (chave) do update set valor = excluded.valor, updated_at = now();
  end if;

  return n;
end;
$$;

revoke all on function public.fluxo_caixa_replace(jsonb, numeric) from public, anon;
grant execute on function public.fluxo_caixa_replace(jsonb, numeric) to authenticated;

-- Pronto. Tabelas, RLS e função criadas.
-- A base inicial é carregada pelo próprio módulo (admin → "Atualizar base"),
-- para que nenhum dado financeiro real precise ficar no repositório.
