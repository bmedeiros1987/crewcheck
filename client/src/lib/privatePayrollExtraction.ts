/** Pure private extraction. Raw source text is ephemeral preview data, never a saved rate. */
export type PayrollSourceOrigin = 'pdf-physical' | 'document-logical';
export interface PayrollPage { page: number; text: string; origin?: PayrollSourceOrigin }
export interface PayrollSource { page: number; origin: PayrollSourceOrigin; line: number; field: string; text: string }
export interface PayrollCandidate<T> { value: T; sources: PayrollSource[]; confidence: 'medium' | 'review' }
export interface PayrollField<T> {
  state: 'absent' | 'zero' | 'candidate' | 'conflict';
  candidates: PayrollCandidate<T>[];
  /** Sticky ambiguity: a later simple row cannot resolve an earlier ambiguous row. */
  unresolvedSources: PayrollSource[];
}
export interface PayrollItem {
  competence?: string;
  kind: 'earning' | 'deduction' | 'advance' | 'vacation' | 'thirteenth' | 'proportional';
  direction: 'credit' | 'debit' | 'unknown';
  nature?: 'advance' | 'vacation' | 'thirteenth' | 'proportional';
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
  layout: 'lines' | 'unstructured' | 'no-text';
  incomplete: boolean;
  unresolvedSources: PayrollSource[];
  reconciliation: 'unavailable' | 'balanced' | 'mismatch';
  requiresReview: true;
  warnings: string[];
}
const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
function field<T>(): PayrollField<T> { return { state: 'absent', candidates: [], unresolvedSources: [] }; }
function refresh<T>(target: PayrollField<T>) {
  target.state = target.unresolvedSources.length || target.candidates.length > 1 ? 'conflict'
    : !target.candidates.length ? 'absent' : target.candidates[0].value === 0 ? 'zero' : 'candidate';
  if (target.state === 'conflict') target.candidates.forEach(c => c.confidence = 'review');
}
function add<T>(target: PayrollField<T>, value: T, source: PayrollSource) {
  const existing = target.candidates.find(c => c.value === value);
  if (existing) { existing.sources.push(source); existing.confidence = 'review'; }
  else target.candidates.push({ value, sources: [source], confidence: 'medium' });
  refresh(target);
}
function ambiguous<T>(target: PayrollField<T>, source: PayrollSource) {
  target.unresolvedSources.push(source); refresh(target);
}
function day(raw: string): string | undefined {
  const [d, m, y] = raw.split('/').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
    ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : undefined;
}
/** Keep signs. Directional D/C labels are not silently converted to unsigned BRL. */
function amounts(line: string): { values: number[]; uncertainDirection: boolean } {
  const values: number[] = [];
  let uncertainDirection = false;
  const pattern = /(?<![\d.,])(?:\(\s*)?(?:[+\-−]\s*)?(?:R\$\s*)?(?:[+\-−]\s*)?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}(?![\d.,])(?:\s*\)|\s*[\-−](?!\s*\d))?(?:\s*[DC]\b)?/g;
  for (const match of line.matchAll(pattern)) {
    const raw = match[0].trim();
    const numeric = raw.match(/(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}/)![0];
    const cents = Number(numeric.replace(/[.,]/g, ''));
    if (!Number.isSafeInteger(cents)) continue;
    const negative = /[\-−]/.test(raw) || raw.startsWith('(');
    if (/[DC]$/.test(raw) || /\bDEBITO\b|\bCREDITO\b/.test(line)) uncertainDirection = true;
    values.push((negative ? -cents : cents) / 100);
  }
  return { values, uncertainDirection };
}
export function extractPrivatePayroll(input: string | readonly PayrollPage[]): PrivatePayrollExtraction {
  const pages: readonly PayrollPage[] = typeof input === 'string'
    ? input.split('\f').map((text, i) => ({ page: i + 1, text, origin: 'document-logical' })) : input;
  const result: PrivatePayrollExtraction = { version: 1, competence: field(), creditDate: field(), monthlyBase: field(), items: [],
    totals: { gross: field(), deductions: field(), net: field() }, layout: 'lines', incomplete: false, unresolvedSources: [],
    reconciliation: 'unavailable', requiresReview: true, warnings: [] };
  let section: 'credit' | 'debit' | undefined;
  let currentCompetence: string | undefined;
  const problem = (message: string) => { result.incomplete = true; result.warnings.push(message); };
  for (const page of pages) {
    if (!page.text.trim()) { problem(`Página ${page.page} sem texto extraível; OCR não executado.`); continue; }
    page.text.split(/\r?\n/).forEach((text, index) => {
      const line = normalize(text);
      const source = (name: string): PayrollSource => ({ page: page.page, origin: page.origin ?? 'document-logical', line: index + 1, field: name, text });
      // The existing importer flattens a page. Never pretend that a whole page is a row.
      const markers = [...line.matchAll(/COMPETENCIA|DATA (?:DE )?CREDITO|PAGAMENTO EM|SALARIO[ -]+BASE|BASE MENSAL|\bPROVENTOS\b|\bDESCONTOS\b|\bLIQUIDO\b|\bTOTAIS\b/g)];
      if (markers.length > 1 && !/^\s*TOTAIS\b/.test(line) && !/^\s*TOTAL (?:DE )?(?:PROVENTOS|DESCONTOS)\b/.test(line)) {
        result.layout = 'unstructured'; result.unresolvedSources.push(source('layout'));
        problem('Texto com múltiplos campos na mesma linha; reconstrução de linhas pela extração PDF necessária.'); return;
      }
      for (const marker of line.matchAll(/COMPETENCIA/g)) {
        const m = line.slice(marker.index! + marker[0].length).match(/^\s*:?\s*(\d{2})\/(\d{4})(?!\d)/);
        if (m && +m[1] >= 1 && +m[1] <= 12) {
          currentCompetence = `${m[2]}-${m[1]}`; section = undefined;
          add(result.competence, currentCompetence, source('competence'));
        } else { ambiguous(result.competence, source('competence')); problem('Competência inválida ou redigida.'); }
      }
      for (const marker of line.matchAll(/(?:DATA (?:DE )?CREDITO|PAGAMENTO EM)\b/g)) {
        const m = line.slice(marker.index! + marker[0].length).match(/^\s*:?\s*(\d{2}\/\d{2}\/\d{4})(?!\d)/);
        const value = m && day(m[1]);
        if (value) add(result.creditDate, value, source('creditDate'));
        else { ambiguous(result.creditDate, source('creditDate')); problem('Data de crédito inválida ou redigida.'); }
      }
      if (/COMPETENCIA|DATA (?:DE )?CREDITO|PAGAMENTO EM/.test(line)) return;
      if (/^(?:RUBRICAS\s+)?PROVENTOS\s*$/.test(line.trim())) { section = 'credit'; return; }
      if (/^(?:RUBRICAS\s+)?DESCONTOS\s*$/.test(line.trim())) { section = 'debit'; return; }
      const parsed = amounts(line);
      const values = parsed.values;
      const setAmount = (target: PayrollField<number>, name: string, expected = 1) => {
        if (values.length === expected && !parsed.uncertainDirection) add(target, values[0], source(name));
        else { ambiguous(target, source(name)); problem('Campo monetário ausente, redigido, direcional ou com múltiplas colunas; revisão necessária.'); }
      };
      if (/^\s*TOTAIS\b/.test(line)) {
        section = undefined;
        if (values.length === 2 && !parsed.uncertainDirection) {
          add(result.totals.gross, values[0], source('gross')); add(result.totals.deductions, values[1], source('deductions'));
        } else {
          ambiguous(result.totals.gross, source('gross')); ambiguous(result.totals.deductions, source('deductions'));
          problem('Totais com colunas ambíguas ou ausentes; fechamento indisponível.');
        } return;
      }
      const total = /^\s*TOTAL (?:DE )?PROVENTOS\b/.test(line) ? 'gross' : /^\s*TOTAL (?:DE )?DESCONTOS\b/.test(line) ? 'deductions'
        : /^\s*(?:VALOR )?LIQUIDO\b/.test(line) ? 'net' : undefined;
      if (total) { section = undefined; setAmount(result.totals[total], total); return; }
      const proportional = /PROPORCIONAL|SALARIO.{0,30}\b\d+\s*DIAS/.test(line);
      const nature = proportional ? 'proportional' : /ADIANTAMENTO/.test(line) ? 'advance' : /FERIAS/.test(line) ? 'vacation'
        : /\b13[ºO°]?\s+SALARIO|DECIMO TERCEIRO/.test(line) ? 'thirteenth' : undefined;
      const debitLabel = /\bDESCONTO\b|\bDEBITO\b/.test(line);
      const creditLabel = /\bRESTITUICAO\b|\bDEVOLUCAO\b|\bCREDITO\b/.test(line);
      const taxLabel = /\bINSS\b|\bIRRF\b/.test(line);
      // A tax name describes the nature, not the direction of an explicit credit/refund.
      const directionConflict = (section === 'credit' && debitLabel) || (section === 'debit' && creditLabel) || (creditLabel && debitLabel);
      const direction = section ?? (creditLabel ? 'credit' : debitLabel || taxLabel ? 'debit' : 'unknown');
      const baseReference = /SALARIO[ -]+BASE|BASE MENSAL/.test(line);
      // Require the whole label, not a substring of a discount, adjustment or vacation rubric.
      const label = text.replace(/(?:\(\s*)?(?:[+\-−]\s*)?(?:R\$\s*)?(?:[+\-−]\s*)?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}(?:\s*\)|\s*[\-−])?(?:\s*[DC]\b)?/gi, '').trim();
      const plainLabel = normalize(label).replace(/^\d+\s+/, '').replace(/:$/, '').trim();
      const explicitMonthlyBase = /^(?:SALARIO[ -]+BASE MENSAL|BASE MENSAL)$/.test(plainLabel);
      if (explicitMonthlyBase && !nature && direction !== 'debit' && !directionConflict) { setAmount(result.monthlyBase, 'monthlyBase'); return; }
      if (/^\s*(?:\d+\s+)?(?:SALARIO[ -]+BASE MENSAL|BASE MENSAL)\b/.test(line) && !nature && direction !== 'debit' && !/DIFERENCA|AJUSTE|COMPLEMENTO|RESTITUICAO/.test(line)) {
        ambiguous(result.monthlyBase, source('monthlyBase')); problem('Referência mensal com conteúdo monetário ou qualificação ambígua; revisão obrigatória.'); return;
      }
      if (!nature && !section && !debitLabel && !creditLabel && !taxLabel && !baseReference) return;
      if (!values.length && !/R\$|\d|REDACT|REDIG|OCULTO|\[.*\]/.test(line)) return;
      const kind = direction === 'debit' ? 'deduction' : nature ?? 'earning';
      let item = result.items.find(i => normalize(i.label) === normalize(label) && i.direction === direction && i.competence === currentCompetence);
      if (!item) { item = { kind, direction, nature, label, competence: currentCompetence, amount: field(), recurring: 'unconfirmed' }; result.items.push(item); }
      setAmount(item.amount, 'amount');
      if (directionConflict) { ambiguous(item.amount, source('amount')); problem('Seção e descrição divergem quanto a crédito/débito; revisão obrigatória.'); }
    });
  }
  const fields = [result.competence, result.creditDate, result.monthlyBase, ...Object.values(result.totals), ...result.items.map(i => i.amount)];
  if (fields.some(f => f.state === 'conflict')) problem('Há campos conflitantes ou incompletos; resolução explícita necessária.');
  if (result.competence.state === 'conflict') result.warnings.push('Múltiplas competências ou competência inválida; não combinar rubricas nem aplicar tarifas.');
  const totals = Object.values(result.totals);
  if (totals.some(f => f.candidates.some(c => c.value < 0))) problem('Totais negativos preservados; convenção de sinais exige revisão antes do fechamento.');
  if (!result.incomplete && totals.every(f => f.state === 'candidate' || f.state === 'zero')) {
    const { gross, deductions, net } = result.totals;
    result.reconciliation = Math.round(gross.candidates[0].value * 100) - Math.round(deductions.candidates[0].value * 100) === Math.round(net.candidates[0].value * 100) ? 'balanced' : 'mismatch';
  }
  if (!pages.length || pages.every(p => !p.text.trim())) { result.layout = 'no-text'; problem('Documento sem texto; extração indisponível.'); }
  return result;
}
