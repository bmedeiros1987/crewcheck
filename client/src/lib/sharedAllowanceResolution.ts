import { roundCurrencyAmount } from './financialAmounts';
import { financialActAt, type FinancialActSnapshot } from './financialActApplicability';
import { resolveLatamAllowanceReference, validAllowanceDay, type AllowanceCategory, type AllowanceCurrency, type AllowanceSlot, type LatamAllowanceReference } from './latamAllowanceCatalog';

export type OwnedAllowanceValue = { value: number; source: 'learned' | 'personal_reference' | 'manual'; description: string; version: string };
export type ResolvedAllowanceSlot = {
  kind: 'forecast' | 'reference' | 'pending'; value: number | null; currency: AllowanceCurrency | null;
  source: string; version: string; reason: string; reference: LatamAllowanceReference | null;
};
/** Caller supplies already validated, category-specific account values. No rate
 * adoption or currency-only foreign-rate promotion takes place here. */
export function resolveSharedAllowanceSlot(args: {
  category: AllowanceCategory; slot: AllowanceSlot; date: string; context: FinancialActSnapshot;
  owned: OwnedAllowanceValue | null; archiveIssue?: string | null;
}): ResolvedAllowanceSlot {
  const pending = (reason: string, reference: LatamAllowanceReference | null = null): ResolvedAllowanceSlot => ({
    kind: 'pending', value: null, currency: reference?.currency || null, source: 'pending', version: '', reason, reference,
  });
  const inspection = resolveLatamAllowanceReference({ role: null, category: args.category, slot: args.slot, date: args.date });
  if (!inspection.category || !inspection.slot || !validAllowanceDay(args.date)) return pending('Data ou categoria da diária inválida.');
  // An unreadable existing domestic archive is not evidence for a new default.
  if (args.category === 'domestic' && args.archiveIssue) return pending(args.archiveIssue);
  if (args.owned) {
    if (!Number.isFinite(args.owned.value) || args.owned.value < 0) return pending('Valor informado nesta conta inválido; revisão necessária.');
    return { kind: 'forecast', value: roundCurrencyAmount(args.owned.value), currency: inspection.currency,
      source: args.owned.source, version: args.owned.version, reason: args.owned.description, reference: null };
  }
  const context = args.context;
  const selection = context.history && ['ready', 'missing'].includes(context.state) && context.ownerId === context.history.ownerId && context.isCurrent()
    ? financialActAt(context.history, args.date) : null;
  if (!selection || selection.state !== 'applicable') {
    const reason = context.state === 'invalid' ? 'Declaração financeira de ACT inválida; dados preservados para revisão.'
      : context.state === 'unavailable' ? 'Declaração financeira de ACT indisponível neste dispositivo; dados preservados.'
      : selection?.state === 'revoked' ? 'Aplicação financeira do ACT revogada para esta data.'
      : selection?.state === 'expired' ? 'Declaração financeira de ACT fora do período confirmado.'
      : 'Empresa e ACT não confirmados para esta data. Confirme a aplicação financeira uma vez para o período.';
    return pending(reason);
  }
  const reference = resolveLatamAllowanceReference({ role: selection.event.role, category: args.category, slot: args.slot, date: args.date });
  if (reference.amountMinor === null || !reference.calculableReference) return pending(reference.reason, reference);
  return { kind: reference.state === 'resolved_enterprise_reference' ? 'forecast' : 'reference',
    value: reference.amountMinor / 100, currency: reference.currency, source: reference.sourceKind || 'pending',
    version: reference.version + ':' + selection.event.role, reason: reference.reason, reference };
}

/** Reference-only subtotal. Never substitute this for an enterprise forecast total. */
export function summarizeMinimumAllowanceRows(rows: readonly { value: number; currency: string }[]) {
  const cents: Record<string, number> = {}, invalid = new Set<string>();
  for (const row of rows) {
    const value = Math.round(row.value * 100);
    if (!['BRL', 'USD', 'EUR', 'GBP'].includes(row.currency) || !Number.isSafeInteger(value) || value < 0) { invalid.add(row.currency); continue; }
    const next = (cents[row.currency] || 0) + value;
    if (!Number.isSafeInteger(next)) invalid.add(row.currency); else cents[row.currency] = next;
  }
  return Object.fromEntries(Object.entries(cents).filter(([currency]) => !invalid.has(currency)).map(([currency, value]) => [currency, value / 100]));
}

/** Endpoint admission is occurrence-specific. A recognized domestic endpoint
 * cannot erase an unknown opposite endpoint. Existing base-presence evidence
 * establishes breakfast's location independently of a later/earlier route. */
export function resolveAllowanceOccurrenceGeography<T extends { rateKey: string | null; airport: string; reason: string }>(args: {
  origin: string; destination: string; base: string; breakfastAtProvenBase: boolean;
  overrides: Record<string, string>;
  classify: (origin: string, destination: string, overrides: any) => T;
}): T {
  const points = args.breakfastAtProvenBase ? [args.base, args.base] : [args.origin, args.destination];
  for (const point of points) {
    const local = args.classify(point, point, args.overrides);
    if (!local.rateKey) return { ...local, reason: 'Classificação geográfica desta ocorrência pendente; um aeroporto conhecido não comprova o outro.' };
    const normalized = String(point || '').trim().toUpperCase();
    if (Object.prototype.hasOwnProperty.call(args.overrides, normalized)) {
      const published = args.classify(point, point, {});
      // A free-form category override is not geographical evidence that an
      // unknown country is "other", or that GB/UK is specifically England.
      if (!published.rateKey || published.rateKey !== local.rateKey) return { ...local, rateKey: null,
        reason: 'Classificação manual diverge da geografia conhecida ou não tem escopo comprovado; revise a ocorrência antes de aplicar esta referência.' };
    }
  }
  return args.classify(points[0], points[1], args.overrides);
}
