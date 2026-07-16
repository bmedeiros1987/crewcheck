import { useEffect, useState } from 'react';
import { AlertTriangle, Bell, CheckCircle2, Flame, HeartPulse, LocateFixed, MapPin, Save, ShieldAlert, ShieldCheck, Siren, UsersRound } from 'lucide-react';
import { toast } from 'sonner';
import { v139Api } from '@/components/v139/api';
import { V139Header } from '@/components/v139/Shell';
import '@/components/v139/v139.css';
import '@/components/v1395/v1395.css';

const TYPES = [
  { id: 'fire', label: 'Fogo ou fumaça', Icon: Flame, detail: 'Hotel, aeronave, residência ou área próxima.' },
  { id: 'medical', label: 'Emergência médica', Icon: HeartPulse, detail: 'Mal-estar, alergia, acidente ou necessidade clínica.' },
  { id: 'security', label: 'Segurança ou violência', Icon: ShieldAlert, detail: 'Ameaça, assédio, violência ou situação insegura.' },
  { id: 'accident', label: 'Acidente ou deslocamento', Icon: Siren, detail: 'Acidente no trajeto ou necessidade de apoio imediato.' },
  { id: 'stranded', label: 'Sem transporte ou desamparado', Icon: MapPin, detail: 'Fora da base ou hotel sem suporte seguro.' },
  { id: 'other', label: 'Outra emergência', Icon: AlertTriangle, detail: 'Informe o essencial no campo de detalhes.' },
] as const;

type Preferences = {
  notifySavedContacts: boolean;
  notifyHotelCompanions: boolean;
  includeLocation: boolean;
  includeMedicalProfile: boolean;
};

type MedicalProfile = {
  bloodType: string;
  allergies: string;
  continuousMedication: string;
  medicalNotes: string;
  healthPlanProvider: string;
  healthPlanCode: string;
};

type DeliveryReport = {
  alertId: string;
  sent: number;
  failed: number;
  recipients: Array<{ name: string; source: string; ok: boolean }>;
};

const DEFAULT_PREFS: Preferences = {
  notifySavedContacts: true,
  notifyHotelCompanions: true,
  includeLocation: true,
  includeMedicalProfile: false,
};

const DEFAULT_PROFILE: MedicalProfile = {
  bloodType: '', allergies: '', continuousMedication: '', medicalNotes: '', healthPlanProvider: '', healthPlanCode: '',
};

function currentLocationUrl(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Localização indisponível neste dispositivo.'));
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(`https://www.google.com/maps?q=${position.coords.latitude},${position.coords.longitude}`),
      () => reject(new Error('Não consegui obter sua localização. Ative a permissão e tente novamente.')),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 },
    );
  });
}

