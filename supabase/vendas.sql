-- =====================================================================
-- AxisGo · Módulo Vendas (notas de venda item a item)
-- Tabela + RLS + função de substituição da base (upload).
-- Rodar no SQL Editor DEPOIS do schema.sql (usa public.is_admin()).
--
-- Segurança:
--   • Qualquer usuário AUTENTICADO pode LER.
--   • Apenas ADMIN pode ESCREVER (subir/atualizar a base).
-- =====================================================================

-- 1) Itens de venda (a "base" que o cliente atualiza via Excel)
create table if not exists public.vendas (
  id             bigint generated always as identity primary key,
  nota           text,
  data           date not null,
  tipo           text,
  cliente        text,
  sku            text,
  produto        text,
  quantidade     numeric(16, 3) not null default 0,
  valor_unitario numeric(16, 2) not null default 0,
  serie          text,
  origem         text,
  created_at     timestamptz not null default now()
);

create index if not exists vendas_data_idx   on public.vendas (data);
create index if not exists vendas_origem_idx on public.vendas (origem);

alter table public.vendas enable row level security;

-- Leitura: todo usuário autenticado
drop policy if exists "vendas_leitura_autenticado" on public.vendas;
create policy "vendas_leitura_autenticado"
  on public.vendas for select
  to authenticated
  using (true);

-- Escrita (insert/update/delete): apenas admin
drop policy if exists "vendas_escrita_admin" on public.vendas;
create policy "vendas_escrita_admin"
  on public.vendas for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 2) Substituição atômica da base (botão "Atualizar base")
create or replace function public.vendas_replace(p_rows jsonb)
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

  -- TRUNCATE (em vez de DELETE) para não esbarrar na proteção safe-update.
  truncate table public.vendas restart identity;

  insert into public.vendas (nota, data, tipo, cliente, sku, produto, quantidade, valor_unitario, serie, origem)
  select x.nota, x.data, x.tipo, x.cliente, x.sku, x.produto, x.quantidade, x.valor_unitario, x.serie, x.origem
  from jsonb_to_recordset(p_rows) as x(
    nota text, data date, tipo text, cliente text, sku text, produto text,
    quantidade numeric, valor_unitario numeric, serie text, origem text
  );

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.vendas_replace(jsonb) from public, anon;
grant execute on function public.vendas_replace(jsonb) to authenticated;

-- 3) Substituição INCREMENTAL da base — por CANAL + PERÍODO (multi-sistema).
--    Para cada canal (origem) presente no envio, apaga apenas as vendas cujo
--    período (data) está DENTRO do intervalo coberto pelo arquivo [min..max]
--    daquele canal, e regrava. Assim:
--      • subir fevereiro NÃO apaga janeiro (datas fora do intervalo ficam);
--      • resubir o mesmo período substitui só aquele período;
--      • cada canal é independente (Olist não mexe no Foodpro e vice-versa).
create or replace function public.vendas_replace_periodo(p_rows jsonb)
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

  -- apaga, por canal, apenas o intervalo de datas que o envio cobre
  delete from public.vendas v
  using (
    select origem, min(data) as d0, max(data) as d1
    from jsonb_to_recordset(p_rows) as x(origem text, data date)
    group by origem
  ) r
  where v.origem is not distinct from r.origem
    and v.data between r.d0 and r.d1;

  insert into public.vendas (nota, data, tipo, cliente, sku, produto, quantidade, valor_unitario, serie, origem)
  select x.nota, x.data, x.tipo, x.cliente, x.sku, x.produto, x.quantidade, x.valor_unitario, x.serie, x.origem
  from jsonb_to_recordset(p_rows) as x(
    nota text, data date, tipo text, cliente text, sku text, produto text,
    quantidade numeric, valor_unitario numeric, serie text, origem text
  );

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.vendas_replace_periodo(jsonb) from public, anon;
grant execute on function public.vendas_replace_periodo(jsonb) to authenticated;

-- Pronto. Tabela, RLS e função criadas.
-- A base é carregada pelo próprio módulo (admin → "Atualizar base"),
-- para que nenhum dado real precise ficar no repositório.
