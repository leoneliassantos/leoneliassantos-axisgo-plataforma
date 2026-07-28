-- =====================================================================
-- AxisGo · Módulo Financeiro → DRE · DDL (Distribuição Desproporcional de
-- Lucros) — antecipação de lucros dos sócios, lançada MANUALMENTE.
-- Guarda, por EMPRESA + SÓCIO + ano + mês, o valor que o sócio retirou.
-- No DRE, o total entra como uma única linha "DDL" dentro do subgrupo
-- Pessoal e Encargos (Despesas Operacionais); o detalhamento por sócio
-- fica no ambiente analítico (botão "DDL / Antecipação de sócios").
-- Componente reutilizável do Core (serve a qualquer cliente).
-- Execute no SQL Editor do Supabase (depois de dre.sql).
--
-- Segurança (igual ao resto do DRE):
--   • Qualquer usuário AUTENTICADO pode LER.
--   • Apenas ADMIN pode ESCREVER, via public.is_admin().
-- =====================================================================

create table if not exists public.dre_ddl (
  id         bigint generated always as identity primary key,
  empresa    text not null,                 -- empresa de onde o sócio retirou
  socio      text not null,                 -- nome do sócio
  ano        integer not null,
  mes        integer not null check (mes between 1 and 12),
  valor      numeric(16, 2) not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists dre_ddl_emp_ano_idx on public.dre_ddl (empresa, ano);

alter table public.dre_ddl enable row level security;

drop policy if exists "ddl_leitura_autenticado" on public.dre_ddl;
create policy "ddl_leitura_autenticado"
  on public.dre_ddl for select to authenticated using (true);

drop policy if exists "ddl_escrita_admin" on public.dre_ddl;
create policy "ddl_escrita_admin"
  on public.dre_ddl for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Substitui de forma atômica todos os lançamentos de uma (empresa, ano):
-- apaga os antigos daquela empresa+ano e insere os do payload. O ambiente
-- analítico monta a grade sócio × mês e salva a grade inteira de uma vez.
-- p_rows = [{ "socio": "...", "mes": 1, "valor": 1234.56 }, ...]
create or replace function public.dre_ddl_replace(p_empresa text, p_ano integer, p_rows jsonb)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  n integer;
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem lançar DDL.';
  end if;

  delete from public.dre_ddl where empresa = p_empresa and ano = p_ano;

  insert into public.dre_ddl (empresa, socio, ano, mes, valor)
  select p_empresa,
         trim(coalesce(r->>'socio', '')),
         p_ano,
         (r->>'mes')::int,
         coalesce((r->>'valor')::numeric, 0)
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as r
  where trim(coalesce(r->>'socio', '')) <> ''
    and (r->>'mes')::int between 1 and 12
    and coalesce((r->>'valor')::numeric, 0) <> 0;

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.dre_ddl_replace(text, integer, jsonb) from public, anon;
grant execute on function public.dre_ddl_replace(text, integer, jsonb) to authenticated;

-- Pronto. Nenhum dado real fica no repositório — o DDL é lançado na tela.
