-- =====================================================================
-- AxisGo · Módulo Financeiro → DRE · AJUSTES GERENCIAIS (reclassificação
-- de VALORES, de-para) — lançados MANUALMENTE, sem tocar na base contábil.
-- Move parte do valor de uma CONTA de origem para outro GRUPO/SUBGRUPO do
-- DRE, por EMPRESA + ano + mês. Ex.: separar, dentro de "Serviços PJ", o
-- que é salário PJ (Custo) do que é overhead, e mandar o aluguel para
-- Despesas Operacionais.
--
-- No DRE cada ajuste entra como duas linhas sintéticas: uma CONTRA que
-- reduz a conta de origem na sua classificação original e um LANÇAMENTO no
-- destino escolhido. A base oficial (dre_lancamentos) permanece intacta —
-- estes registros são só o "de-para" gerencial, auditável e reversível.
-- Componente reutilizável do Core (serve a qualquer cliente).
-- Execute no SQL Editor do Supabase (depois de dre.sql).
--
-- Segurança (igual ao resto do DRE):
--   • Qualquer usuário AUTENTICADO pode LER.
--   • Apenas ADMIN pode ESCREVER, via public.is_admin().
-- =====================================================================

create table if not exists public.dre_reclass (
  id          bigint generated always as identity primary key,
  empresa     text not null,                 -- empresa onde vale o ajuste
  ano         integer not null,
  mes         integer not null check (mes between 1 and 12),
  origem      text not null,                 -- código da conta de origem
  origem_nome text not null default '',      -- nome da conta de origem
  grupo       text not null,                 -- destino: grupo (nível 1)
  subgrupo    text not null default '',      -- destino: subgrupo (nível 2)
  valor       numeric(16, 2) not null default 0,
  updated_at  timestamptz not null default now()
);

create index if not exists dre_reclass_emp_ano_idx on public.dre_reclass (empresa, ano);

alter table public.dre_reclass enable row level security;

drop policy if exists "reclass_leitura_autenticado" on public.dre_reclass;
create policy "reclass_leitura_autenticado"
  on public.dre_reclass for select to authenticated using (true);

drop policy if exists "reclass_escrita_admin" on public.dre_reclass;
create policy "reclass_escrita_admin"
  on public.dre_reclass for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Substitui de forma atômica todos os ajustes de uma (empresa, ano): apaga
-- os antigos daquela empresa+ano e insere os do payload. O ambiente monta a
-- grade (de-para × meses) e salva tudo de uma vez.
-- p_rows = [{ "origem": "5.1.11.500", "origem_nome": "...", "grupo": "...",
--             "subgrupo": "...", "mes": 1, "valor": 1234.56 }, ...]
create or replace function public.dre_reclass_replace(p_empresa text, p_ano integer, p_rows jsonb)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  n integer;
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem lançar ajustes gerenciais.';
  end if;

  delete from public.dre_reclass where empresa = p_empresa and ano = p_ano;

  insert into public.dre_reclass (empresa, ano, mes, origem, origem_nome, grupo, subgrupo, valor)
  select p_empresa,
         p_ano,
         (r->>'mes')::int,
         trim(coalesce(r->>'origem', '')),
         trim(coalesce(r->>'origem_nome', '')),
         trim(coalesce(r->>'grupo', '')),
         trim(coalesce(r->>'subgrupo', '')),
         coalesce((r->>'valor')::numeric, 0)
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as r
  where trim(coalesce(r->>'origem', '')) <> ''
    and trim(coalesce(r->>'grupo', '')) <> ''
    and (r->>'mes')::int between 1 and 12
    and coalesce((r->>'valor')::numeric, 0) <> 0;

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.dre_reclass_replace(text, integer, jsonb) from public, anon;
grant execute on function public.dre_reclass_replace(text, integer, jsonb) to authenticated;

-- Pronto. Nenhum dado real fica no repositório — os ajustes são lançados na tela.
