# AxisGo · Plataforma BTO

Ambiente centralizado (data lake) da consultoria AxisGo. Login por usuário/senha, perfis
de acesso (admin/usuário) e um hub de frentes — **Comercial**, **Operações** e **Financeiro** —
cada uma com seus módulos.

## Stack
- **React + Vite + TypeScript + Tailwind CSS** (front-end)
- **Supabase** — Postgres + Auth + RLS + Storage (back-end / persistência)

## Rodando localmente
```bash
npm install
npm run dev
```
Abre em `http://localhost:5173`.

### Modo demo x produção
- Sem `.env` configurado → **modo demo**: login e dados simulados no navegador (localStorage).
  - `admin@axisgo.com.br` / `admin123` (admin)
  - `user@axisgo.com.br` / `user123` (usuário)
- Com `.env` preenchido → **modo produção**: autenticação e dados no Supabase.
  Ver [`supabase/README-supabase.md`](./supabase/README-supabase.md).

## Estrutura (Fase 1)
```
src/
  auth/           Contexto de autenticação (Supabase + fallback demo) e tipos
  components/     AppLayout, ProtectedRoute, EmConstrucao
  lib/            Cliente Supabase
  pages/
    Login.tsx     Tela de login
    Hub.tsx       Cards das frentes
    financeiro/   DRE (pronto), Rentabilidade, Indicadores
    comercial/    Placeholder
    operacoes/    Placeholder
    admin/        Usuários (somente admin)
public/modulos/   DRE Contábil 2026 (dre-2026.html) — embutido via iframe
supabase/         schema.sql + guia de ativação
```

## Perfis (RLS)
- **admin** — acesso total + cadastro de novos usuários.
- **user** — acesso total, **exceto** cadastro de usuários.

Restrições de acesso mais finas serão definidas nas próximas fases.

## Roadmap
- [x] Fase 1 — Login, perfis, hub e módulo Financeiro (DRE)
- [ ] Ligar Supabase (persistência em produção) + Edge Function de criação de usuários
- [ ] Importação de bases via Excel (data lake)
- [ ] Módulos: Rentabilidade de Projetos, Indicadores, Comercial, Operações
