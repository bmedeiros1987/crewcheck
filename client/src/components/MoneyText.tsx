import type { CSSProperties } from 'react';
import { useFinancialPrivacy } from './finance/FinancialPrivacy';
/** Keep each complete currency amount together; separate currencies may flow onto separate lines. */
export default function MoneyText({ value }: { value: string }) {
  value = useFinancialPrivacy().text(value);
  return <>{value.split(/([−-]?(?:R\$|US\$|€|£)\s*[−-]?[\d.]+,\d{2})/g).map((part, index) =>
    /^(?:[−-]?(?:R\$|US\$|€|£))/.test(part)
      ? <span key={index} className="cc-money-token" style={{ '--cc-money-chars': part.length } as CSSProperties}>{part}</span>
      : part)}</>;
}
