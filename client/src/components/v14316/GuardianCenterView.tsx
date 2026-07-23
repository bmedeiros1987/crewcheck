import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Download, ExternalLink, HeartPulse, KeyRound, QrCode, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { authFetch, getStoredUser } from '@/lib/authClient';
import './control-center.css';

type GuardianForm = {
  displayName: string;
  crewId: string;
  bloodType: string;
  allergies: string;
  medications: string;
  conditions: string;
  criticalNotes: string;
  contactName: string;
  contactRelationship: string;
  contactPhone: string;
  validHours: number;
};

type GuardianResult = { id: string; token: string; url: string; expiresInHours: number };

const FORM_KEY = 'crewcheck:guardian:form:v1';

function readForm(): GuardianForm {
  const user = getStoredUser();
  const fallback: GuardianForm = {
    displayName: String(user?.name || 'Tripulante'),
    crewId: String(user?.id || ''),
    bloodType: '', allergies: '', medications: '', conditions: '', criticalNotes: '',
    contactName: '', contactRelationship: '', contactPhone: '', validHours: 72,
  };
  try { return { ...fallback, ...JSON.parse(localStorage.getItem(FORM_KEY) || '{}') }; } catch { return fallback; }
}

function downloadDataUrl(url: string, filename: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export default function GuardianCenterView() {
  const [form, setForm] = useState<GuardianForm>(() => readForm());
  const [result, setResult] = useState<GuardianResult | null>(null);
  const [qr, setQr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { try { localStorage.setItem(FORM_KEY, JSON.stringify(form)); } catch {} }, [form]);
  useEffect(() => {
    if (!result?.url) { setQr(''); return; }
    QRCode.toDataURL(result.url, { width: 720, margin: 2, errorCorrectionLevel: 'H' }).then(setQr).catch(() => setQr(''));
  }, [result?.url]);

  const filled = useMemo(() => [form.bloodType, form.allergies, form.medications, form.conditions, form.criticalNotes, form.contactPhone].filter((value) => String(value).trim()).length, [form]);

  async function create() {
    setBusy(true);
    try {
      const response = await authFetch<GuardianResult & { ok: boolean }>('/api/guardian/card', {
        method: 'POST',
        body: JSON.stringify({
          displayName: form.displayName,
          crewId: form.crewId,
          bloodType: form.bloodType,
          allergies: form.allergies,
          medications: form.medications,
          conditions: form.conditions,
          criticalNotes: form.criticalNotes,
          emergencyContact: { name: form.contactName, relationship: form.contactRelationship, phone: form.contactPhone },
          validHours: form.validHours,
        }),
      });
      setResult(response);
      toast.success('QR Guardian protegido criado.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível criar o QR Guardian.');
    } finally { setBusy(false); }
  }

  async function revoke() {
    if (!result?.id || !confirm('Revogar este QR? Quem tentar abrir depois não verá mais o cartão.')) return;
    setBusy(true);
    try {
      await authFetch(`/api/guardian/card?id=${encodeURIComponent(result.id)}`, { method: 'DELETE' });
      setResult(null); setQr('');
      toast.success('QR Guardian revogado.');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Não foi possível revogar.'); }
    finally { setBusy(false); }
  }

  async function copyLink() {
    if (!result?.url) return;
    try { await navigator.clipboard.writeText(result.url); toast.success('Link Guardian copiado.'); }
    catch { toast.info(result.url); }
  }

  return <section className="cc-control-shell cc-guardian-shell">
    <header className="cc-control-hero guardian"><span><ShieldCheck/></span><div><small>CREWCHECK GUARDIAN</small><h1>Identificação protegida por QR Code</h1><p>Um cartão temporário, revogável e criptografado para situações de emergência. Você escolhe exatamente o que compartilhar.</p></div></header>

    <div className="cc-control-kpis">
      <article><QrCode/><span>QR ativo nesta tela</span><strong>{result ? '1' : '0'}</strong></article>
      <article><HeartPulse/><span>Campos opcionais preenchidos</span><strong>{filled}/6</strong></article>
      <article><KeyRound/><span>Validade escolhida</span><strong>{form.validHours} h</strong></article>
    </div>

    <div className="cc-control-layout">
      <section className="cc-control-card">
        <h2>Informações do cartão</h2>
        <p className="cc-muted">Nada é publicado permanentemente. O QR expira, pode ser revogado e não mostra seu e-mail.</p>
        <div className="cc-control-form two">
          <label>Nome exibido<input value={form.displayName} maxLength={120} onChange={(e) => setForm({ ...form, displayName: e.target.value })}/></label>
          <label>ID CrewCheck<input value={form.crewId} maxLength={40} onChange={(e) => setForm({ ...form, crewId: e.target.value })}/></label>
          <label>Tipo sanguíneo<input value={form.bloodType} maxLength={8} placeholder="Ex.: O+" onChange={(e) => setForm({ ...form, bloodType: e.target.value.toUpperCase() })}/></label>
          <label>Validade<select value={form.validHours} onChange={(e) => setForm({ ...form, validHours: Number(e.target.value) })}><option value={24}>24 horas</option><option value={72}>3 dias</option><option value={168}>7 dias</option><option value={720}>30 dias</option></select></label>
          <label className="wide">Alergias<textarea value={form.allergies} maxLength={600} onChange={(e) => setForm({ ...form, allergies: e.target.value })}/></label>
          <label className="wide">Medicamentos de uso regular<textarea value={form.medications} maxLength={600} onChange={(e) => setForm({ ...form, medications: e.target.value })}/></label>
          <label className="wide">Condições ou cuidados importantes<textarea value={form.conditions} maxLength={600} onChange={(e) => setForm({ ...form, conditions: e.target.value })}/></label>
          <label className="wide">Observação crítica<textarea value={form.criticalNotes} maxLength={1000} placeholder="Somente o que seria útil em uma emergência" onChange={(e) => setForm({ ...form, criticalNotes: e.target.value })}/></label>
        </div>
        <h3>Contato de emergência</h3>
        <div className="cc-control-form three">
          <label>Nome<input value={form.contactName} maxLength={120} onChange={(e) => setForm({ ...form, contactName: e.target.value })}/></label>
          <label>Relação<input value={form.contactRelationship} maxLength={80} placeholder="Ex.: esposa" onChange={(e) => setForm({ ...form, contactRelationship: e.target.value })}/></label>
          <label>Telefone<input value={form.contactPhone} maxLength={40} inputMode="tel" onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}/></label>
        </div>
        <button className="cc-primary" onClick={create} disabled={busy || !form.displayName.trim()}>{busy ? <RefreshCw className="cc-spin"/> : <QrCode/>}{result ? 'Gerar um novo QR' : 'Criar QR Guardian'}</button>
      </section>

      <aside className="cc-control-card cc-guardian-preview">
        <h2>QR Guardian</h2>
        {qr ? <><div className="cc-qr-frame"><img src={qr} alt="QR Code do CrewCheck Guardian"/></div><strong>Válido por {result?.expiresInHours} horas</strong><p>O QR abre uma página somente leitura com as informações autorizadas.</p><div className="cc-control-actions"><button onClick={copyLink}><Copy/> Copiar link</button><button onClick={() => qr && downloadDataUrl(qr, 'CrewCheck-Guardian-QR.png')}><Download/> Baixar QR</button><a href={result?.url} target="_blank" rel="noreferrer"><ExternalLink/> Testar</a><button className="danger" onClick={revoke} disabled={busy}><Trash2/> Revogar</button></div></> : <div className="cc-empty-panel"><QrCode/><h3>Crie o cartão para exibir o QR</h3><p>Preencha apenas as informações que deseja disponibilizar.</p></div>}
      </aside>
    </div>
  </section>;
}
