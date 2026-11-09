export const CREW_DOCUMENT_TYPES = ['CHT', 'CMA', 'RG', 'CNH', 'Passaporte', 'Visto', 'Certificado de treinamento', 'Vacinação', 'Outro'] as const;
export type CrewDocumentType = typeof CREW_DOCUMENT_TYPES[number];
/** Local text headers only. A filename, acronym in prose or a nested CHT section
 * is not evidence of a separate document. No holder/number/date extraction. */
export function crewDocumentType(text: string): { type: CrewDocumentType | null; ambiguous: boolean } {
  if (typeof text !== 'string' || text.length > 500000) return { type: null, ambiguous: false };
  const lines = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().split(/[\r\n\f]+/).map(line => line.trim());
  const headers: Array<[CrewDocumentType, RegExp]> = [
    ['CHT', /^(?:CERTIFICADO DE HABILITACAO TECNICA(?:\s*[-–—/]\s*CHT)?|CHT)$/],
    ['CMA', /^CERTIFICADO MEDICO AERONAUTICO(?:\s*[-–—/]\s*(?:CMA|MEDICAL CERTIFICATE))?$/],
    ['CNH', /^CARTEIRA NACIONAL DE HABILITACAO(?:\s*[-–—/]\s*CNH)?$/],
    ['RG', /^(?:CARTEIRA DE IDENTIDADE|CARTEIRA DE IDENTIDADE NACIONAL|REGISTRO GERAL)(?:\s*[-–—/]\s*(?:RG|CIN))?$/],
    ['Passaporte', /^(?:PASSAPORTE|PASSPORT|PASSAPORTE\s*[/|]\s*PASSPORT)$/],
  ];
  const matches = headers.filter(([, pattern]) => lines.some(line => pattern.test(line))).map(([type]) => type);
  return { type: matches.length === 1 ? matches[0] : null, ambiguous: matches.length > 1 };
}
