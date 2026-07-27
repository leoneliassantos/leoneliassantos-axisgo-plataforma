-- =====================================================================
-- AxisGo · Módulo Financeiro → DRE (Demonstração do Resultado do Exercício)
-- Fonte: RAZÃO CONTÁBIL (multiempresa). Cada empresa sobe o seu Razão; o
-- módulo detecta a empresa pelo cabeçalho (CNPJ) e guarda os movimentos das
-- contas de resultado (classes 3, 4 e 5) agregados por conta e mês.
-- Execute no SQL Editor do Supabase (depois do schema.sql principal).
--
-- Segurança (igual ao Fluxo de Caixa):
--   • Qualquer usuário AUTENTICADO pode LER.
--   • Apenas ADMIN pode ESCREVER (subir Razão), via public.is_admin().
--
-- Atualização INCREMENTAL: ao subir um Razão, o módulo substitui apenas os
-- (empresa, ano, mês) contidos no arquivo — subir julho não mexe em jan–jun,
-- e re-subir o mesmo período não duplica. Contas de Balanço (1 e 2) e a conta
-- de Apuração (5.8, encerramento) NÃO entram — o front já as descarta.
-- =====================================================================

create table if not exists public.dre_lancamentos (
  id         bigint generated always as identity primary key,
  empresa    text not null,                 -- razão social (chave da empresa)
  cnpj       text,
  codigo     text not null,                 -- código contábil, ex.: 3.1.10.100.029
  nome       text,                          -- nome da conta
  ano        integer not null,
  mes        integer not null check (mes between 1 and 12),
  debito     numeric(16, 2) not null default 0,
  credito    numeric(16, 2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists dre_lanc_emp_idx on public.dre_lancamentos (empresa, ano, mes);
create index if not exists dre_lanc_cod_idx on public.dre_lancamentos (codigo);

alter table public.dre_lancamentos enable row level security;

drop policy if exists "dre_leitura_autenticado" on public.dre_lancamentos;
create policy "dre_leitura_autenticado"
  on public.dre_lancamentos for select
  to authenticated
  using (true);

drop policy if exists "dre_escrita_admin" on public.dre_lancamentos;
create policy "dre_escrita_admin"
  on public.dre_lancamentos for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Upload incremental de uma empresa: substitui só os (ano, mês) presentes no
-- arquivo, para aquela empresa, e insere os novos. Tudo em uma transação.
create or replace function public.dre_upload(p_empresa text, p_cnpj text, p_rows jsonb)
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

  -- apaga os meses que o arquivo traz (para esta empresa)
  delete from public.dre_lancamentos d
  where d.empresa = p_empresa
    and (d.ano * 100 + d.mes) in (
      select distinct x.ano * 100 + x.mes
      from jsonb_to_recordset(p_rows) as x(ano integer, mes integer)
    );

  insert into public.dre_lancamentos (empresa, cnpj, codigo, nome, ano, mes, debito, credito)
  select p_empresa, p_cnpj, x.codigo, x.nome, x.ano, x.mes, x.debito, x.credito
  from jsonb_to_recordset(p_rows)
    as x(codigo text, nome text, ano integer, mes integer, debito numeric, credito numeric);

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.dre_upload(text, text, jsonb) from public, anon;
grant execute on function public.dre_upload(text, text, jsonb) to authenticated;

-- (opcional) apagar uma empresa inteira — útil se subir errado.
create or replace function public.dre_apagar_empresa(p_empresa text)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare n integer;
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem apagar dados.';
  end if;
  delete from public.dre_lancamentos where empresa = p_empresa;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.dre_apagar_empresa(text) from public, anon;
grant execute on function public.dre_apagar_empresa(text) to authenticated;

-- Pronto. Nenhum dado real fica no repositório — tudo é carregado via upload.