export default function EmergencyCenterView() {
  const [kind, setKind] = useState('');
  const [details, setDetails] = useState('');
  const [locationUrl, setLocationUrl] = useState('');
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFS);
  const [profile, setProfile] = useState<MedicalProfile>(DEFAULT_PROFILE);
  const [consentMedicalShare, setConsentMedicalShare] = useState(false);
  const [deliveryReport, setDeliveryReport] = useState<DeliveryReport | null>(null);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    Promise.all([
      v139Api('/api/platform/emergency/preferences'),
      v139Api('/api/platform/emergency/profile'),
    ]).then(([preferencePayload, profilePayload]) => {
      setPreferences({ ...DEFAULT_PREFS, ...(preferencePayload.preferences || {}) });
      setProfile({ ...DEFAULT_PROFILE, ...(profilePayload.profile || {}) });
      setConsentMedicalShare(Boolean(profilePayload.consentMedicalShare));
    }).catch((error) => toast.error(error instanceof Error ? error.message : 'Não consegui carregar a Central de Emergência.'));
  }, []);

  async function locate() {
    setBusy('location');
    try {
      const url = await currentLocationUrl();
      setLocationUrl(url);
      toast.success('Localização pronta para o alerta.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Localização indisponível.');
    } finally {
      setBusy('');
    }
  }

  async function savePreferences() {
    setBusy('save');
    try {
      const profilePayload = await v139Api('/api/platform/emergency/profile', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...profile, consentMedicalShare }),
      });
      if (!profilePayload?.ok || !profilePayload?.saved) throw new Error(profilePayload?.message || 'O banco não confirmou o perfil médico.');
      await v139Api('/api/platform/emergency/preferences', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(preferences),
      });
      if (profile.healthPlanProvider === 'Amil' && ['S450', 'S750'].includes(profile.healthPlanCode)) {
        try { localStorage.setItem('crewcheck:amil-plan', profile.healthPlanCode); } catch {}
      }
      setProfile({ ...DEFAULT_PROFILE, ...(profilePayload.profile || profile) });
      setConsentMedicalShare(Boolean(profilePayload.consentMedicalShare));
      toast.success(profilePayload.message || 'Preferências e perfil médico protegidos.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não consegui salvar.');
    } finally {
      setBusy('');
    }
  }

  async function sendAlert() {
    if (!kind) return toast.info('Escolha o tipo de emergência.');
    const selected = TYPES.find((item) => item.id === kind);
    const confirmed = confirm(`CONFIRMAR ALERTA: ${selected?.label || kind}\n\nO CrewCheck tentará avisar os contatos salvos em Compartilhar e colegas que autorizaram presença no mesmo hotel. O número do quarto não será enviado.`);
    if (!confirmed) return;
    setBusy('send');
    try {
      let effectiveLocation = locationUrl;
      if (preferences.includeLocation && !effectiveLocation) {
        try { effectiveLocation = await currentLocationUrl(); setLocationUrl(effectiveLocation); } catch {}
      }
      const payload = await v139Api('/api/platform/emergency/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, details, locationUrl: effectiveLocation }),
      });
      setDeliveryReport({ alertId: String(payload.alertId || ''), sent: Number(payload.sent || 0), failed: Number(payload.failed || 0), recipients: Array.isArray(payload.recipients) ? payload.recipients : [] });
      toast.success(payload.message || 'Alerta enviado.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não consegui enviar o alerta. Acione o serviço público/local de emergência.');
    } finally {
      setBusy('');
    }
  }

  async function cancelAlert() {
    try {
      const payload = await v139Api('/api/platform/emergency/cancel', { method: 'POST', body: '{}' });
      if (payload.cancelled) setDeliveryReport(null);
      toast.success(payload.message || 'Alerta cancelado.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não consegui cancelar.');
    }
  }

  async function markAssisted() {
    try {
      const payload = await v139Api('/api/platform/emergency/assisted', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ alertId: deliveryReport?.alertId || '' }) });
      if (payload.assisted) setDeliveryReport(null);
      toast.success(payload.message || 'Situação atualizada.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não consegui avisar que você já está sendo assistido.');
    }
  }

  return <>
    <V139Header title="Central de Emergência" detail="Alerta opt-in para contatos do Compartilhar e colegas que autorizaram presença no mesmo hotel."/>
    <section className="cc139-grid">
      <article><UsersRound/><span>Destinatários</span><strong>Contatos + hotel</strong></article>
      <article><LocateFixed/><span>Localização</span><strong>{locationUrl ? 'Pronta' : 'Opcional'}</strong></article>
      <article><ShieldCheck/><span>Privacidade</span><strong>Quarto não enviado</strong></article>
    </section>
    <section className="cc139-card cc139-plan-card warn">
      <h2>Risco imediato</h2>
      <p>O CrewCheck complementa o pedido de ajuda, mas não substitui bombeiros, emergência médica, polícia, segurança do hotel ou autoridades locais.</p>
    </section>
    <section className="cc139-card">
      <h2>1. Escolha a emergência</h2>
      <div className="cc139-choices">
        {TYPES.map(({ id, label, Icon, detail }) => <button key={id} className={kind === id ? 'active' : ''} onClick={() => setKind(id)} title={detail}><Icon/>{label}</button>)}
      </div>
      <div className="cc139-form">
        <label className="wide">Detalhes essenciais
          <input value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Ex.: estou no lobby, preciso de ajuda médica" maxLength={500}/>
        </label>
        <label className="wide">Localização
          <input value={locationUrl} onChange={(event) => setLocationUrl(event.target.value)} placeholder="Link do mapa, opcional"/>
        </label>
      </div>
      <div className="cc139-actions">
        <button onClick={locate} disabled={Boolean(busy)}><LocateFixed/> {busy === 'location' ? 'Localizando…' : 'Usar localização atual'}</button>
        <button className="danger" onClick={sendAlert} disabled={!kind || Boolean(busy)}><Siren/> {busy === 'send' ? 'Enviando alerta…' : 'Confirmar e enviar alerta'}</button>
        <button onClick={cancelAlert}><CheckCircle2/> Estou bem / cancelar alerta</button>
      </div>
      {deliveryReport && <div className="cc139-delivery-report" role="status"><strong>Alerta entregue a {deliveryReport.sent} contato(s)</strong><ul>{deliveryReport.recipients.map((recipient, index) => <li key={`${recipient.name}-${index}`} className={recipient.ok ? 'ok' : 'failed'}>{recipient.ok ? '✓' : '×'} {recipient.name} · {recipient.source === 'same-hotel' ? 'mesmo hotel' : 'Compartilhar'}</li>)}</ul><button className="primary" onClick={markAssisted}><ShieldCheck/> Já estou sendo assistido</button><small>Ao confirmar, todos que receberam o alerta serão avisados para não se deslocarem.</small></div>}
    </section>
    <section className="cc139-card">
      <h2>2. Quem pode receber</h2>
      <div className="cc139-form">
        <label><input type="checkbox" checked={preferences.notifySavedContacts} onChange={(event) => setPreferences({ ...preferences, notifySavedContacts: event.target.checked })}/> Contatos salvos em Compartilhar</label>
        <label><input type="checkbox" checked={preferences.notifyHotelCompanions} onChange={(event) => setPreferences({ ...preferences, notifyHotelCompanions: event.target.checked })}/> Colegas que autorizaram presença no mesmo hotel</label>
        <label><input type="checkbox" checked={preferences.includeLocation} onChange={(event) => setPreferences({ ...preferences, includeLocation: event.target.checked })}/> Incluir localização quando disponível</label>
        <label><input type="checkbox" checked={preferences.includeMedicalProfile} onChange={(event) => setPreferences({ ...preferences, includeMedicalProfile: event.target.checked })}/> Incluir perfil médico somente em alerta médico</label>
      </div>
      <p>A localização e os dados médicos são enviados apenas quando as opções correspondentes estiverem ativadas. O quarto nunca é incluído na mensagem coletiva.</p>
    </section>
    <section className="cc139-card">
      <h2>3. Perfil médico protegido</h2>
      <p>Esses dados ficam cifrados no banco e só entram em uma emergência médica quando houver consentimento explícito.</p>
      <div className="cc139-form">
        <label>Tipo sanguíneo<input value={profile.bloodType} onChange={(event) => setProfile({ ...profile, bloodType: event.target.value })} placeholder="Ex.: O+"/></label>
        <label>Alergias<input value={profile.allergies} onChange={(event) => setProfile({ ...profile, allergies: event.target.value })} placeholder="Nenhuma ou descreva"/></label>
        <label>Medicamento contínuo<input value={profile.continuousMedication} onChange={(event) => setProfile({ ...profile, continuousMedication: event.target.value })} placeholder="Nome e dose, se aplicável"/></label>
        <label>Observações médicas<input value={profile.medicalNotes} onChange={(event) => setProfile({ ...profile, medicalNotes: event.target.value })} placeholder="Condição relevante"/></label>
        <label>Operadora do plano<select value={profile.healthPlanProvider} onChange={(event) => setProfile({ ...profile, healthPlanProvider: event.target.value, healthPlanCode: event.target.value === 'Amil' ? profile.healthPlanCode : '' })}><option value="">Não informado</option><option value="Amil">Amil</option><option value="Outro">Outro plano</option></select></label>
        <label>Plano/rede{profile.healthPlanProvider === 'Amil' ? <select value={profile.healthPlanCode} onChange={(event) => setProfile({ ...profile, healthPlanCode: event.target.value })}><option value="">Selecione</option><option value="S450">S450</option><option value="S750">S750</option></select> : <input value={profile.healthPlanCode} onChange={(event) => setProfile({ ...profile, healthPlanCode: event.target.value })} placeholder="Nome ou código da rede"/>}</label>
        <label className="wide"><input type="checkbox" checked={consentMedicalShare} onChange={(event) => setConsentMedicalShare(event.target.checked)}/> Autorizo o envio desses dados em uma emergência médica confirmada.</label>
      </div>
      <div className="cc139-actions"><button className="primary" onClick={savePreferences} disabled={Boolean(busy)}><Save/> {busy === 'save' ? 'Salvando…' : 'Salvar proteção e preferências'}</button></div>
    </section>
    <section className="cc139-card"><Bell/><h2>Telegram</h2><p>Depois de vincular o bot, envie <b>/emergencia</b>. O bot mostrará botões por tipo e solicitará confirmação antes do disparo.</p></section>
  </>;
}
