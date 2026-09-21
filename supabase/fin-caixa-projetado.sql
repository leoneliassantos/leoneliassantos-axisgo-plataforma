-- =====================================================================
-- AxisGo · Fluxo de Caixa PROJETADO (MC Distribuidora)
-- Módulo isolado do Realizado (fin-caixa.sql) — dados próprios, upload
-- próprio, saldo de abertura próprio, categorias próprias. Rodar no SQL
-- Editor do Supabase da MC, DEPOIS do schema.sql e do fin-caixa.sql
-- (usa public.is_admin() e a tabela public.fin_config, já existentes).
--
-- Segurança:
--   • Qualquer usuário AUTENTICADO pode LER.
--   • Apenas ADMIN pode ESCREVER (subir base / cadastrar lançamentos
--     fixos / editar categorias / editar saldo de abertura).
-- =====================================================================

-- 1) Títulos "em aberto" do Foodpro (Fluxo de Caixa Orçado)
create table if not exists public.fin_titulos_projetados (
  id            bigint generated always as identity primary key,
  origem        text not null,           -- 'Foodpro Vendas' | 'Foodpro Distribuidora'
  numero        text,                    -- Número (ex.: 'NFE 13868', '1822')
  item          text,                    -- Item (ex.: '1/1', '2')
  tipo          text not null,           -- 'entrada' (C) | 'saida' (D)
  doc_tipo      text,                    -- Doc. (ex.: 'NFe')
  movimento     date,
  vencimento    date,
  participante  text,                    -- nome legível (não CNPJ, diferente do Realizado)
  valor         numeric(16, 2) not null default 0,
  juros_multa   numeric(16, 2) not null default 0,
  situacao_origem text,                  -- Situação como veio na planilha (informativo)
  created_at    timestamptz not null default now()
);
create index if not exists fin_titulos_proj_venc_idx on public.fin_titulos_projetados (vencimento);
create index if not exists fin_titulos_proj_origem_idx on public.fin_titulos_projetados (origem);

alter table public.fin_titulos_projetados enable row level security;
drop policy if exists "fin_titulos_proj_leitura" on public.fin_titulos_projetados;
create policy "fin_titulos_proj_leitura" on public.fin_titulos_projetados
  for select to authenticated using (true);
drop policy if exists "fin_titulos_proj_escrita" on public.fin_titulos_projetados;
create policy "fin_titulos_proj_escrita" on public.fin_titulos_projetados
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Substituição TOTAL: cada upload é a base completa e atual de tudo que
-- está em aberto (não é um recorte mensal cumulativo) — diferente do
-- Realizado, aqui não faz sentido substituir por canal/período.
create or replace function public.fin_projetado_replace(p_rows jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem atualizar a base.';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Envio vazio: nenhum título para gravar. A base atual foi preservada.';
  end if;

  truncate table public.fin_titulos_projetados;

  insert into public.fin_titulos_projetados
    (origem, numero, item, tipo, doc_tipo, movimento, vencimento, participante, valor, juros_multa, situacao_origem)
  select x.origem, x.numero, x.item, x.tipo, x.doc_tipo, x.movimento, x.vencimento, x.participante, x.valor, x.juros_multa, x.situacao_origem
  from jsonb_to_recordset(p_rows) as x(
    origem text, numero text, item text, tipo text, doc_tipo text, movimento date, vencimento date,
    participante text, valor numeric, juros_multa numeric, situacao_origem text
  );

  get diagnostics n = row_count;
  return n;
end; $$;
revoke all on function public.fin_projetado_replace(jsonb) from public, anon;
grant execute on function public.fin_projetado_replace(jsonb) to authenticated;

-- 2) Lançamentos fixos (cadastro manual, recorrente mensal)
create table if not exists public.fin_lancamentos_fixos (
  id           bigint generated always as identity primary key,
  nome         text not null,
  tipo         text not null,            -- 'entrada' | 'saida'
  categoria    text,
  valor        numeric(16, 2) not null default 0,
  dia_mes      integer not null check (dia_mes between 1 and 31),
  data_inicio  date not null,
  data_fim     date,                     -- null = sem data de término
  ativo        boolean not null default true,
  created_at   timestamptz not null default now()
);
alter table public.fin_lancamentos_fixos enable row level security;
drop policy if exists "fin_lancfixos_leitura" on public.fin_lancamentos_fixos;
create policy "fin_lancfixos_leitura" on public.fin_lancamentos_fixos
  for select to authenticated using (true);
drop policy if exists "fin_lancfixos_escrita" on public.fin_lancamentos_fixos;
create policy "fin_lancfixos_escrita" on public.fin_lancamentos_fixos
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 3) De-para de categorias por participante — próprio do Projetado
-- (aqui participante já é o nome legível, não o CNPJ do Realizado, então
-- não dá pra reaproveitar fin_categoria_map).
create table if not exists public.fin_projetado_categoria_map (
  participante text primary key,
  categoria    text,
  updated_at   timestamptz not null default now()
);
alter table public.fin_projetado_categoria_map enable row level security;
drop policy if exists "fin_proj_catmap_leitura" on public.fin_projetado_categoria_map;
create policy "fin_proj_catmap_leitura" on public.fin_projetado_categoria_map
  for select to authenticated using (true);
drop policy if exists "fin_proj_catmap_escrita" on public.fin_projetado_categoria_map;
create policy "fin_proj_catmap_escrita" on public.fin_projetado_categoria_map
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Pronto. Saldo de abertura do Projetado reaproveita a tabela fin_config
-- já existente (fin-caixa.sql), só com chaves novas:
--   'projetado_abertura_data', 'projetado_abertura_valor'.
