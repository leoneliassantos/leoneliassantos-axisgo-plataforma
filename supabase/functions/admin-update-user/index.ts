// Edge Function: admin-update-user
// Atualiza dados de OUTRO usuário (nome, e-mail, senha, perfil, bloqueio) —
// SOMENTE se quem chamou for admin. Bloqueio usa ban_duration no Auth, o que
// invalida a sessão do usuário bloqueado de fato.
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
    if (role !== undefined) profilePatch.role = role === 'admin' ? 'admin' : 'user'
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

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
