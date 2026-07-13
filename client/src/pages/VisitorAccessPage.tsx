import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Building2, CalendarDays, KeyRound, LifeBuoy, Loader2, LogOut, Map, MessageCircle, Plane, Send, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import '../visitor-v13-8.css';

type VisitorData = {
  visitor: { displayName: string; permissions: Record<string, boolean> };
  owner: { display_name?: string; displayName?: string; public_id?: string; publicId?: string };
  roster?: { year?: number; month?: number; base?: string; days?: any[] } | null;
  stays?: any[];
};

async function visitorRequest(path: string, init?: RequestInit) {
  const response = await fetch(path, { credentials: 'include', cache: 'no-store', ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    const error = Object.assign(new Error(payload?.message || 'Não foi possível concluir.'), { status: response.status, payload });
    throw error;
  }
  return payload;
}

function browserLocale() {
  const value = String(navigator.language || 'pt-BR').toLowerCase();
  return value.startsWith('en') ? 'en' : value.startsWith('es') ? 'es' : 'pt';
}

const copy = {
  pt: { title: 'Acesso de visitante', login: 'Entrar', invite: 'Aceitar convite', email: 'E-mail', password: 'Senha', temporary: 'Senha temporária', next: 'Nova senha', owner: 'ID do titular', logout: 'Sair', roster: 'Escala', hotels: 'Pernoites', map: 'Mapa', chat: 'Chat', message: 'Mensagem', send: 'Enviar', emergency: 'Pedir ajuda', sendHelp: 'Enviar pedido de ajuda', helpMessage: 'Mensagem para o titular', noData: 'Nenhum dado compartilhado nesta aba.' },
  en: { title: 'Visitor access', login: 'Sign in', invite: 'Accept invitation', email: 'Email', password: 'Password', temporary: 'Temporary password', next: 'New password', owner: 'Owner ID', logout: 'Sign out', roster: 'Roster', hotels: 'Layovers', map: 'Map', chat: 'Chat', message: 'Message', send: 'Send', emergency: 'Ask for help', sendHelp: 'Send help request', helpMessage: 'Message to the owner', noData: 'No data was shared in this section.' },
  es: { title: 'Acceso de visitante', login: 'Entrar', invite: 'Aceptar invitación', email: 'Correo', password: 'Contraseña', temporary: 'Contraseña temporal', next: 'Nueva contraseña', owner: 'ID del titular', logout: 'Salir', roster: 'Escala', hotels: 'Pernoctas', map: 'Mapa', chat: 'Chat', message: 'Mensaje', send: 'Enviar', emergency: 'Pedir ayuda', sendHelp: 'Enviar solicitud de ayuda', helpMessage: 'Mensaje para el titular', noData: 'No hay datos compartidos en esta sección.' },
};

function formatDate(value: unknown) {
  const raw = String(value || '');
  const date = /^\d{4}-\d{2}-\d{2}/.test(raw) ? new Date(`${raw.slice(0, 10)}T12:00:00`) : new Date(raw);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date) : raw;
}

