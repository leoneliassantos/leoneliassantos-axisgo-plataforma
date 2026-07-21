import { CLIENT } from '../config/client'

/** Converte "#E9622E" em canais "233 98 46" (para uso com rgb(var(--brand) / alpha)). */
function hexToChannels(hex: string): string | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`
}

/**
 * Aplica a cor de destaque do cliente (white-label) definindo a CSS var --brand.
 * Sem VITE_CLIENT_BRAND, mantém o padrão azul da AxisGo (definido no index.css).
 */
export function applyClientTheme() {
  if (!CLIENT.brand) return
  const canais = hexToChannels(CLIENT.brand)
  if (canais) document.documentElement.style.setProperty('--brand', canais)
}
