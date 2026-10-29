import './financial-act-applicability.css';
import { useEffect, useState } from 'react';
import { financialRateOwner, financialRateSession } from '@/lib/financialStatementLearning';
import { financialActStorageKey, financialActTimeline, planFinancialActChange, readFinancialActApplicability, saveFinancialActApplicability, type FinancialActChange, type FinancialActSnapshot } from '@/lib/financialActApplicability';
import { LATAM_ACT_FROM, LATAM_ACT_THROUGH } from '@/lib/latamAllowanceCatalog';
import { useFinancialPrivacy } from './FinancialPrivacy';

const emptyForm = () => ({ employer: '', role: '', from: '2026-01-01', through: LATAM_ACT_THROUGH, coverage: false, active: true });
const activeSession = () => { try { return financialRateSession(); } catch { return null; } };
/** Applicability only: no personal amount, receipt, payroll or employer verification is saved. */
export default function FinancialActApplicability() {
  const privacy = useFinancialPrivacy(), currentSession = activeSession();
  const [form, setForm] = useState(emptyForm), [, refresh] = useState(0), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [draftSession, setDraftSession] = useState(currentSession);
  const [preview, setPreview] = useState<{ snapshot: FinancialActSnapshot; change: FinancialActChange; timeline: ReturnType<typeof financialActTimeline> } | null>(null);
  useEffect(() => {
    const update = () => refresh(value => value + 1);
    const reset = () => { setForm(emptyForm()); setDraftSession(activeSession()); setPreview(null); setMessage(''); setBusy(false); update(); };
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
  if (!snapshot.history || !['ready', 'missing'].includes(snapshot.state)) return <section className="cz-toolbox" data-financial-act-context="unavailable"><h2>Aplicação financeira do ACT</h2><p role="status">Declaração local indisponível ou inválida. Os dados foram preservados; referências pessoais válidas continuam independentes.</p></section>;
  const current = draftSession === currentSession ? form : emptyForm();
  const shownPreview = preview?.snapshot.session === currentSession && preview.snapshot.raw === snapshot.raw && preview.snapshot.isCurrent() ? preview : null;
  const update = (change: Partial<ReturnType<typeof emptyForm>>) => { setForm({ ...current, ...change }); setDraftSession(currentSession); setPreview(null); setMessage(''); };
  const prepare = () => {
    setMessage('');
    const change: FinancialActChange = current.active
      ? { from: current.from, through: current.through, active: true, employer: current.employer, role: current.role, coverage: current.coverage ? 'clause_1_2_included' : '' }
      : { from: current.from, through: current.through, active: false };
    const planned = planFinancialActChange(snapshot.history!, snapshot.history!.revision, change);
    if (!planned) { setPreview(null); setMessage('Selecione empresa e perfil, confirme a abrangência e confira as datas da vigência do ACT.'); return; }
    setPreview({ snapshot, change, timeline: financialActTimeline(planned) });
  };
  const save = async () => {
    if (!shownPreview || !shownPreview.snapshot.isCurrent()) return;
    const expected = shownPreview.snapshot.session;
    setBusy(true); setMessage('');
    const saved = await saveFinancialActApplicability({ snapshot: shownPreview.snapshot, change: shownPreview.change, reviewed: true });
    if (activeSession() !== expected) return;
    setBusy(false); setPreview(null);
    setMessage(saved ? 'Declaração financeira salva nesta conta e dispositivo. Nenhuma tarifa pessoal ou pagamento foi alterado.' : 'Não foi possível confirmar a gravação. Atualize a prévia e confira a sessão; dados anteriores não serão substituídos silenciosamente.');
    refresh(value => value + 1);
  };
  return <section className="cz-toolbox" data-financial-act-context={snapshot.state}>
    <h2>Referência compartilhada de diárias</h2>
    <p>Confirme uma vez a aplicação do ACT ao período, sem digitar tarifas mês a mês. Declaração local do titular, não verificação pela empresa; não sincroniza automaticamente entre aparelhos.</p>
    {snapshot.history.events.length === 0 && <p role="status">Empresa e ACT ainda não confirmados. Sem essa declaração, a tabela do ACT não é aplicada automaticamente às suas previsões.</p>}
    <details><summary>Confirmar ou revisar aplicação financeira do ACT</summary>
      <label>Ação<select value={current.active ? 'apply' : 'revoke'} disabled={busy} onChange={event => update({ active: event.target.value === 'apply' })}><option value="apply">Declarar aplicação no período</option><option value="revoke">Revogar a partir de uma data</option></select></label>
      {current.active && <>
        <label>Empregador<select value={current.employer} disabled={busy} onChange={event => update({ employer: event.target.value })}><option value="">Selecione explicitamente</option><option value="TAM_LINHAS_AEREAS_SA">TAM Linhas Aéreas S/A — LATAM Brasil</option></select></label>
        <label>Perfil do ACT<select value={current.role} disabled={busy} onChange={event => update({ role: event.target.value })}><option value="">Selecione explicitamente</option><option value="cabin">Comissários</option><option value="pilot">Pilotos</option></select></label>
        <label><input type="checkbox" checked={current.coverage} disabled={busy} onChange={event => update({ coverage: event.target.checked })}/>Declaro que meu vínculo com TAM Linhas Aéreas S/A está abrangido pelo ACT selecionado no período, conforme cláusula 1.2, e não está na exclusão de trabalhadores regidos pela Lei 7.064/1982.</label>
        <p>Não abrange automaticamente ABSA/LATAM Cargo, outros empregadores LATAM ou outras companhias. Base ou domicílio no exterior, por si só, não determina essa exclusão.</p>
      </>}
      <label>{current.active ? 'Aplicar desde' : 'Revogar desde'}<input type="date" min={LATAM_ACT_FROM} max={LATAM_ACT_THROUGH} value={current.from} disabled={busy} onChange={event => update({ from: event.target.value })}/></label>
      <label>Fim da declaração<input type="date" min={current.from || LATAM_ACT_FROM} max={LATAM_ACT_THROUGH} value={current.through} disabled={busy} onChange={event => update({ through: event.target.value })}/></label>
      <p>A revisão/revogação respeita a data escolhida e preserva o histórico. Uma declaração antiga não volta a valer após o término da mais recente. A referência nacional administrativa exige nova revisão em dezembro/2026.</p>
      <button type="button" disabled={busy} onClick={prepare}>Preparar declaração sem gravar</button>
      {shownPreview && <section aria-label="Prévia da aplicação financeira"><h3>Confira a linha do tempo antes de salvar</h3>
        {shownPreview.timeline.map(interval => <p key={interval.from}>{interval.from} a {interval.through}: {privacy.text(interval.selection.state === 'applicable' ? `TAM — ${interval.selection.event.role === 'cabin' ? 'Comissários' : 'Pilotos'} — declaração do titular` : 'Sem aplicação compartilhada confirmada')}</p>)}
        <button type="button" disabled={busy} onClick={() => void save()}>Confirmar e salvar declaração nesta conta</button>
        <button type="button" disabled={busy} onClick={() => setPreview(null)}>Cancelar prévia</button>
      </section>}
      {snapshot.history.events.length > 0 && <details><summary>Histórico de declarações</summary>{financialActTimeline(snapshot.history).map(interval => <p key={interval.from}>{interval.from} a {interval.through}: {privacy.text(interval.selection.state === 'applicable' ? `ACT ${interval.selection.event.role === 'cabin' ? 'Comissários' : 'Pilotos'}` : 'Sem aplicação compartilhada')}</p>)}</details>}
    </details>
    {message && <p role="status">{message}</p>}
  </section>;
}

export function AllowanceMinimumReference({ rows, totals, inspections }: {
  rows: readonly { iso: string; label: string; currency: string; value: number; source: string }[];
  totals: Record<string, number>;
  inspections: readonly { iso: string; currency: string; publishedFloorMinor: number; reason: string }[];
}) {
  const privacy = useFinancialPrivacy();
  if (!rows.length && !inspections.length) return null;
  const money = (value: number, currency: string) => privacy.amount(value.toLocaleString('pt-BR', { style: 'currency', currency }));
  return <section className="cz-toolbox" data-allowance-minimum-reference>
    <h2>Referência mínima do ACT — separada da previsão empresarial</h2>
    <p>Valores na moeda original. Reajuste pelo custo de vida local e tarifa empresarial não consolidados; não comprovam valor devido ou pagamento. Estes valores não entram no total empresarial completo.</p>
    {Object.entries(totals).map(([currency, value]) => <p key={currency}>Subtotal da referência mínima: {money(value, currency)}</p>)}
    <details><summary>Itens e fontes da referência mínima</summary>{rows.map((row, index) => <p key={row.iso + ':' + index}>{row.iso} · {row.label} · {money(row.value, row.currency)}<small>{privacy.text(row.source)}</small></p>)}</details>
    {inspections.length > 0 && <details><summary>Rubricas com interpretação pendente — consulta, sem projeção</summary>{inspections.map((item, index) => <p key={item.iso + ':' + index}>{item.iso} · piso impresso da refeição integral {money(item.publishedFloorMinor / 100, item.currency)}<small>{privacy.text(item.reason)}</small></p>)}</details>}
  </section>;
}
