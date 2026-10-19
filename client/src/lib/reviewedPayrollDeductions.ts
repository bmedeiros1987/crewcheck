import type { PrivatePayrollExtraction, PayrollItem } from './privatePayrollExtraction';
import type { MonthlyFinancialSettings, MonthlyFinancialValue } from './financialMonthlySettings';
import { payrollMonthBounds } from './financialPayrollPeriods';

export type DeductionBucket = 'inss' | 'irrf' | 'other_deductions';
export type DeductionSelection = { rowId: string; bucket: DeductionBucket };
export type DeductionReviewContext = {
  ownerId: string; expectedSession: string; currentSession: string;
  documentFingerprint: string; documentKind: 'monthly' | 'special' | 'unknown';
  month: string; current: MonthlyFinancialSettings | null; expectedRevision: number;
  extraction: PrivatePayrollExtraction; selection: DeductionSelection[];
  completeBuckets: DeductionBucket[]; ownershipAndMonthConfirmed: boolean;
};
const buckets = ['inss', 'irrf', 'other_deductions'] as const;
const normalized = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/^\s*\d+\s+/, '').trim();
export function classifyPayrollDeduction(item: PayrollItem): { state:'recognized'|'unknown'|'conflict'|'informational'; bucket:DeductionBucket|null } {
  const label = normalized(item.label);
  if (/\bBASES?\b|\bINFORMATIV[OA]S?\b/.test(label)) return {state:'informational',bucket:null};
  const inss = /\bINSS\b/.test(label), irrf = /\bIRRF\b/.test(label);
  if (inss && irrf) return {state:'conflict',bucket:null};
  // Explicit qualifiers may precede a tax; calculation bases and arbitrary
  // mentions are not automatically deductions of that tax.
  const qualifiedTax = /^(?:(?:DESCONTO|RETENCAO|AJUSTE|COMPLEMENTO|COMPLEMENTAR|DIFERENCA)(?:\s+(?:DE|DO|DA))?\s+)?(?:INSS|IRRF)\b/.test(label);
  if (inss || irrf) return qualifiedTax ? {state:'recognized',bucket:inss?'inss':'irrf'} : {state:'unknown',bucket:null};
  const other = /^(?:(?:DESCONTO|RETENCAO)(?:\s+(?:DE|DO|DA))?\s+)?(?:PLANO|ADIANTAMENTO|EMPRESTIMO|CONSIGNADO|CONTRIBUICAO|MENSALIDADE|CONVENIO|ASSISTENCIA|COPARTICIPACAO|PENSAO|SEGURO|VALE|MCT\d*)\b/.test(label);
  return other ? {state:'recognized',bucket:'other_deductions'} : {state:'unknown',bucket:null};
}
export function payrollDeductionRows(extraction: PrivatePayrollExtraction) {
  return extraction.items.map((item, index) => {
    const classification = classifyPayrollDeduction(item);
    const candidate = item.amount.candidates[0];
    const unambiguous = ['candidate','zero'].includes(item.amount.state) && item.amount.candidates.length===1 && !item.amount.unresolvedSources.length;
    const amountMinor = unambiguous && candidate ? Math.round(candidate.value * 100) : null;
    const candidates = item.amount.candidates.map(value=>({amountMinor:Number.isSafeInteger(Math.round(value.value*100))?Math.round(value.value*100):null,locations:value.sources.map(({page,line,origin})=>({page,line,origin}))}));
    const locations = [...new Map([...item.amount.candidates.flatMap(value=>value.sources),...item.amount.unresolvedSources].map(({page,line,origin})=>[`${origin}:${page}:${line}`,{page,line,origin}])).values()];
    let reason = '';
    if (item.direction !== 'debit') reason = 'Rubrica não comprovada como desconto.';
    else if (classification.state !== 'recognized') reason = classification.state === 'informational' ? 'Base ou valor informativo; não é desconto elegível.' : classification.state === 'conflict' ? 'Rótulo mistura tributos; classificação conflitante.' : 'Grupo do desconto não reconhecido; revisão pendente.';
    else if (!['candidate', 'zero'].includes(item.amount.state) || item.amount.candidates.length !== 1 || item.amount.unresolvedSources.length) reason = 'Valor ou sentido conflitante.';
    else if (amountMinor === null || !Number.isSafeInteger(amountMinor) || amountMinor < 0 || Math.abs(candidate.value * 100 - amountMinor) > 1e-6) reason = 'Valor em centavos não comprovado.';
    else if (candidate.sources.length !== 1) reason = 'Repetição de origem exige revisão de identidade da rubrica.';
    else if (!candidate.sources[0] || candidate.sources[0].page < 1 || candidate.sources[0].line < 1) reason = 'Origem da rubrica não comprovada.';
    return { rowId: `row-${index}`, label: item.label, competence: item.competence, direction: item.direction,
      nature: item.nature, bucket: classification.bucket, classification:classification.state, amountState:item.amount.state,candidates, amountMinor, eligible: !reason, reason,
      // Locations only: never copy raw source text into the review plan.
      locations };
  });
}

