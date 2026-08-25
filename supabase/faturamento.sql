-- AxisGo · Módulo Financeiro → Faturamento (base do Publi)
-- Tabela + RLS + função de upload incremental (por mês de emissão). Roda uma vez.
-- Leitura: todo autenticado · Escrita (upload): admin.

create table if not exists public.faturamento (
  id          bigint generated always as identity primary key,
  empresa     text not null,
  cliente     text not null,
  sacado      text,
  origem      text,          -- Unidade de Negócio (Eventos, Promoção, Planejamento, BV...)
  descricao   text,          -- nome do evento
  documento   text,          -- número da NF
  ecs         text,          -- controle interno
  pit         text,          -- controle interno
  emissao     date,
  vencimento  date,
  pagamento   date,          -- nulo = a receber
  valor       numeric(16, 2) not null default 0,  -- VALOR FATURADO
  created_at  timestamptz not null default now()
);

create index if not exists faturamento_emp_idx on public.faturamento (empresa, emissao);
create index if not exists faturamento_doc_idx on public.faturamento (documento);

alter table public.faturamento enable row level security;

drop policy if exists "faturamento_leitura_autenticado" on public.faturamento;
create policy "faturamento_leitura_autenticado"
  on public.faturamento for select
  to authenticated
  using (true);

drop policy if exists "faturamento_escrita_admin" on public.faturamento;
create policy "faturamento_escrita_admin"
  on public.faturamento for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Upload incremental: apaga os meses (de emissão) presentes no arquivo, para a
-- empresa, e reinsere. Reenviar o mesmo mês sobrescreve sem duplicar.
create or replace function public.faturamento_upload(p_empresa text, p_rows jsonb)
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

  delete from public.faturamento f
  where f.empresa = p_empresa
    and to_char(f.emissao, 'YYYY-MM') in (
      select distinct to_char(x.emissao, 'YYYY-MM')
      from jsonb_to_recordset(p_rows) as x(emissao date)
    );

  insert into public.faturamento
    (empresa, cliente, sacado, origem, descricao, documento, ecs, pit, emissao, vencimento, pagamento, valor)
  select p_empresa, x.cliente, x.sacado, x.origem, x.descricao, x.documento, x.ecs, x.pit,
         x.emissao, x.vencimento, x.pagamento, x.valor
  from jsonb_to_recordset(p_rows) as x(
    cliente text, sacado text, origem text, descricao text, documento text, ecs text, pit text,
    emissao date, vencimento date, pagamento date, valor numeric
  );

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.faturamento_upload(text, jsonb) from public, anon;
grant execute on function public.faturamento_upload(text, jsonb) to authenticated;

-- Excluir a base de uma competência inteira (empresa + ano/mês de emissão).
-- Útil quando a base foi subida na empresa errada ou em duplicidade.
create or replace function public.faturamento_apagar_competencia(p_empresa text, p_ano int, p_mes int)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  n integer;
  ym text := p_ano::text || '-' || lpad(p_mes::text, 2, '0');
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem apagar dados.';
  end if;

  delete from public.faturamento f
  where f.empresa = p_empresa
    and to_char(f.emissao, 'YYYY-MM') = ym;

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.faturamento_apagar_competencia(text, int, int) from public, anon;
grant execute on function public.faturamento_apagar_competencia(text, int, int) to authenticated;

-- Excluir uma nota específica pelo id (lançamento incorreto pontual).
create or replace function public.faturamento_apagar_nota(p_id bigint)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  n integer;
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem apagar dados.';
  end if;

  delete from public.faturamento f where f.id = p_id;

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.faturamento_apagar_nota(bigint) from public, anon;
grant execute on function public.faturamento_apagar_nota(bigint) to authenticated;
