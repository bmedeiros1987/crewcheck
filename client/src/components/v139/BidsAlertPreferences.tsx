import {WakeupPhonePreference} from '../notifications/WakeupPhonePreference';
import {focusPendingNotificationSection} from '@/lib/notificationNavigation';
import {cacheNotificationPreferences,legacyNotificationSettings,type NotificationSettings} from '@/lib/notificationPreferences';
import { CrewCheckPushDevice } from '../notifications/CrewCheckPushDevice';
import { useEffect, useRef, useState } from 'react';
import { authFetch, getToken } from '@/lib/authClient';
import { readStatus as readDeviceNotificationStatus } from '../notifications/DeviceNotificationReadiness';
import { DEFAULT_NOTIFICATION_CHANNELS, NOTIFICATION_CHANNELS, type NotificationChannel, type NotificationChannelSelection } from '../../../../shared/notificationChannelPreferences.mjs';
import './bids-alert-preferences.css';

type Preferences = { enabled: boolean; mode: 'auto' | 'manual'; preferredTime: string; quietStart: string; quietEnd: string; timezone: string; channels: NotificationChannelSelection; settings?: NotificationSettings };
type Snapshot = { ownerId:string; revision: number; preferences: Preferences; pending: string[]; alreadyDid: boolean; canConfirmAlreadyDid: boolean; campaign: { id: string; targetMonth: string } | null; plan: { candidateAt: string | null; timezone?: string; contextKey?: string; explanation?: string }; channelStates?: Array<{ channel: NotificationChannel; status: string; received: boolean | null }>; message: string };
const defaults: Preferences = { enabled: false, mode: 'auto', preferredTime: '09:00', quietStart: '22:00', quietEnd: '08:00', timezone: '', channels: DEFAULT_NOTIFICATION_CHANNELS };
const channelNames: Record<NotificationChannel, string> = { mobilePwa: 'CrewCheck', watch: 'Relógio', crewCierge: 'CrewCierge' };
const path = '/api/platform/notifications/preferences';
function channelStateLabel(snapshot: Snapshot | null, channel: NotificationChannel) {
  const state = snapshot?.channelStates?.find(item => item.channel === channel);
  if (state?.status === 'received' && state.received === true) return 'Recebimento comprovado para este evento.';
  if (state?.status === 'accepted_unconfirmed') return 'Aceito pelo canal; recebimento não confirmado.';
  if (state?.status === 'uncertain' || state?.status === 'received') return 'Resultado desconhecido; recebimento não confirmado.';
  return 'Sem prontidão ou recebimento comprovados para este aviso.';
}

