import { useEffect, useState } from 'react';
import { authFetch, captureAuthSession, getStoredUser, getToken } from '@/lib/authClient';
import { currencyMinorDigits, formatFinancialMinor } from '@shared/financialMoney.mjs';
import { validFinancialDay } from '@/lib/financialHistoryPeriods';
import { FinancialPrivacyToggle, useFinancialPrivacy } from './FinancialPrivacy';
import './concierge-financial-preview.css';

type Forecast = { id: string; category: string; expectedPaymentDate: string; expectedPaymentTimezone: string; amountMinor: number | null; currency: string; status: 'forecast' };
type Preview = { state: 'available' | 'no_data' | 'incomplete'; events: Forecast[]; hasMore: boolean };
const labels: Record<string, string> = { allowance: 'Diárias', advance: 'Adiantamento', payroll: 'Salário', vacation: 'Férias' };
function owner() {
  const user = getStoredUser();
  return getToken() && user && !['visitor', 'guest'].includes(user.role || '') ? String(user.email || '').trim().toLowerCase() : '';
}
function decode(raw: any, identity: string): Preview | null {
  if (raw?.ok !== true || raw.access !== 'allowed' || raw.source !== 'persisted_financial_ledger'
    || raw.ownerId !== identity || raw.horizonDays !== 30 || !['available', 'no_data', 'incomplete'].includes(raw.state)
    || typeof raw.hasMore !== 'boolean' || !Array.isArray(raw.events) || raw.events.length > 3) return null;
  const ids = new Set<string>();
  for (const event of raw.events) {
    if (!event || typeof event.id !== 'string' || !/^[a-f0-9]{64}$/.test(event.id) || ids.has(event.id)
      || !Object.hasOwn(labels, event.category) || event.status !== 'forecast' || !validFinancialDay(event.expectedPaymentDate)
      || typeof event.currency !== 'string' || currencyMinorDigits(event.currency) === null
      || (event.amountMinor !== null && !Number.isSafeInteger(event.amountMinor))) return null;
    try { new Intl.DateTimeFormat('en', { timeZone: event.expectedPaymentTimezone }); } catch { return null; }
    if (!event.expectedPaymentTimezone) return null;
    ids.add(event.id);
  }
  if (raw.state === 'no_data' && (raw.events.length || raw.hasMore)) return null;
  if ((raw.state === 'available' && !raw.events.length) || (raw.hasMore && raw.events.length !== 3)) return null;
  return { state: raw.state, events: raw.events, hasMore: raw.hasMore };
}
export default function ConciergeFinancialPreview({ openFinance }: { openFinance: () => void }) {
  const privacy = useFinancialPrivacy(), identity = owner(), token = getToken();
  const [revision, refresh] = useState(0);
  const [result, setResult] = useState<{ identity: string; token: string | null; data: Preview | null; loading: boolean } | null>(null);
  useEffect(() => {
    const changed = () => { setResult(null); refresh(value => value + 1); };
    const stored = (event: StorageEvent) => { if (event.key === null || ['crewcheck_auth_user', 'crewcheck_auth_token'].includes(event.key)) changed(); };
    const events = ['crewcheck:auth-will-change', 'crewcheck:auth-changed', 'crewcheck:auth-expired'];
    events.forEach(event => window.addEventListener(event, changed)); window.addEventListener('storage', stored);
    return () => { events.forEach(event => window.removeEventListener(event, changed)); window.removeEventListener('storage', stored); };
  }, []);
  useEffect(() => {
    const session = captureAuthSession(), controller = new AbortController(); let live = true;
    if (!identity) { setResult(null); return; }
    setResult({ identity, token, data: null, loading: true });
    const timer = setTimeout(() => controller.abort(), 8000);
    authFetch<any>('/api/platform/finance/upcoming', { method: 'GET', signal: controller.signal, cache: 'no-store' })
      .then(raw => { if (live && session.isCurrent() && owner() === identity) setResult({ identity, token, data: decode(raw, identity), loading: false }); })
      .catch(() => { if (live && session.isCurrent()) setResult({ identity, token, data: null, loading: false }); })
      .finally(() => clearTimeout(timer));
    return () => { live = false; clearTimeout(timer); controller.abort(); };
  }, [identity, token, revision]);
  const current = result?.identity === identity && result.token === token ? result : null, data = current?.data;
  return <section className="cz-toolbox cc-concierge-finance" aria-label="Próximas previsões financeiras">
    <h2>Próximas previsões financeiras</h2><p>Próximos 30 dias · moedas originais · não confirma recebimento.</p>
    <p role="status">{!identity ? 'Entre na conta proprietária para consultar.' : current?.loading ? 'Consultando previsões…' : !data ? 'Previsões indisponíveis nesta consulta.' : data.state === 'incomplete' ? 'Resumo parcial: há dados, datas ou valores a conferir no Financeiro.' : !data.events.length ? 'Nenhuma previsão com data informada nos próximos 30 dias.' : 'Datas previstas conforme registros da sua conta.'}</p>
    {data && data.events.length > 0 && <><FinancialPrivacyToggle/>
      <ol>{data.events.map(event => <li key={event.id}><div><strong>{labels[event.category]}</strong><span><time dateTime={event.expectedPaymentDate}>{event.expectedPaymentDate.slice(5).split('-').reverse().join('/')}</time> · previsão</span><small>{event.expectedPaymentTimezone}</small></div>
        <b>{event.amountMinor === null ? 'Valor a confirmar' : privacy.amount(formatFinancialMinor(event.amountMinor, event.currency) || 'Valor a confirmar')}<small>Moeda original: {event.currency}</small></b></li>)}</ol>
      {data.hasMore && <p>Há outras previsões no Financeiro.</p>}</>}
    <div className="cc-concierge-finance-actions"><button type="button" onClick={openFinance}>Abrir Financeiro</button>{identity && <button type="button" disabled={current?.loading} onClick={() => refresh(value => value + 1)}>Atualizar previsões</button>}</div>
  </section>;
}
