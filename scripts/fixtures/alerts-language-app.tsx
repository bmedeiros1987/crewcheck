import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AlertCenter } from '../../client/src/components/alerts/AlertCenter';
import { installGlobalStaticTranslations, saveCrewLanguage } from '../../client/src/lib/i18n';

// Synthetic account, roster and alerts only. The alerts mirror the engine's output shapes: a
// confirmed night sequence with date evidence (one gap), a pending sequence with possible dates,
// a sequence without proven dates, a single-date alert and an undated insufficient-history notice.
const win = window as any;
localStorage.setItem('crewcheck_auth_token', 'synthetic-local-only');
localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: 'alerts-language' }));
const days = ['30/11/2032', '01/12/2032', '02/12/2032', '04/12/2032', '05/12/2032', '31/12/2032'].map(date => ({ date, type: 'FLIGHT', flights: [] }));
const roster: any = { year: 2032, month: 12, days };
localStorage.setItem('crewcheck_roster_choice_v1_alerts-language', JSON.stringify({ owner: 'alerts-language', roster }));
const row = (date: string, journeyId: string) => ({ date, journeyId, description: 'Madrugada trabalhada: intervalo toca 00:00–06:00 BRT. Voo 30/11/2032 02:10 → 30/11/2032 05:40 BRT.' });
const alerts = [
  { severity: 'warning', code: 'NIGHT_WORKED_SEQUENCE', classification: 'atencao', title: 'Madrugadas trabalhadas consecutivas — revisar sequência real',
    description: '3 madrugada(s) efetivamente trabalhada(s) e consecutiva(s) detectada(s).', details: 'Critério aplicado: atividade trabalhada que toca 00:00–06:00 BRT.',
    evidence: 'Contagem comprovada: 3 jornada(s).', legalReference: 'RBAC 117', dateEvidence: [row('30/11/2032', 'j1'), row('01/12/2032', 'j2'), row('01/12/2032', 'j2'), row('04/12/2032', 'j3')] },
  { severity: 'warning', title: 'Mais de 6 períodos de 24h sem folga formal — revisar', description: 'Janela publicada.', date: '05/12/2032', classification: 'atencao' },
  { severity: 'warning', code: 'NIGHT_WORKED_SEQUENCE', classification: 'atencao', title: 'Madrugadas trabalhadas em sequência sem datas', description: 'Sequência sem datas comprovadas.', dateEvidence: [] },
];
const pending = [
  { severity: 'warning', code: 'night-sequence-pending', classification: 'dados_insuficientes', actionable: false, title: 'Sequência de madrugadas indeterminada',
    description: 'Horários não comprovados impedem concluir a sequência.', dateEvidence: [row('31/12/2032', 'p1'), row('02/12/2032', 'p0')] },
  { severity: 'warning', classification: 'dados_insuficientes', actionable: false, title: 'Histórico insuficiente para concluir a janela de 28 dias', description: 'Importe o mês anterior.' },
];
const freeze = (value: any): any => { if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); } return value; };
freeze(alerts); freeze(pending);
win.__alertsBefore = JSON.stringify([alerts, pending]);
win.__alerts = alerts; win.__pending = pending;
function Harness() {
  const [, refresh] = useState(0);
  win.__setLanguage = (language: string) => { saveCrewLanguage(language as any); refresh(value => value + 1); };
  // Like the account settings: stores pt-BR/en-US and only announces the change (no re-render here).
  win.__setLocaleSetting = (locale: string) => { localStorage.setItem('crewcheck_language', locale); window.dispatchEvent(new CustomEvent('crewcheck:locale-change', { detail: { locale } })); };
  return <main className="cz-app" data-version="synthetic" data-view="alerts">
    <AlertCenter alerts={alerts} roster={roster} onImport={() => undefined} onChoose={() => undefined} pendingAnalysis={pending}/>
    <nav className="cz-bottom-nav" aria-label="Navegação principal">{['FlightDeck', 'Escala', 'Saída', 'Alertas', 'Menu'].map(label => <button key={label}><span>{label}</span></button>)}</nav>
  </main>;
}
installGlobalStaticTranslations();
createRoot(document.getElementById('root')!).render(<React.StrictMode><Harness/></React.StrictMode>);
