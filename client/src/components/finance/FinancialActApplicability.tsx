import './financial-act-applicability.css';
import { useEffect, useState } from 'react';
import { financialRateOwner, financialRateSession } from '@/lib/financialStatementLearning';
import { financialActStorageKey, financialActTimeline, planFinancialActChange, readFinancialActApplicability, saveFinancialActApplicability, type FinancialActChange, type FinancialActSnapshot } from '@/lib/financialActApplicability';
import { LATAM_ACT_FROM, LATAM_ACT_THROUGH } from '@/lib/latamAllowanceCatalog';
import type { FinancialActPendingCause } from '@/lib/sharedAllowanceResolution';
import { getSavedLanguage } from '@/lib/i18n';
import { useFinancialPrivacy } from './FinancialPrivacy';

const emptyForm = () => ({ employer: '', role: '', from: '2026-01-01', through: LATAM_ACT_THROUGH, coverage: false, active: true });
const activeSession = () => { try { return financialRateSession(); } catch { return null; } };
// Complete copy per language (the static translator skips <option> and long text). Official names
// stay as published: TAM Linhas Aéreas S/A, LATAM Brasil, ACT, clause 1.2, Lei 7.064/1982, ABSA/LATAM Cargo.
const COPY = {
  pt: {
    causes: {
      act_missing: 'Empresa e ACT não confirmados para estas datas.',
      act_revoked: 'Aplicação do ACT revogada para estas datas.',
      act_expired: 'Declaração do ACT fora do período destas datas.',
      act_invalid: 'Declaração do ACT inválida neste aparelho.',
      act_unavailable: 'Declaração do ACT indisponível neste aparelho.',
    } as Record<FinancialActPendingCause, string>,
    unreadable: 'Não foi possível ler seus dados de diárias neste aparelho.',
    details: 'Detalhes',
    unreadableDetail: 'Declaração local indisponível ou inválida. Os dados foram preservados; referências pessoais válidas continuam independentes.',
    notice: 'Confirme seus dados para calcular as diárias.',
    review: 'Revisar dados',
    summary: 'Confirmar ou revisar aplicação financeira do ACT',
    pendingLabel: 'Pendências deste período',
    pendingDates: 'Datas pendentes neste período:',
    onlyAct: 'A confirmação libera só a referência do ACT; outras pendências continuam listadas.',
    intro: 'Confirme uma vez a aplicação do ACT ao período, sem digitar tarifas mês a mês. Declaração local do titular, não verificação pela empresa; não sincroniza automaticamente entre aparelhos.',
    withoutDeclaration: 'Sem essa declaração, a tabela do ACT não é aplicada automaticamente às suas previsões. Valores manuais ou pessoais válidos continuam valendo sem ela.',
    action: 'Ação', apply: 'Declarar aplicação no período', revoke: 'Revogar a partir de uma data',
    employer: 'Empregador', select: 'Selecione explicitamente', employerName: 'TAM Linhas Aéreas S/A — LATAM Brasil',
    profile: 'Perfil do ACT', cabin: 'Comissários', pilot: 'Pilotos',
    coverage: 'Declaro que meu vínculo com TAM Linhas Aéreas S/A está abrangido pelo ACT selecionado no período, conforme cláusula 1.2, e não está na exclusão de trabalhadores regidos pela Lei 7.064/1982.',
    scope: 'Não abrange automaticamente ABSA/LATAM Cargo, outros empregadores LATAM ou outras companhias. Base ou domicílio no exterior, por si só, não determina essa exclusão.',
    applyFrom: 'Aplicar desde', revokeFrom: 'Revogar desde', end: 'Fim da declaração',
    history: 'A revisão/revogação respeita a data escolhida e preserva o histórico. Uma declaração antiga não volta a valer após o término da mais recente. A referência nacional administrativa exige nova revisão em dezembro/2026.',
    prepare: 'Preparar declaração sem gravar', previewLabel: 'Prévia da aplicação financeira', previewTitle: 'Confira a linha do tempo antes de salvar',
    to: 'a', ownerDeclaration: 'declaração do titular', noShared: 'Sem aplicação compartilhada confirmada', noSharedShort: 'Sem aplicação compartilhada',
    confirm: 'Confirmar e salvar declaração nesta conta', cancel: 'Cancelar prévia', historyTitle: 'Histórico de declarações',
    incomplete: 'Selecione empresa e perfil, confirme a abrangência e confira as datas da vigência do ACT.',
    saved: 'Declaração financeira salva nesta conta e dispositivo. Nenhuma tarifa pessoal ou pagamento foi alterado.',
    notSaved: 'Não foi possível confirmar a gravação. Atualize a prévia e confira a sessão; dados anteriores não serão substituídos silenciosamente.',
    minimumTitle: 'Referência mínima do ACT — separada da previsão empresarial',
    minimumIntro: 'Valores na moeda original. Reajuste pelo custo de vida local e tarifa empresarial não consolidados; não comprovam valor devido ou pagamento. Estes valores não entram no total empresarial completo.',
    minimumSubtotal: 'Subtotal da referência mínima:', minimumItems: 'Itens e fontes da referência mínima',
    minimumPending: 'Rubricas com interpretação pendente — consulta, sem projeção', minimumFloor: 'piso impresso da refeição integral',
  },
  en: {
    causes: {
      act_missing: 'Employer and ACT not confirmed for these dates.',
      act_revoked: 'ACT application revoked for these dates.',
      act_expired: 'The ACT declaration does not cover these dates.',
      act_invalid: 'ACT declaration invalid on this device.',
      act_unavailable: 'ACT declaration unavailable on this device.',
    } as Record<FinancialActPendingCause, string>,
    unreadable: 'Could not read your allowance details on this device.',
    details: 'Details',
    unreadableDetail: 'Local declaration unavailable or invalid. Your data was preserved; valid personal references remain independent.',
    notice: 'Confirm your details to calculate allowances.',
    review: 'Review details',
    summary: 'Confirm or review the ACT financial application',
    pendingLabel: 'Pending items in this period',
    pendingDates: 'Pending dates in this period:',
    onlyAct: 'Confirming only unlocks the ACT reference; other pending items stay listed.',
    intro: 'Confirm once that the ACT (collective labour agreement) applies to the period, without entering rates month by month. This is the account holder’s local declaration, not a verification by the employer; it does not sync automatically between devices.',
    withoutDeclaration: 'Without this declaration, the ACT table is not applied automatically to your forecasts. Valid manual or personal values keep applying without it.',
    action: 'Action', apply: 'Declare application for the period', revoke: 'Revoke from a date',
    employer: 'Employer', select: 'Select explicitly', employerName: 'TAM Linhas Aéreas S/A — LATAM Brasil',
    profile: 'ACT profile', cabin: 'Cabin crew (Comissários)', pilot: 'Pilots (Pilotos)',
    coverage: 'I declare that my employment with TAM Linhas Aéreas S/A is covered by the selected ACT for the period, under clause 1.2, and is not within the exclusion of workers governed by Brazilian Law 7.064/1982 (Lei 7.064/1982).',
    scope: 'It does not automatically cover ABSA/LATAM Cargo, other LATAM employers or other airlines. A base or residence abroad does not, by itself, determine that exclusion.',
    applyFrom: 'Apply from', revokeFrom: 'Revoke from', end: 'Declaration end',
    history: 'A review or revocation follows the chosen date and keeps the history. An older declaration does not apply again after the most recent one ends. The national administrative reference requires a new review in December 2026.',
    prepare: 'Prepare declaration without saving', previewLabel: 'Financial application preview', previewTitle: 'Check the timeline before saving',
    to: 'to', ownerDeclaration: 'account holder’s declaration', noShared: 'No confirmed shared application', noSharedShort: 'No shared application',
    confirm: 'Confirm and save the declaration in this account', cancel: 'Cancel preview', historyTitle: 'Declaration history',
    incomplete: 'Select employer and profile, confirm the coverage and check the ACT validity dates.',
    saved: 'Financial declaration saved in this account and device. No personal rate or payment was changed.',
    notSaved: 'The save could not be confirmed. Refresh the preview and check the session; previous data will not be replaced silently.',
    minimumTitle: 'ACT minimum reference — separate from the employer forecast',
    minimumIntro: 'Amounts in the original currency. Local cost-of-living adjustment and employer rate not consolidated; they do not prove an amount due or a payment. These amounts are not part of the complete employer total.',
    minimumSubtotal: 'Minimum reference subtotal:', minimumItems: 'Minimum reference items and sources',
    minimumPending: 'Items with pending interpretation — lookup only, no projection', minimumFloor: 'printed floor for the full meal',
  },
};
type Copy = typeof COPY.pt;
const copyFor = (): Copy => getSavedLanguage() === 'pt' ? COPY.pt : COPY.en;
/** Re-renders on the app's language events; any non-Portuguese language uses the English copy. */
function useActCopy(): Copy {
  const [, setRevision] = useState(0);
  useEffect(() => {
    const sync = () => setRevision(value => value + 1);
    for (const name of ['crewcheck:language-change', 'crewcheck:locale-change', 'storage']) window.addEventListener(name, sync);
    return () => { for (const name of ['crewcheck:language-change', 'crewcheck:locale-change', 'storage']) window.removeEventListener(name, sync); };
  }, []);
  return copyFor();
}
// Calendar days (YYYY-MM-DD) shown in the selected language; the day itself never shifts (UTC noon).
const dayOf = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return y && m && d ? new Date(Date.UTC(y, m - 1, d, 12)) : null; };
const formatDay = (iso: string, lang: string, withYear: boolean) => {
  const day = dayOf(iso);
  if (!day) return iso;
  return lang === 'pt-BR'
    ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit', ...(withYear ? { year: 'numeric' } : {}) }).format(day)
    : new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) }).format(day);
};
// Meal/taxi labels come from the allowance calculator in Portuguese; the amount and the slot stay as calculated.
const ALLOWANCE_LABELS_EN: Record<string, string> = { 'Café': 'Breakfast', 'Almoço': 'Lunch', 'Jantar': 'Dinner', 'Ceia': 'Supper', 'Táxi': 'Taxi' };
/** Applicability only: no personal amount, receipt, payroll or employer verification is saved.
 * `pending` are the displayed period's items that wait on this declaration (from the forecast);
 * the notice depends on them, not on whether any declaration event exists. */
