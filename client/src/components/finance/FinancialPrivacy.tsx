import { useSyncExternalStore } from 'react';
import './financial-privacy.css';
import { Eye, EyeOff } from 'lucide-react';
import { financialRateOwner } from '@/lib/financialStatementLearning';

import { financialValuesHidden, toggleFinancialValues, invalidateFinancialPrivacyPreference } from '@/lib/financialPrivacyPreference';

const changed = 'crewcheck:financial-privacy-changed';
const events = [changed, 'crewcheck:auth-changed', 'crewcheck:auth-expired'];
function subscribe(listener: () => void) {
  const storage = (event: StorageEvent) => { invalidateFinancialPrivacyPreference(event.key); listener(); };
  events.forEach(event => window.addEventListener(event, listener));
  window.addEventListener('storage', storage);
  return () => { events.forEach(event => window.removeEventListener(event, listener)); window.removeEventListener('storage', storage); };
}
const snapshot = () => financialValuesHidden(financialRateOwner());
export const hiddenValue = 'R$ •••';
const codes: string[] = typeof (Intl as any).supportedValuesOf === 'function'
  ? (Intl as any).supportedValuesOf('currency') : ['BRL','USD','EUR','GBP','JPY','CHF','CAD','AUD','INR','KRW','CNY','KWD','BHD','OMR'];
const marker = String.raw`(?:R\$|US\$|\p{Sc}|\b(?:${codes.join('|')})(?![A-Za-z]))`;
const numeric = String.raw`\d[\d.,'\u2019\u00a0\u202f]*(?: \d{3}(?!\d))*(?:[.,]\d+)?`;
const prefixAmounts = new RegExp(String.raw`(?:[-\u2212+]\s*)?${marker}\s*(?:[-\u2212+]\s*)?${numeric}`, 'gu');
const suffixAmounts = new RegExp(String.raw`(^|[^\p{L}\p{N}/:.,\u2212+-])(?:[-\u2212+]\s*)?${numeric}\s*${marker}(?!\s*(?:•|[-\u2212+]?\s*\d))`, 'gu');
const temporalText = /(\b\d{4}-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?\b|\b(?:0?[1-9]|[12]\d|3[01])[/.](?:0?[1-9]|1[0-2])[/.]\d{4}\b|\b(?:0?[1-9]|[12]\d|3[01])\/(?:0?[1-9]|1[0-2])\b|\b(?:0[1-9]|1[0-2])\/\d{4}\b|\b(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?\b)/gu;
// A fixed mask has no value-dependent length. Labels and dates stay readable.
export function concealFinancialText(text: string, hidden: boolean): string {
  if (!hidden) return text;
  return text.split(temporalText).map((part, index) => index % 2 ? part
    : part.replace(prefixAmounts, hiddenValue).replace(suffixAmounts, (_match, boundary: string) => boundary + hiddenValue)).join('');
}
export function useFinancialPrivacy() {
  const hidden = useSyncExternalStore(subscribe, snapshot, () => true);
  return {
    hidden,
    text: (value: string) => concealFinancialText(value, hidden),
    amount: (value: string) => hidden ? hiddenValue : value,
    toggle: () => {
      const owner = financialRateOwner();
      if (!owner) return;
      toggleFinancialValues(owner);
      window.dispatchEvent(new Event(changed));
    },
  };
}
/** Shows or hides financial values only. `iconOnly` keeps the accessible name and state without visible text. */
export function FinancialPrivacyToggle({ iconOnly = false }: { iconOnly?: boolean } = {}) {
  const { hidden, toggle } = useFinancialPrivacy();
  return <div className="cc-financial-privacy-control"><button type="button" className="cc-financial-privacy-toggle" data-icon-only={iconOnly || undefined} onClick={toggle} aria-label={hidden ? 'Mostrar valores financeiros' : 'Ocultar valores financeiros'} title={iconOnly ? (hidden ? 'Mostrar valores' : 'Ocultar valores') : undefined} aria-pressed={hidden}>
    {hidden ? <EyeOff size={20} aria-hidden="true"/> : <Eye size={20} aria-hidden="true"/>}
    {!iconOnly && <span>{hidden ? 'Mostrar valores' : 'Ocultar valores'}</span>}
  </button></div>;
}
