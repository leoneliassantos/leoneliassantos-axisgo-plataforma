// Edge Function: admin-update-user
// Atualiza dados de OUTRO usuário (nome, e-mail, senha, perfil, bloqueio) —
// SOMENTE se quem chamou for admin. Bloqueio usa ban_duration no Auth, o que
// invalida a sessão do usuário bloqueado de fato.
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
    const caller = createClient(url, anon, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const {
      data: { user },
    } = await caller.auth.getUser()
    if (!user) return json(401, { error: 'Não autenticado.' })

    const { data: perfil } = await caller.from('profiles').select('role').eq('id', user.id).single()
    if (perfil?.role !== 'admin') return json(403, { error: 'Apenas administradores.' })

    const { id, nome, email, senha, role, bloqueado } = await req.json()
    if (!id) return json(400, { error: 'ID do usuário é obrigatório.' })
    if (id === user.id) return json(400, { error: 'Use "Meu Perfil" para editar a própria conta.' })

    const admin = createClient(url, service)

    // 1) Conta de autenticação (e-mail, senha, banimento).
    const authPatch: Record<string, unknown> = {}
    if (email !== undefined) authPatch.email = email
    if (senha) authPatch.password = senha
    if (bloqueado !== undefined) authPatch.ban_duration = bloqueado ? '87600h' : 'none'
    if (Object.keys(authPatch).length) {
      const { error } = await admin.auth.admin.updateUserById(id, authPatch)
      if (error) return json(400, { error: error.message })
    }

    // 2) Perfil (nome, e-mail, perfil, flag de bloqueio para a UI).
    const profilePatch: Record<string, unknown> = {}
    if (nome !== undefined) profilePatch.nome = nome
    if (email !== undefined) profilePatch.email = email
    if (role !== undefined) profilePatch.role = ['admin', 'diretoria', 'operacoes', 'acabamento'].includes(role) ? role : 'acabamento'
    if (bloqueado !== undefined) profilePatch.bloqueado = bloqueado
    if (Object.keys(profilePatch).length) {
      const { error } = await admin.from('profiles').update(profilePatch).eq('id', id)
      if (error) return json(400, { error: error.message })
    }

    return json(200, { ok: true })
  } catch (e) {
    return json(500, { error: String(e) })
  }
})
