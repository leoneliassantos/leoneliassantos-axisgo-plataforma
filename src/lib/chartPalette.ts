// Paleta de cores dos GRÁFICOS financeiros, parametrizável por cliente via env.
//
// Por padrão (sem env setada) cada tela usa exatamente as cores que já tinha
// antes deste módulo existir — zero mudança visual para quem não configurar
// nada. Um cliente pode sobrescrever via Vercel/`.env`:
//
//   VITE_CHART_PALETTE="5a6be0,16b8a6,22a7c4,7a6cf0,d65b98,e7a13a,e5484d"
//   VITE_CHART_POSITIVO="#16b8a6"
//   VITE_CHART_NEGATIVO="#e5484d"
//   VITE_CHART_KPI_GRADIENT="linear-gradient(180deg,#3a3f4a,#0c0d0f)"

function normalizaHex(cor: string): string {
  const c = cor.trim()
  return c.startsWith('#') ? c : `#${c}`
}

/** Paleta categórica (N cores) usada em barras/donut/KPIs. Cai no `fallback` se a env não estiver setada. */
export function resolvePalette(fallback: string[]): string[] {
  const raw = (import.meta.env.VITE_CHART_PALETTE as string | undefined)?.trim()
  if (!raw) return fallback
  const cores = raw.split(',').map(normalizaHex).filter(Boolean)
  return cores.length ? cores : fallback
}

/** Cor única nomeada (ex.: receita/saldo positivo). Cai no `fallback` se a env não estiver setada. */
export function resolveColor(envVar: 'VITE_CHART_POSITIVO' | 'VITE_CHART_NEGATIVO', fallback: string): string {
  const raw = (import.meta.env[envVar] as string | undefined)?.trim()
  return raw ? normalizaHex(raw) : fallback
}

/** Gradiente CSS decorativo (barra lateral dos cards de KPI). Cai no `fallback` se a env não estiver setada. */
export function resolveKpiGradient(fallback: string): string {
  const raw = (import.meta.env.VITE_CHART_KPI_GRADIENT as string | undefined)?.trim()
  return raw || fallback
}