export function BidsAlertPreferences() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [draft, setDraft] = useState<Preferences>({ ...defaults });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Consultando preferências desta conta…');
  const [conflict, setConflict] = useState(false);
  const [device, setDevice] = useState(readDeviceNotificationStatus);
  const epoch = useRef(0), ticket = useRef(0), dirty = useRef(false);
  async function load() {
    const identity = epoch.current, request = ++ticket.current;
    if (!getToken()) { setMessage('Faça login para consultar suas preferências.'); return; }
    try {
      const result = await authFetch<Snapshot>(path, { cache: 'no-store' });
      if (identity !== epoch.current || request !== ticket.current) return;
      setSnapshot(result); cacheNotificationPreferences(result.preferences,result.ownerId,result.revision);
      if (!dirty.current) setDraft(result.preferences);
      setMessage(result.message);
    } catch { if (identity === epoch.current && request === ticket.current) setMessage('Preferências não verificadas. Reconecte para consultar.'); }
  }
  useEffect(() => {
    const changed = () => { epoch.current++; ticket.current++; dirty.current = false; setSnapshot(null); setDraft({ ...defaults }); setBusy(false); setConflict(false); setMessage('Consultando preferências desta conta…'); load(); };
    const storage = (event: StorageEvent) => { if (['crewcheck_auth_token', 'crewcheck_auth_user'].includes(event.key || '')) changed(); };
    const online = () => { if (!dirty.current) load(); };
    load();
    window.addEventListener('crewcheck:auth-changed', changed); window.addEventListener('crewcheck:auth-expired', changed); window.addEventListener('storage', storage); window.addEventListener('online', online);
    return () => { epoch.current++; ticket.current++; window.removeEventListener('crewcheck:auth-changed', changed); window.removeEventListener('crewcheck:auth-expired', changed); window.removeEventListener('storage', storage); window.removeEventListener('online', online); };
  }, []);
  useEffect(() => {
    const refresh = () => setDevice(readDeviceNotificationStatus());
    window.addEventListener('crewcheck:native-ready', refresh); window.addEventListener('crewcheck:permissions-updated', refresh); window.addEventListener('focus', refresh);
    return () => { window.removeEventListener('crewcheck:native-ready', refresh); window.removeEventListener('crewcheck:permissions-updated', refresh); window.removeEventListener('focus', refresh); };
  }, []);
  function edit<K extends keyof Preferences>(key: K, value: Preferences[K]) { dirty.current = true; setDraft(current => ({ ...current, [key]: value })); }
  function chooseChannel(channel: NotificationChannel, value: boolean) { dirty.current = true; setDraft(current => ({ ...current, channels: { ...current.channels, individual: { ...current.channels.individual, [channel]: value } } })); }
  async function write(action: 'save-preferences' | 'already-did') {
    if (!snapshot || busy || !getToken()) return;
    if (conflict && action === 'save-preferences') {
      if (!window.confirm('Recarregar descarta as alterações ainda não salvas. Continuar?')) return;
      dirty.current = false; setConflict(false); await load(); return;
    }
    if (action === 'already-did' && !window.confirm('Você já enviou BIDS para esta janela no sistema oficial? Esta declaração não comprova aceitação da companhia.')) return;
    const identity = epoch.current; setBusy(true); ticket.current++;
    try {
      const result = await authFetch<Snapshot>(path, { method: 'POST', body: JSON.stringify({ action, ownerId:snapshot.ownerId, expectedRevision: snapshot.revision, requestId: crypto.randomUUID(), preferences: draft, contextKey: snapshot.plan.contextKey, confirmed: action === 'already-did' }) });
      if (identity !== epoch.current) return;
      dirty.current = false; setSnapshot(result); setDraft(result.preferences); cacheNotificationPreferences(result.preferences,result.ownerId,result.revision); setMessage(result.message); setConflict(false);
    } catch (error: any) {
      if (identity === epoch.current) { setMessage(error?.message || 'Não foi possível salvar. Nenhum envio está confirmado.'); if (error?.status === 409) setConflict(true); }
    } finally { if (identity === epoch.current) setBusy(false); }
  }
  useEffect(()=>{focusPendingNotificationSection();window.addEventListener('crewcheck:notification-section',focusPendingNotificationSection);return()=>window.removeEventListener('crewcheck:notification-section',focusPendingNotificationSection);},[]);
  const candidate = snapshot?.plan.candidateAt;
  return <section className="cc139-card cc-bids-alert-preferences" aria-label="Preferências de avisos BIDS">
    <h2>O que, por onde e quando notificar</h2>
    {snapshot?.pending.length ? <p>Janela oficial ainda não validada: {snapshot.pending.join(', ')}. Nenhum alerta foi programado; abertura não obriga notificação à meia-noite.</p> : null}
    <p role="status">{message}</p><CrewCheckPushDevice/>
    {candidate && <p>Sugestão: {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: snapshot!.plan.timezone }).format(new Date(candidate))} ({snapshot!.plan.timezone}). {snapshot!.plan.explanation} Ainda não agendada.</p>}
    {snapshot?.alreadyDid ? <p>Você declarou “Já fiz” para esta janela. Isso não comprova registro no sistema oficial.</p> : snapshot?.canConfirmAlreadyDid && <button type="button" disabled={busy} onClick={() => { write('already-did'); }}>Já fiz BIDS nesta janela</button>}
    <details>
      <summary>Notificações · horário e silêncio · {draft.mode === 'auto' ? 'Auto' : 'Manual'}</summary>
      <form onSubmit={event => { event.preventDefault(); write('save-preferences'); }}>
        <fieldset disabled={busy || !snapshot}>
          <legend>Preferências desta conta</legend>
          <p>As escolhas antigas deste aparelho não foram apagadas. <button type="button" onClick={()=>edit('settings',legacyNotificationSettings())}>Revisar e importar escolhas deste aparelho para esta conta</button> A importação só será confirmada ao salvar; não concede permissão nem envia aviso.</p>{draft.settings && <fieldset><legend>Outros avisos e despertador desta conta</legend>{[['crewcheck_pulse_enabled','CrewCheck Pulse — dentro do app'],['crewcheck_telegram_notifications','Telegram'],['crewcheck_traffic_alerts','Trânsito e saída'],['crewcheck_concierge','Concierge operacional']].map(([key,label])=><label key={key}><input type="checkbox" checked={draft.settings![key]===true} onChange={event=>edit('settings',{...draft.settings,[key]:event.target.checked})}/>{label}</label>)}<label>Antecedência do despertador<select value={String(draft.settings.crewcheck_wakeup_lead_minutes)} onChange={event=>edit('settings',{...draft.settings,crewcheck_wakeup_lead_minutes:Number(event.target.value)})}>{[60,75,90,120].map(value=><option key={value} value={value}>{value} minutos</option>)}</select></label><label>Canal preferido do despertador<select value={String(draft.settings.crewcheck_wakeup_channel)} onChange={event=>edit('settings',{...draft.settings,crewcheck_wakeup_channel:event.target.value})}><option value="telegram">Mensagem Telegram</option><option value="telegram-call">Ligação Telegram</option><option value="ligacao">Ligação telefônica — disponibilidade pendente</option><option value="ambos">Mensagem e ligação — disponibilidade pendente</option></select></label><label>Chat Telegram já vinculado<input value={String(draft.settings.crewcheck_telegram_chat_id)} onChange={event=>edit('settings',{...draft.settings,crewcheck_telegram_chat_id:event.target.value})}/></label><p>Preferir um canal não verifica vínculo nem autoriza chamada paga. Nenhum teste ou envio acontece ao salvar.</p></fieldset>}
          {!draft.settings&&<p>Antes de informar o primeiro número, revise e importe as escolhas deste aparelho para esta conta. As outras preferências não serão substituídas por valores automáticos.</p>}
          <WakeupPhonePreference ownerId={snapshot?.ownerId} disabled={!draft.settings} value={snapshot?String(draft.settings?.crewcheck_wakeup_phone||''):undefined} onChange={value=>{if(draft.settings)edit('settings',{...draft.settings,crewcheck_wakeup_phone:value});}}/>
          <label className="cc-bids-alert-optin"><input type="checkbox" checked={draft.enabled} onChange={event => edit('enabled', event.target.checked)} /> Quero avisos BIDS quando a janela estiver validada</label>
          <fieldset>
            <legend>Onde prefiro receber</legend>
            <label className="cc-bids-alert-optin"><input type="checkbox" checked={draft.channels.all} onChange={event => edit('channels', { ...draft.channels, all: event.target.checked })} /> Todos</label>
            <p>Todos inclui CrewCheck, Relógio e CrewCierge. Ao desligar, suas escolhas individuais voltam. Seleção não concede permissão nem confirma recebimento.</p>
            <fieldset disabled={draft.channels.all}>
              <legend>Canais individuais</legend>
              {NOTIFICATION_CHANNELS.map(channel => <label className="cc-bids-alert-optin" key={channel}><input type="checkbox" checked={draft.channels.all || draft.channels.individual[channel]} onChange={event => chooseChannel(channel, event.target.checked)} aria-describedby={`bids-channel-${channel}`} /> {channelNames[channel]}</label>)}
            </fieldset>
            <p id="bids-channel-mobilePwa">CrewCheck: {device.native ? device.status.notifications === false ? 'permita notificações nas configurações deste aparelho.' : device.status.notifications === true && device.status.notificationAppEnabled === true && device.status.notificationChannelEnabled === true ? 'permissão disponível neste aparelho; os avisos BIDS ainda não foram programados.' : 'permissão e disponibilidade neste aparelho ainda não verificadas.' : 'a disponibilidade de avisos com o CrewCheck fechado precisa ser verificada neste aparelho.'} {channelStateLabel(snapshot, 'mobilePwa')}</p>
            <p id="bids-channel-watch">Relógio: conexão e permissão ainda não verificadas para estes avisos. A preferência não confirma um relógio conectado. {channelStateLabel(snapshot, 'watch')}</p>
            <p id="bids-channel-crewCierge">CrewCierge: vínculo desta conta e envio ainda não verificados para estes avisos. {channelStateLabel(snapshot, 'crewCierge')}</p>
          </fieldset>
          <label>Modo <select value={draft.mode} onChange={event => edit('mode', event.target.value as Preferences['mode'])}><option value="auto">Auto — sugestão transparente</option><option value="manual">Manual — meu horário</option></select></label>
          <p>Auto pode sugerir um horário fora dos compromissos conhecidos da escala. Isso não confirma sono, descanso ou disponibilidade. Seu horário manual permanece salvo ao trocar de modo.</p>
          <label>Horário padrão para BIDS <input type="time" value={draft.preferredTime} required onChange={event => edit('preferredTime', event.target.value)} /></label>
          <label>Meu fuso <input type="text" value={draft.timezone} placeholder="Ex.: America/Sao_Paulo" required={draft.enabled} onChange={event => edit('timezone', event.target.value)} /></label>
          <p>Seu fuso é uma preferência pessoal; não confirma o fuso oficial da janela.</p>
          <label>Silêncio começa <input type="time" value={draft.quietStart} required onChange={event => edit('quietStart', event.target.value)} /></label>
          <label>Silêncio termina <input type="time" value={draft.quietEnd} required onChange={event => edit('quietEnd', event.target.value)} /></label>
          <p>Neste fluxo, o silêncio será respeitado. Sem um horário permitido antes do encerramento confirmado, a sugestão fica bloqueada. Sem encerramento conhecido, nenhuma urgência é inventada. Janelas cadastradas manualmente mantêm seus próprios alertas.</p>
          <button type="submit">{busy ? 'Salvando…' : conflict ? 'Recarregar preferências' : 'Salvar preferências'}</button>
        </fieldset>
      </form>
    </details>
  </section>;
}
