# Ativando o Supabase (modo produção)

A plataforma roda em **modo demo** (dados no navegador) enquanto o `.env` estiver vazio.
Seguindo os passos abaixo, ela passa a autenticar e persistir tudo no Supabase, com segurança real
(senhas com hash, RLS no banco, bloqueio no Auth).

> Legenda: 🧑 = você (no painel do Supabase) · 🤖 = eu (no código).

## 1. 🧑 Criar o projeto
1. Acesse https://supabase.com → **New project** (plano free serve para começar).
2. Defina um nome e uma senha de banco (guarde-a).
3. Em **Project Settings → API**, copie:
   - **Project URL** (ex.: `https://abcd.supabase.co`)
   - **anon public key**
4. Me envie esses dois valores — a `anon key` é pública por design (vai no front-end), sem risco.

## 2. 🤖 Conectar o front-end
Eu preencho o `.env`:
```
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sua-anon-key
```
e reinicio o servidor. A plataforma detecta e sai do modo demo automaticamente.

## 3. 🧑 Criar o esquema do banco
No **SQL Editor** do Supabase, cole e rode o conteúdo de [`schema.sql`](./schema.sql).
Isso cria a tabela `profiles` (com `role` e `bloqueado`), o trigger de novo usuário,
a função `is_admin()` e as políticas RLS.

## 4. 🧑 Criar o primeiro admin
1. **Authentication → Users → Add user** → crie seu usuário (e-mail + senha).
2. No **SQL Editor**, promova-o a admin:
   ```sql
   update public.profiles set role = 'admin' where email = 'voce@empresa.com.br';
   ```

## 5. 🧑 Publicar as Edge Functions (criação/edição de usuários pelo admin)
Criar/alterar a conta de outra pessoa exige a `service_role` (secreta) — por isso fica em
funções no servidor, nunca no front. Duas funções já estão prontas em
[`functions/`](./functions):

- `admin-create-user` — admin cria novo usuário
- `admin-update-user` — admin edita/bloqueia outro usuário

**Como publicar pelo painel (sem CLI):** Supabase → **Edge Functions → Deploy a new function**,
crie com o mesmo nome e cole o conteúdo de cada `index.ts`. As variáveis `SUPABASE_URL`,
`SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` já são injetadas automaticamente pelo Supabase —
você não precisa configurar segredo nenhum.

> Enquanto as funções não estiverem publicadas: login, autoedição (Meu Perfil), troca de perfil e
> flag de bloqueio já funcionam. A criação de novos usuários e a edição de e-mail/senha de terceiros
> pelo admin só passam a funcionar após o passo 5.

## Pronto
Com os 5 passos, a plataforma está em produção: dados persistem, senhas ficam com hash no Auth,
o acesso é regido por RLS e usuários bloqueados não conseguem entrar.
