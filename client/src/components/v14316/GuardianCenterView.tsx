import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Download, ExternalLink, HeartPulse, KeyRound, QrCode, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { authFetch, captureAuthSession, type AuthUser } from '@/lib/authClient';
import './control-center.css';
import HealthLockscreenCard from '@/components/health/HealthLockscreenCard';

import { readHealthDraft, persistHealthDraft, type HealthDraftSession } from '@/lib/healthDraftCache';

type GuardianResult = { id: string; token: string; url: string; expiresInHours: number };

export default function GuardianCenterView() {
  const [session, setSession] = useState<HealthDraftSession | null>(null);
  // Retain only this mounted account's existing revocation handle while masked.
  // Never persist the bearer link or reconstruct it from an unverified cache.
  const [result, setResult] = useState<GuardianResult | null>(null);
  const cardFence = useRef<ReturnType<typeof captureAuthSession> | null>(null);
  const [status, setStatus] = useState('Confirmando sua sessão…');
  const epoch = useRef(0);
  const [recheck, setRecheck] = useState(0);
  const content = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    let mounted = true;
    let verification: AbortController | null = null;
    const lock = (message: string, discardCard = false) => {
      epoch.current += 1;
      verification?.abort(); verification = null;
      if (content.current) content.current.hidden = true;
      setSession(null); setStatus(message);
      if (discardCard) { cardFence.current = null; setResult(null); }
    };
    const verify = async () => {
      lock('Confirmando sua sessão…');
      const ticket = epoch.current;
      let snapshot: ReturnType<typeof captureAuthSession>;
      try { snapshot = captureAuthSession(); } catch { setStatus('Entre novamente para abrir Saúde.'); return; }
      if (!snapshot.token || !snapshot.owner) { lock('Entre na sua conta para abrir Saúde.', true); return; }
      const controller = new AbortController(); verification = controller;
      const timer = window.setTimeout(() => controller.abort(), 10000);
      try {
        const response = await authFetch<{ user: AuthUser }>('/api/auth/me', { cache: 'no-store', signal: controller.signal });
        if (!mounted || ticket !== epoch.current || !snapshot.isCurrent()) return;
        const owner = String(response.user?.id || response.user?.email || '').trim().toLowerCase();
        if (!owner || owner !== snapshot.owner || response.user?.role === 'visitor') {
          lock('Não foi possível confirmar a conta. Entre novamente para abrir Saúde.', true); return;
        }
        const current = { owner, user: response.user, isCurrent: () => mounted && ticket === epoch.current && snapshot.isCurrent() };
        if (cardFence.current && (!cardFence.current.isCurrent() || cardFence.current.owner !== owner)) { cardFence.current = null; setResult(null); }
        setSession(current); setStatus('');
      } catch {
        if (mounted && ticket === epoch.current) lock('Não foi possível confirmar sua sessão. Reconecte e tente novamente.');
      } finally { window.clearTimeout(timer); if (verification === controller) verification = null; }
    };
    const changing = () => lock('Sessão alterada. Dados de Saúde protegidos.', true);
    const suspend = () => lock('Dados de Saúde ocultos. Confirme sua sessão ao voltar.');
    const refresh = () => { void verify(); };
    const authRefresh = () => { changing(); refresh(); };
    const storage = (event: StorageEvent) => { if (event.key === null || event.key === 'crewcheck_auth_token' || event.key === 'crewcheck_auth_user') authRefresh(); };
    const visibility = () => { if (document.visibilityState === 'hidden') suspend(); else refresh(); };
    window.addEventListener('crewcheck:auth-will-change', changing);
    for (const name of ['crewcheck:auth-changed','crewcheck:auth-expired']) window.addEventListener(name, authRefresh);
    for (const name of ['focus','pageshow','online']) window.addEventListener(name, refresh);
    window.addEventListener('pagehide', suspend);
    window.addEventListener('storage', storage);
    document.addEventListener('visibilitychange', visibility);
    refresh();
    return () => {
      mounted = false; epoch.current += 1; verification?.abort();
      if (content.current) content.current.hidden = true;
      window.removeEventListener('crewcheck:auth-will-change', changing);
      for (const name of ['crewcheck:auth-changed','crewcheck:auth-expired']) window.removeEventListener(name, authRefresh);
      for (const name of ['focus','pageshow','online']) window.removeEventListener(name, refresh);
      window.removeEventListener('pagehide', suspend); window.removeEventListener('storage', storage);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [recheck]);
  const updateResult = (value: GuardianResult | null) => {
    if (!session?.isCurrent()) return;
    cardFence.current = value ? captureAuthSession() : null;
    setResult(value);
  };
  return <section aria-label="Saúde"><p role="status">{status}</p>{!session && <button type="button" onClick={() => setRecheck(value => value + 1)} disabled={status === 'Confirmando sua sessão…'}>Verificar sessão novamente</button>}<div ref={content} hidden={!session}>{session && <GuardianAccountForm key={epoch.current} session={session} result={result} onResult={updateResult}/>}</div></section>;
}

