/**
 * Identidade do cliente desta instância (white-label do ambiente interno).
 *
 * O LOGIN é sempre AxisGo. Já o AMBIENTE INTERNO (logado) usa a marca do CLIENTE:
 * logo e cor de destaque, definidos por variáveis de ambiente na publicação.
 *
 *   VITE_CLIENT_NAME  = "Batux"
 *   VITE_CLIENT_LOGO  = "/clients/batux.webp"  (caminho ou URL do logo do cliente)
 *   VITE_CLIENT_BRAND = "#E9622E"              (cor de destaque do cliente, HEX)
 */
export const CLIENT = {
  nome: (import.meta.env.VITE_CLIENT_NAME as string | undefined)?.trim() || 'Cliente',
  logo: (import.meta.env.VITE_CLIENT_LOGO as string | undefined)?.trim() || '',
  brand: (import.meta.env.VITE_CLIENT_BRAND as string | undefined)?.trim() || '',
}