export default function FinancialActApplicability({ pending = [] }: { pending?: readonly { iso: string; actCause?: FinancialActPendingCause }[] }) {
  const privacy = useFinancialPrivacy(), currentSession = activeSession(), t = useActCopy();
  const lang = t === COPY.pt ? 'pt-BR' : 'en';
  const longDay = (iso: string) => formatDay(iso, lang, true);
  const [form, setForm] = useState(emptyForm), [, refresh] = useState(0), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [open, setOpen] = useState(false);
  const [draftSession, setDraftSession] = useState(currentSession);
  const [preview, setPreview] = useState<{ snapshot: FinancialActSnapshot; change: FinancialActChange; timeline: ReturnType<typeof financialActTimeline> } | null>(null);
  useEffect(() => {
    const update = () => refresh(value => value + 1);
    const reset = () => { setForm(emptyForm()); setDraftSession(activeSession()); setPreview(null); setMessage(''); setBusy(false); setOpen(false); update(); };
    const storage = (event: StorageEvent) => {
      if (event.storageArea !== localStorage) return;
      if (event.key === null || event.key?.startsWith('crewcheck_auth_')) reset();
      else { const owner = financialRateOwner(); if (owner && event.key === financialActStorageKey(owner)) { setPreview(null); update(); window.dispatchEvent(new Event('crewcheck:financial-config-changed')); } }
    };
    window.addEventListener('crewcheck:financial-config-changed', update);
    for (const event of ['crewcheck:auth-will-change', 'crewcheck:auth-changed', 'crewcheck:auth-expired']) window.addEventListener(event, reset);
    window.addEventListener('storage', storage);
    return () => { window.removeEventListener('crewcheck:financial-config-changed', update); for (const event of ['crewcheck:auth-will-change', 'crewcheck:auth-changed', 'crewcheck:auth-expired']) window.removeEventListener(event, reset); window.removeEventListener('storage', storage); };
  }, []);
  const snapshot = readFinancialActApplicability();
  if (!currentSession || snapshot.state === 'unauthenticated') return null;
  if (!snapshot.history || !['ready', 'missing'].includes(snapshot.state)) return <section className="cz-toolbox cc-act-notice" data-financial-act-context="unavailable" data-i18n-skip="true" lang={lang}>
    <p role="status"><strong>{t.unreadable}</strong></p>
    <details><summary>{t.details}</summary><p>{t.unreadableDetail}</p></details>
  </section>;
  const pendingDates = [...new Set(pending.map(item => item.iso).filter(Boolean))].sort();
  const pendingCauses = [...new Set(pending.map(item => item.actCause).filter((cause): cause is FinancialActPendingCause => Boolean(cause)))];
  const current = draftSession === currentSession ? form : emptyForm();
  const shownPreview = preview?.snapshot.session === currentSession && preview.snapshot.raw === snapshot.raw && preview.snapshot.isCurrent() ? preview : null;
  const update = (change: Partial<ReturnType<typeof emptyForm>>) => { setForm({ ...current, ...change }); setDraftSession(currentSession); setPreview(null); setMessage(''); };
  const prepare = () => {
    setMessage('');
    const change: FinancialActChange = current.active
      ? { from: current.from, through: current.through, active: true, employer: current.employer, role: current.role, coverage: current.coverage ? 'clause_1_2_included' : '' }
      : { from: current.from, through: current.through, active: false };
    const planned = planFinancialActChange(snapshot.history!, snapshot.history!.revision, change);
    if (!planned) { setPreview(null); setMessage('incomplete'); return; }
    setPreview({ snapshot, change, timeline: financialActTimeline(planned) });
  };
  const save = async () => {
    if (!shownPreview || !shownPreview.snapshot.isCurrent()) return;
    const expected = shownPreview.snapshot.session;
    setBusy(true); setMessage('');
    const saved = await saveFinancialActApplicability({ snapshot: shownPreview.snapshot, change: shownPreview.change, reviewed: true });
    if (activeSession() !== expected) return;
    setBusy(false); setPreview(null);
    setMessage(saved ? 'saved' : 'notSaved');
    refresh(value => value + 1);
  };
  const needsAction = pendingDates.length > 0;
  const roleName = (role: string) => role === 'cabin' ? t.cabin : t.pilot;
  // Messages are stored as keys so a language switch never leaves a sentence in the other language.
  const messageText = message === 'incomplete' || message === 'saved' || message === 'notSaved' ? t[message] : message;
  return <section className={needsAction ? 'cz-toolbox cc-act-notice' : 'cc-act-discreet'} data-financial-act-context={snapshot.state} data-financial-act-pending={pendingDates.length} data-i18n-skip="true" lang={lang}>
    {needsAction && <>
      <p role="status"><strong>{t.notice}</strong></p>
      <button type="button" aria-expanded={open} onClick={() => setOpen(true)}>{t.review}</button>
    </>}
    <details open={open} onToggle={event => setOpen(event.currentTarget.open)}><summary>{t.summary}</summary>
      {needsAction && <section aria-label={t.pendingLabel} data-act-pending-section="true">
        {pendingCauses.map(cause => <p key={cause} data-act-cause={cause}>{t.causes[cause]}</p>)}
        <p><span>{t.pendingDates}</span> {pendingDates.map(iso => formatDay(iso, lang, false)).join(', ')}</p>
        <p>{t.onlyAct}</p>
      </section>}
      <p>{t.intro}</p>
      <p>{t.withoutDeclaration}</p>
      <label>{t.action}<select value={current.active ? 'apply' : 'revoke'} disabled={busy} onChange={event => update({ active: event.target.value === 'apply' })}><option value="apply">{t.apply}</option><option value="revoke">{t.revoke}</option></select></label>
      {current.active && <>
        <label>{t.employer}<select value={current.employer} disabled={busy} onChange={event => update({ employer: event.target.value })}><option value="">{t.select}</option><option value="TAM_LINHAS_AEREAS_SA">{t.employerName}</option></select></label>
        <label>{t.profile}<select value={current.role} disabled={busy} onChange={event => update({ role: event.target.value })}><option value="">{t.select}</option><option value="cabin">{t.cabin}</option><option value="pilot">{t.pilot}</option></select></label>
        <label><input type="checkbox" checked={current.coverage} disabled={busy} onChange={event => update({ coverage: event.target.checked })}/>{t.coverage}</label>
        <p>{t.scope}</p>
      </>}
      <label>{current.active ? t.applyFrom : t.revokeFrom}<input type="date" min={LATAM_ACT_FROM} max={LATAM_ACT_THROUGH} value={current.from} disabled={busy} onChange={event => update({ from: event.target.value })}/></label>
      <label>{t.end}<input type="date" min={current.from || LATAM_ACT_FROM} max={LATAM_ACT_THROUGH} value={current.through} disabled={busy} onChange={event => update({ through: event.target.value })}/></label>
      <p>{t.history}</p>
      <button type="button" disabled={busy} onClick={prepare}>{t.prepare}</button>
      {shownPreview && <section aria-label={t.previewLabel} data-act-preview="true"><h3>{t.previewTitle}</h3>
        {shownPreview.timeline.map(interval => <p key={interval.from}>{longDay(interval.from)} {t.to} {longDay(interval.through)}: {privacy.text(interval.selection.state === 'applicable' ? `TAM — ${roleName(interval.selection.event.role)} — ${t.ownerDeclaration}` : t.noShared)}</p>)}
        <button type="button" disabled={busy} onClick={() => void save()}>{t.confirm}</button>
        <button type="button" disabled={busy} onClick={() => setPreview(null)}>{t.cancel}</button>
      </section>}
      {snapshot.history.events.length > 0 && <details><summary>{t.historyTitle}</summary>{financialActTimeline(snapshot.history).map(interval => <p key={interval.from}>{longDay(interval.from)} {t.to} {longDay(interval.through)}: {privacy.text(interval.selection.state === 'applicable' ? `ACT ${roleName(interval.selection.event.role)}` : t.noSharedShort)}</p>)}</details>}
    </details>
    {messageText && <p role="status">{messageText}</p>}
  </section>;
}

