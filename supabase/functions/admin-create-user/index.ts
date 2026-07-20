// Edge Function: admin-create-user
// Cria um novo usuário (e-mail + senha) — SOMENTE se quem chamou for admin.
// A service_role fica no servidor (Deno.env), nunca no front-end.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

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
      user_metadata: { nome, role: role === 'admin' ? 'admin' : 'user' },
    })
    if (error) return json(400, { error: error.message })

    return json(200, { ok: true })
  } catch (e) {
    return json(500, { error: String(e) })
  }
})

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
