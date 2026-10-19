import { useState } from 'react';
import { ownerPerDiemReview } from '@/lib/ownerPerDiemReview';
import { financialRateOwner, financialRateSession, mergeConfirmedRates, readConfirmedFinancialRates, saveConfirmedFinancialRates, type LearnedRate } from '@/lib/financialStatementLearning';
import { useFinancialPrivacy } from './FinancialPrivacy';
import { readFinancialSetting } from '@/lib/financialSettingStore';

export default function OwnerPerDiemConfirmation({ onSaved }: { onSaved?: () => void }) {
  const privacy = useFinancialPrivacy();
  const [month, setMonth] = useState(''), [meal, setMeal] = useState(''), [reference, setReference] = useState('');
  const [breakfastQuarter, setBreakfast] = useState(false), [taxiQuarter, setTaxi] = useState(false);
  const [review, setReview] = useState<{ session: string; rates: LearnedRate[]; manual: number | null } | null>(null), [message, setMessage] = useState('');
  function prepare() {
    const session = financialRateSession(), ownerId = financialRateOwner();
    const rates = ownerId ? ownerPerDiemReview({ ownerId, month, meal, reference, breakfastQuarter, taxiQuarter }) : [];
    const rawManual = readFinancialSetting('crewcheck_perdiem_rate_domestic');
    const manual = rawManual.trim() && Number.isFinite(Number(rawManual)) && Number(rawManual) >= 0 ? Number(rawManual) : null;
    setReview(session && rates.length ? { session, rates, manual } : null);
    setMessage(rates.length ? '' : 'Informe mês, valor com centavos e referência. A divisão em 25% deve resultar em centavos exatos.');
  }
  function save() {
    if (!review || review.session !== financialRateSession()) { setReview(null); setMessage('A conta ou sessão mudou. Prepare uma nova revisão.'); return; }
    const next = mergeConfirmedRates(readConfirmedFinancialRates(), review.rates.map(rate => ({ ...rate, confirmed: true })));
    if (!saveConfirmedFinancialRates(next, review.session)) { setMessage('Gravação não confirmada; revise a conta e o histórico.'); return; }
    setReview(null); setMessage('Tarifas salvas nesta conta para o mês revisado. Recebimento não confirmado.');
    onSaved?.();
    window.dispatchEvent(new CustomEvent('crewcheck:finance-calibrated', { detail: { mode: 'per_diem' } }));
  }
  return <details><summary>Confirmar tarifa informada pelo titular</summary>
    <p>Aplicação somente nesta conta e no mês escolhido. A tarifa de táxi não comprova elegibilidade, corrida ou pagamento.</p>
    <fieldset disabled={!!review}>
      <label>Mês de vigência <input type="month" value={month} onChange={e => setMonth(e.target.value)}/></label>
      <label>Refeição integral (BRL) <input inputMode="decimal" value={meal} onChange={e => setMeal(e.target.value)}/></label>
      <label>Referência da confirmação <input value={reference} onChange={e => setReference(e.target.value)}/></label>
      <label><input type="checkbox" checked={breakfastQuarter} onChange={e => setBreakfast(e.target.checked)}/>Confirmo café a 25% da refeição integral.</label>
      <label><input type="checkbox" checked={taxiQuarter} onChange={e => setTaxi(e.target.checked)}/>Confirmo tarifa de táxi a 25%, com elegibilidade calculada separadamente.</label>
    </fieldset>
    {!review && <button type="button" onClick={prepare}>Preparar tarifas sem gravar</button>}
    {review && <div><ul>{review.rates.map(rate => <li key={rate.key}>{rate.label}: {privacy.amount(rate.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))} · {rate.effectiveFrom} a {rate.effectiveTo}</li>)}</ul>
      <p>Ao confirmar, estas tarifas alteram a previsão desta conta no período acima. Não alteram a tabela global.</p>
      <p>As refeições integrais usarão {privacy.amount(review.rates[0].value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))} neste mês. A revisão mensal prevalece sobre o valor manual anterior, que é preservado fora deste período.</p>
      {review.manual !== null && <p>Valor manual preservado: {privacy.amount(review.manual.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))}.</p>}
      <p>Opções desmarcadas não adotam uma tarifa proporcional desta revisão. Café mantém suas fontes independentes; táxi exige preço e elegibilidade próprios.</p>
      <button type="button" onClick={save}>Confirmar e salvar tarifas nesta conta</button><button type="button" onClick={() => setReview(null)}>Cancelar revisão</button></div>}
    {message && <p role="status">{message}</p>}
  </details>;
}
