-- =====================================================================
-- AxisGo · Plataforma BTO — Esquema inicial (Supabase / Postgres)
-- Execute no SQL Editor do Supabase para ativar auth com perfis + RLS.
-- =====================================================================

-- 1) Tabela de perfis (1:1 com auth.users), guardando nome e papel (role)
create table if not exists public.profiles (
  id         uuid primary key references auth.users on delete cascade,
  email      text,
  nome       text,
  role       text not null default 'acabamento' check (role in ('admin', 'diretoria', 'operacoes', 'acabamento', 'user')),
  bloqueado  boolean not null default false,
  created_at timestamptz not null default now()
);

-- Para bases já existentes:
alter table public.profiles add column if not exists bloqueado boolean not null default false;

alter table public.profiles enable row level security;

-- 2) Trigger: ao criar um usuário no auth, cria o perfil correspondente.
--    O papel vem de user_metadata.role (default 'user').
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, nome, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'nome', new.email),
    coalesce(new.raw_user_meta_data ->> 'role', 'user')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3) Função auxiliar: o usuário atual é admin?
create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- 4) Políticas RLS
--    - Todo usuário autenticado lê o próprio perfil; admin lê todos.
drop policy if exists "perfil_leitura_proprio" on public.profiles;
create policy "perfil_leitura_proprio"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin());

--    - Cada usuário atualiza o próprio nome; admin atualiza qualquer um.
--      SEGURANÇA: sem restringir colunas + sem WITH CHECK, um usuário comum
--      conseguiria fazer `update profiles set role='admin'` no próprio id e se
--      auto-promover. Fechamos em DUAS camadas:
--      (1) privilégio por coluna: authenticated só altera `nome`;
--      (2) RLS with check: a nova linha de um não-admin não pode virar admin
--          nem se desbloquear. Alterar role/bloqueado é exclusivo do servidor
--          (service_role, via Edge Function admin-update-user).
revoke update on public.profiles from authenticated;
grant  update (nome) on public.profiles to authenticated;

drop policy if exists "perfil_update" on public.profiles;
create policy "perfil_update"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id or public.is_admin())
  with check (
    public.is_admin()
    or (auth.uid() = id and role <> 'admin' and bloqueado = false)
  );

-- Observação: a CRIAÇÃO de usuários por um admin (definindo e-mail/senha de
-- outra pessoa) deve ser feita por uma Edge Function usando a service_role key,
-- pois a criação com senha exige privilégio de administrador do Auth.
-- A função esperada pelo front-end chama-se `admin-create-user`.
-- Ver supabase/README-supabase.md.

-- ==================================================================
-- 5) Notificações (menções em observações) + usuários mencionáveis
-- ==================================================================
create table if not exists public.notificacoes (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users on delete cascade,
  de_nome        text,
  mensagem       text not null,
  contexto       text,
  ref_op_id      uuid,
  ref_produto_id uuid,
  lida           boolean not null default false,
  created_at     timestamptz not null default now()
);
alter table public.notificacoes enable row level security;

-- Destinatário lê e marca como lida; qualquer autenticado pode criar (mencionar).
drop policy if exists "notif_select" on public.notificacoes;
create policy "notif_select" on public.notificacoes for select to authenticated using (user_id = auth.uid());
drop policy if exists "notif_insert" on public.notificacoes;
create policy "notif_insert" on public.notificacoes for insert to authenticated with check (true);
drop policy if exists "notif_update" on public.notificacoes;
create policy "notif_update" on public.notificacoes for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create index if not exists notificacoes_user_idx on public.notificacoes (user_id, lida, created_at desc);

-- Lista de usuários mencionáveis (só id + nome; não expõe e-mail/perfil).
-- View owner (postgres) → ignora a RLS de profiles; qualquer autenticado lê.
create or replace view public.usuarios_mencionaveis as
  select id, nome from public.profiles where coalesce(bloqueado, false) = false;
grant select on public.usuarios_mencionaveis to authenticated;