function downloadDataUrl(url: string, filename: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function GuardianAccountForm({ session, result, onResult }: { session: HealthDraftSession; result: GuardianResult | null; onResult(value: GuardianResult | null): void }) {
  const [form, setForm] = useState(() => readHealthDraft(session));
  const [qr, setQr] = useState('');
  const [busy, setBusy] = useState(false);
  const createPending = useRef(false);

  function updateForm(next: Parameters<typeof persistHealthDraft>[1]) {
    if (!session.isCurrent()) return;
    persistHealthDraft(session, next);
    setForm(next);
  }
  useEffect(() => {
    if (!result?.url) { setQr(''); return; }
    let active = true;
    QRCode.toDataURL(result.url, { width: 720, margin: 2, errorCorrectionLevel: 'H' }).then((value) => { if (active && session.isCurrent()) setQr(value); }).catch(() => { if (active && session.isCurrent()) setQr(''); });
    return () => { active = false; };
  }, [result?.url, session]);

  const filled = useMemo(() => [form.bloodType, form.allergies, form.medications, form.conditions, form.criticalNotes, form.contactPhone].filter((value) => String(value).trim()).length, [form]);

  async function create() {
    if (!session.isCurrent() || createPending.current || result) return;
    createPending.current = true; setBusy(true);
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
      if (!session.isCurrent()) return;
      onResult(response);
      toast.success('QR Saúde protegido criado.');
    } catch (error) {
      if (session.isCurrent()) toast.error(error instanceof Error ? error.message : 'Não foi possível criar o QR Saúde.');
    } finally { createPending.current = false; if (session.isCurrent()) setBusy(false); }
  }

  async function revoke() {
    if (!session.isCurrent() || !result?.id || !confirm('Revogar este QR? Quem tentar abrir depois não verá mais o cartão.')) return;
    if (!session.isCurrent()) return;
    setBusy(true);
    try {
      await authFetch(`/api/guardian/card?id=${encodeURIComponent(result.id)}`, { method: 'DELETE' });
      if (!session.isCurrent()) return;
      onResult(null); setQr('');
      toast.success('QR Saúde revogado.');
    } catch (error) { if (session.isCurrent()) toast.error(error instanceof Error ? error.message : 'Não foi possível revogar.'); }
    finally { if (session.isCurrent()) setBusy(false); }
  }

  async function copyLink() {
    if (!session.isCurrent() || !result?.url) return;
    try { await navigator.clipboard.writeText(result.url); if (session.isCurrent()) toast.success('Link Saúde copiado.'); }
    catch { if (session.isCurrent()) toast.error('Não foi possível copiar o link.'); }
  }

  return <section className="cc-control-shell cc-guardian-shell">
    <header className="cc-control-hero guardian"><span><ShieldCheck/></span><div><small>CREWCHECK SAÚDE</small><h1>Identificação protegida por QR Code</h1><p>Um cartão temporário, revogável e criptografado para situações de emergência. Você escolhe exatamente o que compartilhar.</p></div></header>

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
          <label>Nome exibido<input value={form.displayName} maxLength={120} onChange={(e) => updateForm({ ...form, displayName: e.target.value })}/></label>
          <label>ID CrewCheck<input value={form.crewId} maxLength={40} onChange={(e) => updateForm({ ...form, crewId: e.target.value })}/></label>
          <label>Tipo sanguíneo<input value={form.bloodType} maxLength={8} placeholder="Ex.: O+" onChange={(e) => updateForm({ ...form, bloodType: e.target.value.toUpperCase() })}/></label>
          <label>Validade<select value={form.validHours} onChange={(e) => updateForm({ ...form, validHours: Number(e.target.value) })}><option value={24}>24 horas</option><option value={72}>3 dias</option><option value={168}>7 dias</option><option value={720}>30 dias</option></select></label>
          <label className="wide">Alergias<textarea value={form.allergies} maxLength={600} onChange={(e) => updateForm({ ...form, allergies: e.target.value })}/></label>
          <label className="wide">Medicamentos de uso regular<textarea value={form.medications} maxLength={600} onChange={(e) => updateForm({ ...form, medications: e.target.value })}/></label>
          <label className="wide">Condições ou cuidados importantes<textarea value={form.conditions} maxLength={600} onChange={(e) => updateForm({ ...form, conditions: e.target.value })}/></label>
          <label className="wide">Observação crítica<textarea value={form.criticalNotes} maxLength={1000} placeholder="Somente o que seria útil em uma emergência" onChange={(e) => updateForm({ ...form, criticalNotes: e.target.value })}/></label>
        </div>
        <h3>Contato de emergência</h3>
        <div className="cc-control-form three">
          <label>Nome<input value={form.contactName} maxLength={120} onChange={(e) => updateForm({ ...form, contactName: e.target.value })}/></label>
          <label>Relação<input value={form.contactRelationship} maxLength={80} placeholder="Ex.: esposa" onChange={(e) => updateForm({ ...form, contactRelationship: e.target.value })}/></label>
          <label>Telefone<input value={form.contactPhone} maxLength={40} inputMode="tel" onChange={(e) => updateForm({ ...form, contactPhone: e.target.value })}/></label>
        </div>
        <button className="cc-primary" onClick={create} disabled={busy || Boolean(result) || !form.displayName.trim()}>{busy ? <RefreshCw className="cc-spin"/> : <QrCode/>}{result ? 'QR criado nesta sessão' : 'Criar QR Saúde'}</button>
      </section>

      <aside className="cc-control-card cc-guardian-preview">
        <h2>QR Saúde</h2>
        {qr ? <><div className="cc-qr-frame"><img src={qr} alt="QR Code do CrewCheck Saúde"/></div><strong>Válido por {result?.expiresInHours} horas</strong><p>O QR abre uma página somente leitura com as informações autorizadas.</p><div className="cc-control-actions"><button onClick={copyLink}><Copy/> Copiar link</button><button onClick={() => session.isCurrent() && qr && downloadDataUrl(qr, 'CrewCheck-Saude-QR.png')}><Download/> Baixar QR</button><a href={result?.url} onClick={(event) => { if (!session.isCurrent()) event.preventDefault(); }} target="_blank" rel="noreferrer"><ExternalLink/> Testar</a><button className="danger" onClick={revoke} disabled={busy}><Trash2/> Revogar</button></div></> : <div className="cc-empty-panel"><QrCode/><h3>Crie o cartão para exibir o QR</h3><p>Preencha apenas as informações que deseja disponibilizar.</p></div>}
      </aside>
    </div>
    <HealthLockscreenCard values={form} isCurrent={session.isCurrent}/>
  </section>;
}
