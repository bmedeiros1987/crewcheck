export type PdfDestination = 'roster' | 'wallet' | 'choose';
export type PdfDetection = { destination: PdfDestination; documentType?: 'CHT' | 'CMA' | 'Outro' };
export const MAX_INTAKE_BYTES = 35 * 1024 * 1024;

// Routing only: never derive roster events, validity dates or official verification.
// Filenames and MIME types are deliberately not classification evidence.
export function detectPdfDestination(text: string): PdfDetection {
  const content = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ');
  const roster = /\b(CREW\s*ROSTER\s*(REPORT)?|ROSTER REPORT)\b/.test(content)
    || (/\b(AIMS|CREWTOPIA)\b/.test(content) && /\b(ESCALA|ROSTER)\b/.test(content)
      && /\b(PERIODO|PERIOD|PUBLICADO|PUBLISHED|APRESENTACAO|REPORT|VOO|FLIGHT)\b/.test(content));
  const authority = /\bANAC\b|AGENCIA NACIONAL DE AVIACAO CIVIL/.test(content);
  const cht = /CERTIFICADO DE HABILITACAO TECNICA|CARTEIRA DE HABILITACAO TECNICA/.test(content)
    || (/\bCHT\b/.test(content) && /\b(HABILITACOES|HABILITACAO|LICENCAS|LICENCA)\b/.test(content));
  const cma = /CERTIFICADO MEDICO AERONAUTICO/.test(content)
    || (/\bCMA\b/.test(content) && /\b(VALIDADE|CLASSE|APTO)\b/.test(content));
  const wallet = authority && (cht || cma || /\b(LICENCA|CERTIFICADO|HABILITACAO)\b/.test(content));
  if (roster && wallet) return { destination: 'choose' };
  if (roster) return { destination: 'roster' };
  if (wallet) return { destination: 'wallet', documentType: cht && !cma ? 'CHT' : cma && !cht ? 'CMA' : 'Outro' };
  return { destination: 'choose' };
}

export function decodeSharedPdf(payload: { dataBase64?: unknown; filename?: unknown; sourceFileName?: unknown }): File {
  const base64 = String(payload?.dataBase64 || '').trim();
  if (!base64 || base64.length > Math.ceil(MAX_INTAKE_BYTES / 3) * 4) throw new Error('PDF vazio ou maior que 35 MB.');
  const binary = atob(base64);
  if (binary.length > MAX_INTAKE_BYTES || !binary.startsWith('%PDF-')) throw new Error('O arquivo recebido não é um PDF válido.');
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const name = String(payload.filename || payload.sourceFileName || 'Documento.pdf').split(/[\\/]/).pop()!.slice(0, 180);
  return new File([bytes], name.toLowerCase().endsWith('.pdf') ? name : `${name}.pdf`, { type: 'application/pdf' });
}

// Serialize decisions so a second share cannot replace an open preview/form.
export class PdfIntakeQueue {
  private claims = new Set<string>();
  private tail: Promise<void> = Promise.resolve();

  enqueue(id: string, consume: () => Promise<void>): Promise<void> {
    if (this.claims.has(id)) return this.tail;
    this.claims.add(id);
    const run = this.tail.then(consume).catch((error) => {
      this.claims.delete(id);
      throw error;
    });
    this.tail = run.catch(() => {});
    return run;
  }
}
