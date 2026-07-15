-- =====================================================================
-- AxisGo · Plataforma BTO — Esquema inicial (Supabase / Postgres)
-- Execute no SQL Editor do Supabase para ativar auth com perfis + RLS.
-- =====================================================================

-- 1) Tabela de perfis (1:1 com auth.users), guardando nome e papel (role)
create table if not exists public.profiles (
  id         uuid primary key references auth.users on delete cascade,
  email      text,
  nome       text,
  role       text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamptz not null default now()
);

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
drop policy if exists "perfil_update" on public.profiles;
create policy "perfil_update"
  on public.profiles for update
  using (auth.uid() = id or public.is_admin());

-- Observação: a CRIAÇÃO de usuários por um admin (definindo e-mail/senha de
-- outra pessoa) deve ser feita por uma Edge Function usando a service_role key,
-- pois a criação com senha exige privilégio de administrador do Auth.
-- A função esperada pelo front-end chama-se `admin-create-user`.
-- Ver supabase/README-supabase.md.
