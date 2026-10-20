import { useState } from 'react';
import { getStoredUser, getToken } from '@/lib/authClient';
import { MANUAL_GATE_EVENT, manualGateRevision, writeManualGateReview, type NextFlightGateInfo, type NextFlightLike } from '@/lib/nextFlightGate';
import { currentManualGateAccount } from './useNextFlightGate';
import { alertAccount, saveAlertReview } from '@/lib/alertReviewStore';
import { manualGateNoticeIdentity, manualGateNoticeScope } from '@/lib/manualGateNotices';
import { reconcileCrewCheckPulse } from '@/components/pulse/pulseRuntime';

export function sourceGateUpdateLabel(epochMs: number): string {
  if (!Number.isFinite(epochMs) || epochMs <= 0) return 'Horário não confirmado';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(epochMs) + ' UTC';
}

/** Every choice stays local to the same account/occurrence. No network or
 * automatic manual-store writes; a stale rendered action is refused. */
export function ManualGateReview({ event, info }: { event: NextFlightLike; info: NextFlightGateInfo }) {
  const owner = currentManualGateAccount(), token = getToken(), alertOwner = alertAccount(), scope = owner + '|' + event.id + '|' + token;
  const [message, setMessage] = useState({ scope: '', text: '' });
  const review = info.manualReview, manual = info.manual;
  if (!manual || review.state === 'none') return null;
  const revision = manualGateRevision(manual, owner);
  function choose(action: 'keep' | 'accept') {
    if (!token || owner === 'local' || getToken() !== token || currentManualGateAccount() !== owner) {
      setMessage({ scope, text: 'A conta ou sessão mudou. Reveja o portão.' }); return;
    }
    try {
      const user = getStoredUser();
      const result = writeManualGateReview(window.localStorage, owner, event, { action, expectedManualRevision: revision,
        expectedSourceFingerprint: review.candidate?.fingerprint || '', author: String(user?.name || user?.email || 'Este dispositivo') });
      if (!result.ok) { setMessage({ scope, text: result.message }); return; }
      if (review.candidate) saveAlertReview({ ...manualGateNoticeIdentity(event, manual!, review.candidate, owner), state: 'reviewed', title: 'Portão revisado por você', category: 'gate' }, alertOwner);
      reconcileCrewCheckPulse(manualGateNoticeScope(event, owner), []);
      setMessage({ scope, text: action === 'keep' ? 'Portão manual mantido neste dispositivo.' : `Portão ${result.entry.gate} aceito para ${info.flight} em ${info.operationalDate.split('-').reverse().join('/')}.` });
      window.dispatchEvent(new CustomEvent(MANUAL_GATE_EVENT, { detail: { eventId: event.id } }));
    } catch { setMessage({ scope, text: 'Não foi possível salvar a escolha neste dispositivo.' }); }
  }
  return <section className="cc-gate-review" aria-label="Revisão do portão automático">
    {review.state === 'matching' ? <p>A fonte também informa o portão {manual.gate}. Sua informação foi mantida.</p>
      : review.state === 'newer' && review.candidate ? <>
        <p role="note"><strong>Possível mudança de portão.</strong> Você informou {manual.gate}; a fonte configurada informa {review.candidate.gate}, com atualização do portão em {sourceGateUpdateLabel(review.candidate.sourceUpdatedAtEpochMs)}.</p>
        <div className="cz-tool-actions"><button type="button" disabled={!token || owner === 'local'} onClick={() => choose('accept')}>Usar portão {review.candidate.gate}</button><button type="button" disabled={!token || owner === 'local'} onClick={() => choose('keep')}>Manter portão {manual.gate}</button></div>
      </> : review.state === 'kept' ? <p>Você manteve o portão {manual.gate} em {sourceGateUpdateLabel(manual.sourceReview?.decidedAtEpochMs || 0)}. Essa atualização da fonte já foi revisada. Atualizações posteriores continuam sendo verificadas.</p>
      : <p>{review.state === 'older' ? 'A fonte não comprova uma atualização posterior à sua última confirmação.' : 'O horário de atualização do portão na fonte não foi comprovado.'} O portão {manual.gate} informado por você foi mantido.</p>}
    <p role="status" aria-live="polite">{message.scope === scope ? message.text : ''}</p>
  </section>;
}
