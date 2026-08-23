-- =====================================================================
-- AxisGo · Fluxo de Caixa por TÍTULOS (contas a pagar/receber) — Foodpro
-- Módulo específico da MC Distribuidora. Rodar no SQL Editor do Supabase
-- da MC, DEPOIS do schema.sql (usa public.is_admin()).
--
-- Segurança:
--   • Qualquer usuário AUTENTICADO pode LER.
--   • Apenas ADMIN pode ESCREVER (subir base / editar config / categorias).
-- =====================================================================

-- 1) Títulos financeiros (cada linha = um título/parcela)
create table if not exists public.fin_titulos (
  id            bigint generated always as identity primary key,
  origem        text not null,           -- 'Foodpro Vendas' | 'Foodpro Distribuidora'
  participante  text,                    -- CNPJ/CPF do participante
  tipo          text not null,           -- 'entrada' (C) | 'saida' (D)
  doc           text,                    -- Número Documento
  item          text,
  emissao       date,
  vencimento    date,
  valor_doc     numeric(16, 2) not null default 0,
  forma_pgto    text,
  data_pgto     date,                    -- null = ainda não pago
  valor_pago    numeric(16, 2) not null default 0,
  multa         numeric(16, 2) not null default 0,
  juros         numeric(16, 2) not null default 0,
  desconto      numeric(16, 2) not null default 0,
  obs           text,
  created_at    timestamptz not null default now()
);
create index if not exists fin_titulos_origem_idx on public.fin_titulos (origem);
create index if not exists fin_titulos_pgto_idx    on public.fin_titulos (data_pgto);
create index if not exists fin_titulos_venc_idx    on public.fin_titulos (vencimento);
create index if not exists fin_titulos_part_idx    on public.fin_titulos (participante);

alter table public.fin_titulos enable row level security;
drop policy if exists "fin_titulos_leitura" on public.fin_titulos;
create policy "fin_titulos_leitura" on public.fin_titulos
  for select to authenticated using (true);
drop policy if exists "fin_titulos_escrita" on public.fin_titulos;
create policy "fin_titulos_escrita" on public.fin_titulos
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Substituição POR ORIGEM: cada arquivo é a base COMPLETA do seu canal.
-- Ao subir "Foodpro Vendas", apaga só os títulos de 'Foodpro Vendas' e regrava;
-- não toca em 'Foodpro Distribuidora' (e vice-versa). Evita o problema de
-- duplicação/órfão que vimos nas Vendas.
create or replace function public.fin_titulos_replace_origem(p_rows jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem atualizar a base.';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Envio vazio: nenhum título para gravar. A base atual foi preservada.';
  end if;

  delete from public.fin_titulos t
   where t.origem in (select distinct x.origem
                      from jsonb_to_recordset(p_rows) as x(origem text));

  insert into public.fin_titulos
    (origem, participante, tipo, doc, item, emissao, vencimento, valor_doc,
     forma_pgto, data_pgto, valor_pago, multa, juros, desconto, obs)
  select x.origem, x.participante, x.tipo, x.doc, x.item, x.emissao, x.vencimento, x.valor_doc,
         x.forma_pgto, x.data_pgto, x.valor_pago, x.multa, x.juros, x.desconto, x.obs
  from jsonb_to_recordset(p_rows) as x(
    origem text, participante text, tipo text, doc text, item text, emissao date, vencimento date,
    valor_doc numeric, forma_pgto text, data_pgto date, valor_pago numeric,
    multa numeric, juros numeric, desconto numeric, obs text
  );

  get diagnostics n = row_count;
  return n;
end; $$;
revoke all on function public.fin_titulos_replace_origem(jsonb) from public, anon;
grant execute on function public.fin_titulos_replace_origem(jsonb) to authenticated;

-- 2) Config chave/valor (saldo de abertura do caixa, etc.)
create table if not exists public.fin_config (
  chave      text primary key,
  valor      text,
  updated_at timestamptz not null default now()
);
alter table public.fin_config enable row level security;
drop policy if exists "fin_config_leitura" on public.fin_config;
create policy "fin_config_leitura" on public.fin_config
  for select to authenticated using (true);
drop policy if exists "fin_config_escrita" on public.fin_config;
create policy "fin_config_escrita" on public.fin_config
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 3) De-para de categorias por participante (fornecedor → categoria de despesa)
create table if not exists public.fin_categoria_map (
  participante text primary key,
  categoria    text,
  updated_at   timestamptz not null default now()
);
alter table public.fin_categoria_map enable row level security;
drop policy if exists "fin_catmap_leitura" on public.fin_categoria_map;
create policy "fin_catmap_leitura" on public.fin_categoria_map
  for select to authenticated using (true);
drop policy if exists "fin_catmap_escrita" on public.fin_categoria_map;
create policy "fin_catmap_escrita" on public.fin_categoria_map
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Pronto. A base de títulos é carregada pelo módulo Fluxo de Caixa (admin →
-- "Atualizar base"); config e categorias são editadas nas telas do módulo.
