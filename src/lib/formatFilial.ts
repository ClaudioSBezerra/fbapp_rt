/**
 * Formata CNPJ com máscara completa
 * Entrada: "10230480000189" → Saída: "10.230.480/0001-89"
 */
export function formatCNPJMasked(cnpj: string | null | undefined): string {
  const cleaned = cnpj?.replace(/\D/g, '') || '';
  if (cleaned.length !== 14) return cnpj || '';
  return cleaned.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

/**
 * Formata o display de uma filial com COD_EST e CNPJ
 * Formato: FC010102 - 10230480001889
 */
export function formatFilialDisplay(codEst: string | null | undefined, cnpj: string): string {
  const cleanedCnpj = cnpj?.replace(/\D/g, '') || '';
  
  if (codEst && codEst.trim()) {
    return `${codEst} - ${cleanedCnpj}`;
  }
  
  // Fallback: só o CNPJ limpo
  return cleanedCnpj;
}

/**
 * Formata o display de uma filial com COD_EST e CNPJ formatado
 * Formato: FC010102 - 10.230.480/0001-89
 */
export function formatFilialDisplayFormatted(codEst: string | null | undefined, cnpj: string): string {
  const cleanedCnpj = cnpj?.replace(/\D/g, '') || '';
  const formattedCnpj = cleanedCnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  
  if (codEst && codEst.trim()) {
    return `${codEst} - ${formattedCnpj}`;
  }
  
  return formattedCnpj;
}

/**
 * Extrai o COD_EST e CNPJ de um nome de filial que pode conter ambos
 */
export function parseFilialName(filialNome: string): { codEst: string | null; cnpj: string | null } {
  // Verifica se o nome está no formato "COD_EST - CNPJ"
  const match = filialNome.match(/^([A-Z0-9]+)\s*-\s*(\d{14})$/);
  if (match) {
    return { codEst: match[1], cnpj: match[2] };
  }
  
  // Extrai CNPJ do nome se presente
  const cnpjMatch = filialNome.match(/(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/);
  if (cnpjMatch) {
    return { codEst: null, cnpj: cnpjMatch[1].replace(/\D/g, '') };
  }
  
  return { codEst: null, cnpj: null };
}
