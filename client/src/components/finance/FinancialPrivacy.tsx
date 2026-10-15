import { useSyncExternalStore } from 'react';
import './financial-privacy.css';
import { Eye, EyeOff } from 'lucide-react';
import { financialRateOwner } from '@/lib/financialStatementLearning';

// Display preference only. No monetary values, tokens or preference are persisted.
const hiddenAccounts = new Set<string>();
const changed = 'crewcheck:financial-privacy-changed';
const events = [changed, 'crewcheck:auth-changed', 'crewcheck:auth-expired', 'storage'];
function subscribe(listener: () => void) {
  events.forEach(event => window.addEventListener(event, listener));
  return () => events.forEach(event => window.removeEventListener(event, listener));
}
const snapshot = () => {
  const owner = financialRateOwner();
  return Boolean(owner && hiddenAccounts.has(owner));
};
export const hiddenValue = 'Valor oculto';
// Match complete amounts, including high-precision imported tariffs and all supported currencies.
export function concealFinancialText(text: string, hidden: boolean): string {
  return hidden ? text.replace(/[−+-]?(?:R\$|US\$|USD|BRL|EUR|GBP|€|£)\s*[−+-]?\d[\d.]*(?:,\d+)?/g, hiddenValue) : text;
}
export function useFinancialPrivacy() {
  const hidden = useSyncExternalStore(subscribe, snapshot, () => false);
  return {
    hidden,
    text: (value: string) => concealFinancialText(value, hidden),
    amount: (value: string) => hidden ? hiddenValue : value,
    toggle: () => {
      const owner = financialRateOwner();
      if (!owner) return;
      if (hiddenAccounts.has(owner)) hiddenAccounts.delete(owner); else hiddenAccounts.add(owner);
      window.dispatchEvent(new Event(changed));
    },
  };
}
export function FinancialPrivacyToggle() {
  const { hidden, toggle } = useFinancialPrivacy();
  return <div className="cc-financial-privacy-control"><button type="button" className="cc-financial-privacy-toggle" onClick={toggle} aria-label={hidden ? 'Mostrar valores financeiros' : 'Ocultar valores financeiros'} aria-pressed={hidden}>
    {hidden ? <EyeOff size={20} aria-hidden="true"/> : <Eye size={20} aria-hidden="true"/>}
    <span>{hidden ? 'Mostrar valores' : 'Ocultar valores'}</span>
  </button></div>;
}
