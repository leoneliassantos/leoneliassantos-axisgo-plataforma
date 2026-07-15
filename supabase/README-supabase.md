# Ativando o Supabase (modo produção)

A plataforma roda em **modo demo** (dados no navegador) enquanto o `.env` estiver vazio.
Para persistir dados em produção, siga os passos abaixo.

## 1. Criar o projeto
1. Acesse https://supabase.com e crie um projeto (plano free serve para começar).
2. Em **Project Settings → API**, copie a **Project URL** e a **anon public key**.

## 2. Conectar o front-end
No arquivo `.env` da raiz do projeto:

```
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sua-anon-key
```

Reinicie o `npm run dev`. A plataforma passa a autenticar via Supabase.

## 3. Criar o esquema
No **SQL Editor** do Supabase, cole e rode o conteúdo de [`schema.sql`](./schema.sql).
Isso cria a tabela `profiles`, o trigger de novo usuário, a função `is_admin()` e as políticas RLS.

## 4. Criar o primeiro admin
Em **Authentication → Users → Add user**, crie seu usuário. Depois, no SQL Editor:

```sql
update public.profiles set role = 'admin' where email = 'voce@empresa.com.br';
```

## 5. Criação de usuários pelo admin (Edge Function)
Criar um usuário com e-mail/senha para outra pessoa exige a **service_role key** (nunca
exponha essa chave no front-end). O front-end chama uma Edge Function chamada
`admin-create-user`. Passo a passo para criá-la (Supabase CLI) fica registrado quando
avançarmos para produção — por ora, no modo demo, a criação de usuários já funciona
localmente.
