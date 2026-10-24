import type { PayrollPage } from './privatePayrollExtraction';
export interface FinancialPdfTextItem { str?: string; transform?: readonly number[] }
export interface FinancialPdfTextDocument {
  numPages: number;
  getPage(page: number): Promise<{ getTextContent(): Promise<{ items: readonly FinancialPdfTextItem[] }> }>;
}
/** Reconstruct only horizontal PDF baselines with measured geometry; no space-based row guessing. */
export function financialPdfPageLines(items: readonly FinancialPdfTextItem[]): string {
  const rows: Array<{ y: number; items: Array<{ x: number; text: string }> }> = [];
  for (const item of items) {
    if (!item.str?.trim()) continue;
    const transform = item.transform;
    if (!transform || !transform.slice(0, 6).every(Number.isFinite) || transform.length < 6 || Math.abs(transform[1]) > 0.01 || Math.abs(transform[2]) > 0.01) {
      throw new Error('Texto PDF sem geometria horizontal suficiente; revisão da extração necessária.');
    }
    const x = transform[4], y = transform[5];
    let row = rows.find(candidate => Math.abs(candidate.y - y) <= 1);
    if (!row) { row = { y, items: [] }; rows.push(row); }
    row.items.push({ x, text: item.str });
  }
  return rows.sort((a, b) => b.y - a.y).map(row => row.items.sort((a, b) => a.x - b.x).map(item => item.text).join(' ')).join('\n');
}
export async function extractFinancialPdfPages(pdf: FinancialPdfTextDocument): Promise<PayrollPage[]> {
  const pages: PayrollPage[] = [];
  for (let page = 1; page <= pdf.numPages; page++) {
    const content = await (await pdf.getPage(page)).getTextContent();
    pages.push({ page, origin: 'pdf-physical', text: financialPdfPageLines(content.items) });
  }
  return pages;
}
export const financialPdfPagesText = (pages: readonly PayrollPage[]) => pages.map(page => page.text).join('\f');