export default function VisitorAccessPage() {
  const token = useMemo(() => new URLSearchParams(window.location.search).get('token') || '', []);
  const [mode, setMode] = useState<'loading' | 'accept' | 'login' | 'portal'>('loading');
  const [invite, setInvite] = useState<any>(null);
  const [data, setData] = useState<VisitorData | null>(null);
  const [email, setEmail] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [ownerPublicId, setOwnerPublicId] = useState('');
  const [owners, setOwners] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'roster' | 'hotels' | 'map' | 'chat' | 'emergency'>('roster');
  const [helpMessage, setHelpMessage] = useState('');
  const [chat, setChat] = useState<any>(null);
  const [chatMessage, setChatMessage] = useState('');
  const t = copy[browserLocale()];

  async function loadPortal() {
    try {
      const result = await visitorRequest('/api/platform/visitor/data');
      setData(result);
      const allowed = result?.visitor?.permissions || {};
      setTab(allowed.roster ? 'roster' : allowed.hotels ? 'hotels' : allowed.map ? 'map' : allowed.chat ? 'chat' : 'emergency');
      setMode('portal'); setError(''); return true;
    }
    catch { return false; }
  }

  useEffect(() => {
    loadPortal().then(async (active) => {
      if (active) return;
      if (!token) { setMode('login'); return; }
      try {
        const info = await visitorRequest(`/api/platform/visitor/invite?token=${encodeURIComponent(token)}`);
        setInvite(info.visitor); setEmail(info.visitor.email || ''); setMode('accept');
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Convite inválido.'); setMode('login');
      }
    });
  }, [token]);

  async function accept() {
    if (newPassword.length < 10) { setError('A nova senha precisa ter pelo menos 10 caracteres.'); return; }
    setBusy(true); setError('');
    try {
      await visitorRequest('/api/platform/visitor/accept', { method: 'POST', body: JSON.stringify({ token, email, temporaryPassword, newPassword }) });
      await loadPortal();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível aceitar o convite.'); }
    finally { setBusy(false); }
  }

  async function login() {
    setBusy(true); setError('');
    try {
      await visitorRequest('/api/platform/visitor/login', { method: 'POST', body: JSON.stringify({ email, password, ownerPublicId }) });
      await loadPortal();
    } catch (reason: any) {
      if (reason?.payload?.code === 'OWNER_SELECTION_REQUIRED') setOwners(reason.payload.owners || []);
      setError(reason instanceof Error ? reason.message : 'Não foi possível entrar.');
    } finally { setBusy(false); }
  }

  async function logout() {
    await visitorRequest('/api/platform/visitor/logout', { method: 'POST', body: '{}' }).catch(() => undefined);
    setData(null); setMode('login');
  }

  async function emergency() {
    if (!confirm('Enviar um pedido de ajuda ao titular agora?')) return;
    setBusy(true);
    const location = await new Promise<{ latitude?: number; longitude?: number }>((resolve) => {
      if (!navigator.geolocation) return resolve({});
      navigator.geolocation.getCurrentPosition((position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }), () => resolve({}), { timeout: 8000, maximumAge: 60_000 });
    });
    try {
      const result = await visitorRequest('/api/platform/visitor/emergency', { method: 'POST', body: JSON.stringify({ message: helpMessage, ...location }) });
      toast.success(result.message); setHelpMessage('');
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : 'Não foi possível enviar.'); }
    finally { setBusy(false); }
  }

  async function openChat() {
    setTab('chat');
    try { setChat(await visitorRequest('/api/platform/visitor/chat')); }
    catch (reason) { toast.error(reason instanceof Error ? reason.message : 'Não foi possível abrir o chat.'); }
  }

  async function sendChatMessage() {
    if (!chatMessage.trim()) return;
    setBusy(true);
    try {
      setChat(await visitorRequest('/api/platform/visitor/chat', { method: 'POST', body: JSON.stringify({ message: chatMessage }) }));
      setChatMessage('');
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : 'Não foi possível enviar.'); }
    finally { setBusy(false); }
  }

  if (mode === 'loading') return <main className="cv-public"><section className="cv-state"><Loader2 className="cv-spin"/><h1>CrewCheck</h1></section></main>;
  if (mode === 'accept' || mode === 'login') return <main className="cv-public cv-access"><header className="cv-brand"><span><Plane/></span><div><strong>CrewCheck</strong><small>{t.title}</small></div></header><section className="cv-auth"><ShieldCheck/><h1>{mode === 'accept' ? t.invite : t.login}</h1><p>{mode === 'accept' ? `Olá, ${invite?.displayName || ''}. Defina uma senha pessoal no primeiro acesso.` : 'Use os dados do convite enviado pelo CrewCheck.'}</p>{error && <div className="cv-inline-error"><AlertTriangle/>{error}</div>}<label><span>{t.email}</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} readOnly={mode === 'accept'}/></label>{mode === 'accept' ? <><label><span>{t.temporary}</span><input type="password" value={temporaryPassword} onChange={(event) => setTemporaryPassword(event.target.value)}/></label><label><span>{t.next}</span><input type="password" minLength={10} value={newPassword} onChange={(event) => setNewPassword(event.target.value)}/></label><button onClick={accept} disabled={busy || !temporaryPassword || newPassword.length < 10}>{busy ? <Loader2 className="cv-spin"/> : <KeyRound/>}{t.invite}</button></> : <><label><span>{t.password}</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)}/></label>{owners.length > 1 && <label><span>{t.owner}</span><select value={ownerPublicId} onChange={(event) => setOwnerPublicId(event.target.value)}><option value="">Selecione</option>{owners.map((owner) => <option key={owner.publicId} value={owner.publicId}>{owner.displayName} · {owner.publicId}</option>)}</select></label>}<button onClick={login} disabled={busy || !email || !password || (owners.length > 1 && !ownerPublicId)}>{busy ? <Loader2 className="cv-spin"/> : <KeyRound/>}{t.login}</button></>}</section></main>;

  const permissions = data?.visitor.permissions || {};
  const days = data?.roster?.days || [];
  const airports = Array.from(new Set(days.flatMap((day: any) => (day.legs || []).flatMap((leg: any) => [leg.origin, leg.destination])).filter(Boolean)));
  return <main className="cv-public cv-portal"><header className="cv-brand"><span><Plane/></span><div><strong>CrewCheck</strong><small>{data?.owner?.display_name || data?.owner?.displayName}</small></div><button onClick={logout}><LogOut/>{t.logout}</button></header><section className="cv-hero"><div><small>{data?.visitor.displayName}</small><h1>{data?.roster?.month && data?.roster?.year ? `${String(data.roster.month).padStart(2, '0')}/${data.roster.year}` : t.title}</h1><p>Base {data?.roster?.base || '—'} · acesso definido pelo titular</p></div><ShieldCheck/></section><nav className="cv-tabs">{permissions.roster && <button className={tab === 'roster' ? 'active' : ''} onClick={() => setTab('roster')}><CalendarDays/>{t.roster}</button>}{permissions.hotels && <button className={tab === 'hotels' ? 'active' : ''} onClick={() => setTab('hotels')}><Building2/>{t.hotels}</button>}{permissions.map && <button className={tab === 'map' ? 'active' : ''} onClick={() => setTab('map')}><Map/>{t.map}</button>}{permissions.chat && <button className={tab === 'chat' ? 'active' : ''} onClick={openChat}><MessageCircle/>{t.chat}</button>}{permissions.emergency && <button className={tab === 'emergency' ? 'active' : ''} onClick={() => setTab('emergency')}><LifeBuoy/>{t.emergency}</button>}</nav>{tab === 'roster' && permissions.roster && <section className="cv-section"><header><CalendarDays/><div><h2>{t.roster}</h2><p>Programação autorizada pelo titular.</p></div></header>{days.length ? <div className="cv-days">{days.map((day: any, index: number) => <article key={`${day.date}-${index}`}><time>{formatDate(day.date)}</time><div><h3>{day.type || day.pairingCode || 'Programação'}</h3><p>{(day.legs || []).map((leg: any) => [leg.flightNumber || leg.flight, leg.origin && leg.destination ? `${leg.origin}→${leg.destination}` : '', leg.departure || leg.departureTime].filter(Boolean).join(' ')).join(' · ')}</p><small>{[day.presentation ? `Apresentação ${day.presentation}` : '', day.hotel || day.hotelName || ''].filter(Boolean).join(' · ')}</small></div></article>)}</div> : <div className="cv-empty">{t.noData}</div>}</section>}{tab === 'hotels' && permissions.hotels && <section className="cv-section"><header><Building2/><div><h2>{t.hotels}</h2><p>Somente pernoites marcados para visitantes.</p></div></header>{data?.stays?.length ? <div className="cv-stays">{data.stays.map((stay, index) => <article key={`${stay.stayDate}-${index}`}><b>{formatDate(stay.stayDate)}</b><span>{stay.hotelName}{stay.airport ? ` · ${stay.airport}` : ''}</span><small>{[stay.room ? `Quarto ${stay.room}` : '', stay.presentationTime ? `Apresentação ${stay.presentationTime}` : ''].filter(Boolean).join(' · ')}</small></article>)}</div> : <div className="cv-empty">{t.noData}</div>}</section>}{tab === 'map' && permissions.map && <section className="cv-section"><header><Map/><div><h2>{t.map}</h2><p>Aeroportos compartilhados neste período.</p></div></header><div className="cv-route-chips">{airports.map((airport) => <span key={String(airport)}>{String(airport)}</span>)}</div></section>}{tab === 'chat' && permissions.chat && <section className="cv-section cv-chat"><header><MessageCircle/><div><h2>{t.chat}</h2><p>Conversa privada com o titular.</p></div></header>{chat ? <><div className="cv-messages">{chat.messages?.map((item: any) => <p className={item.mine ? 'mine' : ''} key={item.id}><span>{item.body}</span><small>{new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(item.createdAt))}</small></p>)}</div><div className="cv-chat-compose"><input value={chatMessage} maxLength={2000} onChange={(event) => setChatMessage(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && sendChatMessage()} placeholder={t.message}/><button onClick={sendChatMessage} disabled={busy || !chatMessage.trim()}><Send/>{t.send}</button></div></> : <button onClick={openChat}><MessageCircle/>{t.chat}</button>}</section>}{tab === 'emergency' && permissions.emergency && <section className="cv-section cv-emergency"><header><LifeBuoy/><div><h2>{t.emergency}</h2><p>Envia e-mail e Telegram ao titular quando configurados. Não substitui serviços públicos de emergência.</p></div></header><label><span>{t.helpMessage}</span><textarea value={helpMessage} onChange={(event) => setHelpMessage(event.target.value)} maxLength={800} placeholder="Explique brevemente como o titular pode ajudar."/></label><button onClick={emergency} disabled={busy}>{busy ? <Loader2 className="cv-spin"/> : <LifeBuoy/>}{t.sendHelp}</button></section>}<footer><ShieldCheck/><span>O titular controla e pode revogar este acesso a qualquer momento.</span></footer></main>;
}