/** Pure review only. No write/undo executor exists until isolation is proved. */
export function planReviewedPayrollDeductions(args: DeductionReviewContext) {
  const rows = payrollDeductionRows(args.extraction), reasons: string[] = [];
  const reject = (reason: string) => { if (!reasons.includes(reason)) reasons.push(reason); };
  if (!args.ownerId || !args.expectedSession || args.expectedSession !== args.currentSession) reject('Sessão da revisão mudou.');
  if (!/^sha256:[a-f0-9]{64}$/.test(args.documentFingerprint)) reject('Impressão digital do PDF não comprovada.');
  if (args.documentKind !== 'monthly') reject('Confirme o tipo mensal; documentos especiais exigem revisão separada.');
  if (!payrollMonthBounds(args.month) || args.extraction.competence.state !== 'candidate' || args.extraction.competence.candidates.length !== 1
    || args.extraction.competence.candidates[0]?.value !== args.month) reject('Competência única do documento não confirmada.');
  if (args.extraction.incomplete || args.extraction.unresolvedSources.length) reject('Extração incompleta ou conflitante.');
  if (args.extraction.reconciliation === 'mismatch') reject('Totais impressos divergentes.');
  if (rows.some(row=>row.direction==='debit' && ['unknown','conflict'].includes(row.classification))) reject('Há descontos com classificação desconhecida ou conflitante; grupos completos não comprovados.');
  const current = args.current;
  if (!current || current.ownerId !== args.ownerId || current.month !== args.month) reject('Registro mensal não pertence à conta e competência.');
  if (current?.closed) reject('Competência fechada.');
  if (!Number.isSafeInteger(args.expectedRevision) || args.expectedRevision < 0 || current?.revision !== args.expectedRevision) reject('A revisão mensal mudou.');
  if (!args.ownershipAndMonthConfirmed) reject('Confirme a titularidade e a competência do documento.');
  if (!args.selection.length) reject('Selecione os descontos para revisão.');
  const chosen = new Set<string>(), origins = new Set<string>(), changes: Partial<Record<DeductionBucket, MonthlyFinancialValue>> = {};
  const selectedRows: typeof rows = [];
  for (const selected of args.selection) {
    const row = rows.find(row => row.rowId === selected.rowId);
    if (chosen.has(selected.rowId)) reject('A mesma rubrica não pode entrar em dois grupos.');
    chosen.add(selected.rowId);
    if (!row || !row.eligible || row.competence !== args.month) { reject(row?.reason || 'Rubrica ou competência não comprovada.'); continue; }
    if (!buckets.includes(selected.bucket) || selected.bucket !== row.bucket) { reject('Grupo do desconto diverge da rubrica explícita.'); continue; }
    for (const source of row.locations) { const id=`${source.origin}:${source.page}:${source.line}`; if(origins.has(id))reject('A mesma origem não pode ser contada duas vezes.'); origins.add(id); }
    selectedRows.push(row);
  }
  const selectedTotalMinor = selectedRows.reduce((sum,row)=>sum+row.amountMinor!,0);
  const printedDeductions = args.extraction.totals.deductions;
  if (['candidate','zero'].includes(printedDeductions.state) && printedDeductions.candidates.length===1 && !printedDeductions.unresolvedSources.length) {
    const value=printedDeductions.candidates[0].value, printedMinor=Math.round(value*100);
    if (Number.isSafeInteger(printedMinor) && printedMinor>=0 && Math.abs(value*100-printedMinor)<1e-6 && selectedTotalMinor>printedMinor)
      reject('A soma dos descontos selecionados excede o total impresso.');
  }
  const selectedBuckets = [...new Set(selectedRows.map(row => row.bucket).filter((bucket):bucket is DeductionBucket=>bucket!==null))];
  for (const bucket of selectedBuckets) {
    if (!args.completeBuckets.includes(bucket)) reject('Confirme a substituição completa de cada grupo selecionado.');
    // Partial selection must not replace a complete existing tax/other aggregate.
    if (rows.some(row => row.direction === 'debit' && row.bucket === bucket && (!row.eligible || !chosen.has(row.rowId)))) reject('O grupo selecionado ainda tem rubricas omitidas ou pendentes.');
    const amountMinor = selectedRows.filter(row => row.bucket === bucket).reduce((sum,row) => sum + row.amountMinor!, 0);
    if (!Number.isSafeInteger(amountMinor)) { reject('Soma em centavos inválida.'); continue; }
    changes[bucket] = { amountMinor, currency:'BRL',kind:'deduction',source:'reviewed_statement',
      sourceId:args.documentFingerprint,recurrence:'once' };
  }
  const beforeAfter = selectedBuckets.map(field => ({field, beforePresent: Boolean(current && Object.hasOwn(current.values,field)),
    before: current?.values[field] ? {...current.values[field]} : null, after: changes[field] ? {...changes[field]!} : null}));
  return { month:args.month,ownerId:args.ownerId,expectedRevision:args.expectedRevision,documentFingerprint:args.documentFingerprint,
    rows,selectedRows,omittedRows:rows.filter(row=>!chosen.has(row.rowId)),beforeAfter,
    changes:reasons.length ? {} : changes,reasons,reviewable:reasons.length===0,
    reconciliation:args.extraction.reconciliation,recurrence:'once' as const,
    applicationAvailable:false as const,rollbackAvailable:false as const,
    applicationReason:'Aplicação indisponível: gravação segura ainda em validação.',
    futureEstimate:{enabled:false as const,reason:'Faltam regras e base para projetar os descontos.'} };
}
