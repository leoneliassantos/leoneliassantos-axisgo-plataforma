/**
 * Consulta de CNPJ via BrasilAPI (gratuita, sem chave, com CORS liberado para
 * uso no navegador). Preenche automaticamente os dados cadastrais oficiais da
 * empresa a partir do CNPJ digitado.
 *
 * Endpoint: https://brasilapi.com.br/api/cnpj/v1/{cnpj}
 */

export interface CnpjDados {
  cnpj: string // só dígitos
  razaoSocial: string
  nomeFantasia: string
  situacao: string
  abertura: string // data de início de atividade (dd/mm/aaaa)
  naturezaJuridica: string
  cnae: string // descrição da atividade principal
  endereco: string
  municipio: string
  uf: string
  cep: string
  telefone: string
  email: string
}

/** Remove tudo que não é dígito. */
export function soDigitos(s: string): string {
  return (s || '').replace(/\D/g, '')
}

/** Aplica a máscara 00.000.000/0000-00 conforme o usuário digita. */
export function mascaraCnpj(s: string): string {
  const d = soDigitos(s).slice(0, 14)
  let out = d
  if (d.length > 2) out = `${d.slice(0, 2)}.${d.slice(2)}`
  if (d.length > 5) out = `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
  if (d.length > 8) out = `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`
  if (d.length > 12) out = `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
  return out
}

/** 'aaaa-mm-dd' → 'dd/mm/aaaa'. */
function dataBR(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return d && m && y ? `${d}/${m}/${y}` : iso
}

/** Monta o endereço legível a partir dos campos da BrasilAPI. */
function montaEndereco(j: Record<string, unknown>): string {
  const partes = [
    [j.logradouro, j.numero].filter(Boolean).join(', '),
    j.complemento,
    j.bairro,
  ]
    .filter((p) => p && String(p).trim())
    .map((p) => String(p).trim())
  return partes.join(' · ')
}

/**
 * Busca os dados do CNPJ. Lança Error com mensagem amigável em caso de CNPJ
 * inválido, não encontrado ou falha de rede.
 */
export async function buscarCnpj(cnpj: string): Promise<CnpjDados> {
  const d = soDigitos(cnpj)
  if (d.length !== 14) throw new Error('Digite os 14 dígitos do CNPJ.')

  let resp: Response
  try {
    resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${d}`)
  } catch {
    throw new Error('Sem conexão para consultar o CNPJ. Tente novamente.')
  }
  if (resp.status === 404) throw new Error('CNPJ não encontrado na base da Receita.')
  if (!resp.ok) throw new Error('Não foi possível consultar o CNPJ agora. Tente novamente.')

  const j = (await resp.json()) as Record<string, unknown>
  const tel = String(j.ddd_telefone_1 ?? j.ddd_telefone_2 ?? '').trim()
  return {
    cnpj: d,
    razaoSocial: String(j.razao_social ?? '').trim(),
    nomeFantasia: String(j.nome_fantasia ?? '').trim(),
    situacao: String(j.descricao_situacao_cadastral ?? '').trim(),
    abertura: dataBR(String(j.data_inicio_atividade ?? '')),
    naturezaJuridica: String(j.natureza_juridica ?? '').trim(),
    cnae: String(j.cnae_fiscal_descricao ?? '').trim(),
    endereco: montaEndereco(j),
    municipio: String(j.municipio ?? '').trim(),
    uf: String(j.uf ?? '').trim(),
    cep: String(j.cep ?? '').trim(),
    telefone: tel,
    email: String(j.email ?? '').trim().toLowerCase(),
  }
}
