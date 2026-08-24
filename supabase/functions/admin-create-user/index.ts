// Edge Function: admin-create-user
// Cria um novo usuário (e-mail + senha) — SOMENTE se quem chamou for admin.
// A service_role fica no servidor (Deno.env), nunca no front-end.
import { createClient } from 'jsr:@supabase/supabase-js@2'

// CORS restrito: só a plataforma (produção + previews da Vercel deste projeto).
// Qualquer outra origem recebe Allow-Origin vazio e o navegador bloqueia.
function isAllowedOrigin(origin: string): boolean {
  // Cada instância da plataforma AxisGo (Batux, MC, MM, Fukuda…) roda no seu
  // próprio domínio *.vercel.app. A segurança real é o JWT + checagem de admin
  // abaixo (a service_role nunca sai do servidor); o CORS é só reforço.
  if (/^http:\/\/localhost(:\d+)?$/.test(origin)) return true
  return /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)
}
function corsHeaders(req: Request) {
  const origin = req.headers.get('Origin') ?? ''
  return {
    'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin : '',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  const url = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  try {
    // 1) Verifica se o chamador é admin (usando o token do próprio usuário).
    const caller = createClient(url, anon, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const {
      data: { user },
    } = await caller.auth.getUser()
    if (!user) return json(401, { error: 'Não autenticado.' })

    const { data: perfil } = await caller.from('profiles').select('role').eq('id', user.id).single()
    if (perfil?.role !== 'admin') return json(403, { error: 'Apenas administradores.' })

    // 2) Cria o usuário com a service_role.
    const { nome, email, senha, role } = await req.json()
    const admin = createClient(url, service)
    const { error } = await admin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: { nome, role: ['admin', 'diretoria', 'operacoes', 'acabamento'].includes(role) ? role : 'acabamento' },
    })
    if (error) return json(400, { error: error.message })

    return json(200, { ok: true })
  } catch (e) {
    return json(500, { error: String(e) })
  }
})
