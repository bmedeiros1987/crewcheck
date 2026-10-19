/** Local, pure extraction. Candidates are evidence for review, never recurring settings. */
export interface PayrollPage { page: number; text: string }
export interface PayrollSource { page: number; line: number; field: string; text: string }
export interface PayrollCandidate<T> { value: T; sources: PayrollSource[]; confidence: 'medium' | 'review' }
export interface PayrollField<T> {
  state: 'absent' | 'zero' | 'candidate' | 'conflict';
  candidates: PayrollCandidate<T>[];
}
export interface PayrollItem {
  competence?: string;
  kind: 'earning' | 'deduction' | 'advance' | 'vacation' | 'thirteenth' | 'proportional';
  label: string;
  amount: PayrollField<number>;
  recurring: 'unconfirmed';
}
export interface PrivatePayrollExtraction {
  version: 1;
  competence: PayrollField<string>;
  creditDate: PayrollField<string>;
  monthlyBase: PayrollField<number>;
  items: PayrollItem[];
  totals: { gross: PayrollField<number>; deductions: PayrollField<number>; net: PayrollField<number> };
  reconciliation: 'unavailable' | 'balanced' | 'mismatch';
  requiresReview: true;
  warnings: string[];
}
const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
function field<T>(): PayrollField<T> { return { state: 'absent', candidates: [] }; }
function add<T>(target: PayrollField<T>, value: T, source: PayrollSource) {
  const existing = target.candidates.find(c => c.value === value);
  if (existing) { existing.sources.push(source); existing.confidence = 'review'; }
  else target.candidates.push({ value, sources: [source], confidence: 'medium' });
  target.state = target.candidates.length > 1 ? 'conflict' : value === 0 ? 'zero' : 'candidate';
  if (target.state === 'conflict') target.candidates.forEach(c => c.confidence = 'review');
}
function day(raw: string): string | undefined {
  const [d, m, y] = raw.split('/').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
    ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : undefined;
}
export function extractPrivatePayroll(input: string | readonly PayrollPage[]): PrivatePayrollExtraction {
  const pages = typeof input === 'string' ? input.split('\f').map((text, i) => ({ page: i + 1, text })) : input;
  const result: PrivatePayrollExtraction = { version: 1, competence: field(), creditDate: field(), monthlyBase: field(), items: [],
    totals: { gross: field(), deductions: field(), net: field() }, reconciliation: 'unavailable', requiresReview: true, warnings: [] };
  let section: 'earning' | 'deduction' | undefined;
  let currentCompetence: string | undefined;
  for (const page of pages) {
    if (!page.text.trim()) result.warnings.push(`Página ${page.page} sem texto extraível; OCR não executado.`);
    page.text.split(/\r?\n/).forEach((text, index) => {
      const line = normalize(text);
      const source = (name: string): PayrollSource => ({ page: page.page, line: index + 1, field: name, text });
      for (const m of line.matchAll(/COMPETENCIA\s*:?\s*(\d{2})\/(\d{4})/g)) {
        if (+m[1] >= 1 && +m[1] <= 12) {
          currentCompetence = `${m[2]}-${m[1]}`;
          section = undefined;
          add(result.competence, currentCompetence, source('competence'));
        }
        else result.warnings.push('Competência inválida.');
      }
      for (const m of line.matchAll(/(?:DATA (?:DE )?CREDITO|PAGAMENTO EM)\s*:?\s*(\d{2}\/\d{2}\/\d{4})/g)) {
        const value = day(m[1]);
        if (value) add(result.creditDate, value, source('creditDate'));
        else result.warnings.push('Data de crédito inválida.');
      }
      const amounts = [...line.matchAll(/(?<![\d.,])(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}(?![\d.,])/g)]
        .map(m => Number(m[0].replace(/\./g, '').replace(',', '')));
      if (/^(?:RUBRICAS\s+)?PROVENTOS\s*$/.test(line.trim())) section = 'earning';
      if (/^(?:RUBRICAS\s+)?DESCONTOS\s*$/.test(line.trim())) section = 'deduction';
      if (!amounts.length) {
        if (/R\$|SALARIO[ -]+BASE|BASE MENSAL|TOTAL (?:DE )?(?:PROVENTOS|DESCONTOS)/.test(line)) result.warnings.push('Campo monetário sem valor BRL válido; revisão necessária.');
        return;
      }
      if (/\bTOTAIS\b/.test(line) && amounts.length === 2) {
        add(result.totals.gross, amounts[0] / 100, source('gross'));
        add(result.totals.deductions, amounts[1] / 100, source('deductions')); return;
      }
      const total = /TOTAL (?:DE )?PROVENTOS/.test(line) ? 'gross' : /TOTAL (?:DE )?DESCONTOS/.test(line) ? 'deductions' : /^(?:VALOR )?LIQUIDO\b/.test(line.trim()) ? 'net' : undefined;
      if (total) { if (amounts.length === 1) add(result.totals[total], amounts[0] / 100, source(total)); return; }
      const proportional = /PROPORCIONAL|SALARIO.{0,30}\b\d+\s*DIAS/.test(line);
      if (/SALARIO[ -]+BASE|BASE MENSAL/.test(line) && !proportional) {
        if (amounts.length === 1) add(result.monthlyBase, amounts[0] / 100, source('monthlyBase'));
        else result.warnings.push('Salário-base com múltiplas colunas monetárias; revisão necessária.');
        return;
      }
      const kind = proportional ? 'proportional' : /ADIANTAMENTO/.test(line) ? 'advance' : /FERIAS/.test(line) ? 'vacation' : /\b13[ºO°]?\s+SALARIO|DECIMO TERCEIRO/.test(line) ? 'thirteenth' : section;
      if (!kind) return;
      const label = text.replace(/(?:R\$\s*)?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}/g, '').trim();
      // Equal repeated rows are one candidate with all locations, never added twice.
      let item = result.items.find(i => normalize(i.label) === normalize(label) && i.kind === kind && i.competence === currentCompetence);
      if (!item) { item = { kind, label, competence: currentCompetence, amount: field(), recurring: 'unconfirmed' }; result.items.push(item); }
      if (amounts.length === 1) add(item.amount, amounts[0] / 100, source('amount'));
      else { item.amount.state = 'conflict'; result.warnings.push('Rubrica com múltiplas colunas monetárias; revisão necessária.'); }
    });
  }
  if (result.competence.state === 'conflict') {
    result.warnings.push('Múltiplas competências; não combinar rubricas nem aplicar tarifas.');
    result.items.forEach(i => i.amount.candidates.forEach(c => c.confidence = 'review'));
  }
  const totals = Object.values(result.totals);
  if (result.competence.state !== 'conflict' && totals.every(f => f.candidates.length === 1)) {
    const { gross, deductions, net } = result.totals;
    result.reconciliation = Math.round(gross.candidates[0].value * 100) - Math.round(deductions.candidates[0].value * 100) === Math.round(net.candidates[0].value * 100) ? 'balanced' : 'mismatch';
  }
  if (!pages.length || pages.every(p => !p.text.trim())) result.warnings.push('Documento sem texto; extração indisponível.');
  return result;
}
