/**
 * Identidade do cliente desta instância.
 *
 * O PRODUTO/consultoria é sempre "AxisGo". O CLIENTE muda a cada instância e
 * vem da variável de ambiente VITE_CLIENT_NAME (definida na publicação/Vercel).
 * Ex.: VITE_CLIENT_NAME="MC Distribuidora".
 */
export const CLIENT = {
  nome: (import.meta.env.VITE_CLIENT_NAME as string | undefined)?.trim() || 'Cliente',
}