export function AllowanceMinimumReference({ rows, totals, inspections }: {
  rows: readonly { iso: string; label: string; currency: string; value: number; source: string }[];
  totals: Record<string, number>;
  inspections: readonly { iso: string; currency: string; publishedFloorMinor: number; reason: string }[];
}) {
  const privacy = useFinancialPrivacy(), t = useActCopy();
  if (!rows.length && !inspections.length) return null;
  const lang = t === COPY.pt ? 'pt-BR' : 'en';
  // Same amount and currency; only the number format follows the selected language.
  const money = (value: number, currency: string) => privacy.amount(value.toLocaleString(lang === 'pt-BR' ? 'pt-BR' : 'en-GB', { style: 'currency', currency }));
  const label = (value: string) => lang === 'pt-BR' ? value : ALLOWANCE_LABELS_EN[value] || value;
  return <section className="cz-toolbox" data-allowance-minimum-reference data-i18n-skip="true" lang={lang}>
    <h2>{t.minimumTitle}</h2>
    <p>{t.minimumIntro}</p>
    {Object.entries(totals).map(([currency, value]) => <p key={currency}>{t.minimumSubtotal} {money(value, currency)}</p>)}
    <details><summary>{t.minimumItems}</summary>{rows.map((row, index) => <p key={row.iso + ':' + index}>{formatDay(row.iso, lang, true)} · <span lang={lang === 'pt-BR' || ALLOWANCE_LABELS_EN[row.label] ? lang : 'pt-BR'}>{label(row.label)}</span> · {money(row.value, row.currency)}<small lang="pt-BR">{privacy.text(row.source)}</small></p>)}</details>
    {inspections.length > 0 && <details><summary>{t.minimumPending}</summary>{inspections.map((item, index) => <p key={item.iso + ':' + index}>{formatDay(item.iso, lang, true)} · {t.minimumFloor} {money(item.publishedFloorMinor / 100, item.currency)}<small lang="pt-BR">{privacy.text(item.reason)}</small></p>)}</details>}
  </section>;
}
