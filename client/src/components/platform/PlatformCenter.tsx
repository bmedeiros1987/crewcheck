import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { AlertTriangle, ArrowLeft, Check, Copy, Crown, KeyRound, Link2, Loader2, Lock, Mail, MessageCircle, QrCode, RefreshCcw, Send, ShieldCheck, Smartphone, UserPlus, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import '../../platform-v13-8.css';
import {
  answerConnection,
  acknowledgeGooglePlayPurchase,
  cancelSubscription,
  compareRoster,
  createRosterShare,
  createVisitor,
  createWebSubscription,
  defaultVisitorPermissions,
  getPlatformBilling,
  getPlatformCatalog,
  getPlatformProfile,
  hasGooglePlayBillingBridge,
  listConnections,
  listShares,
  listVisitors,
  loadVisitorChat,
  loadChat,
  queryGooglePlayProducts,
  requestConnection,
  restoreGooglePlayPurchases,
  revokeShare,
  revokeVisitor,
  sendChat,
  sendVisitorChat,
  startGooglePlayPurchase,
  updateVisitorPermissions,
  verifyGooglePlayPurchase,
  type PlatformBilling,
  type PlatformCatalog,
  type PlatformPermissions,
  type PlatformPlan,
  type PlatformProfile,
} from '../../lib/platformClient';

type Props = {
  mode: 'plans' | 'community';
  rosterKey?: string;
  onBack: () => void;
  onEmailPdf?: () => void;
};

const PERMISSION_LABELS: Array<[keyof PlatformPermissions, string, string]> = [
  ['roster', 'Escala', 'Dias e programação autorizados'],
  ['map', 'Mapa', 'Mapa do mês e cidades'],
  ['hotels', 'Hotel', 'Hotel compartilhado pelo titular'],
  ['room', 'Quarto', 'Dado sensível; mantenha desligado por padrão'],
  ['presentation', 'Apresentação', 'Horário e antecedência'],
  ['radar', 'Radar', 'Status operacional quando disponível'],
  ['contact', 'Contato', 'Canal definido pelo titular'],
  ['emergency', 'Pedir ajuda', 'Ação de emergência do visitante'],
  ['chat', 'Chat', 'Conversa interna autorizada'],
];

function money(value: number) {
  if (!value) return 'Grátis';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function billingLabel(status?: string) {
  const value = String(status || '').toLowerCase();
  if (value === 'lifetime') return 'Premium Unlimited';
  if (value === 'active') return 'Premium ativo';
  if (value === 'trialing') return 'Teste ativo';
  if (value === 'grace_period') return 'Período de carência';
  if (value === 'legacy_migration') return 'Premium em migração';
  if (value === 'pending') return 'Pagamento pendente';
  return 'CrewCheck Essencial';
}

function platformLabel() {
  return hasGooglePlayBillingBridge() ? 'Google Play' : 'CrewCheck Web';
}

function PageHead({ title, subtitle, onBack }: { title: string; subtitle: string; onBack: () => void }) {
  return <header className="cp-page-head"><button onClick={onBack} aria-label="Voltar"><ArrowLeft/></button><div><span>CrewCheck 13.8</span><h1>{title}</h1><p>{subtitle}</p></div></header>;
}

function LoadingCard({ text = 'Carregando dados seguros...' }: { text?: string }) {
  return <article className="cp-empty"><Loader2 className="cp-spin"/><strong>{text}</strong></article>;
}

function ErrorCard({ message, retry }: { message: string; retry: () => void }) {
  return <article className="cp-empty cp-error"><AlertTriangle/><strong>{message}</strong><button onClick={retry}><RefreshCcw/> Tentar novamente</button></article>;
}

function PlanCard({ plan, current, busy, playPrice, onSubscribe }: { plan: PlatformPlan; current?: string; busy: string; playPrice?: string; onSubscribe: (plan: PlatformPlan) => void }) {
  const active = current === plan.id;
  return <article className={`cp-plan ${active ? 'active' : ''} ${plan.id === 'premium_annual' ? 'featured' : ''}`}>
    <header><span>{plan.id === 'free' ? <ShieldCheck/> : <Crown/>}</span><div><small>{plan.cycle}</small><h2>{plan.name}</h2></div>{active && <b><Check/> Atual</b>}</header>
    <div className="cp-price"><strong>{playPrice || money(plan.value)}</strong>{plan.value > 0 && <span>/{plan.id === 'premium_annual' ? 'ano' : 'mês'}</span>}</div>
    {Boolean(plan.annualSavings) && <p className="cp-saving">Economia anual aproximada de {plan.annualSavings}%</p>}
    <ul>{plan.features.map((feature) => <li key={feature}><Check/>{feature}</li>)}</ul>
    <div className="cp-plan-limit"><Smartphone/><span><b>{plan.callLimit} ligações/mês</b><small>Franquia reinicia mensalmente; texto e lembrete local continuam.</small></span></div>
    {plan.id === 'free' && !active && <p className="cp-admin-note"><ShieldCheck/> O Essencial continua disponível quando não houver assinatura recorrente ativa.</p>}
    {!plan.adminGrantOnly && plan.id !== 'free' && !active && <button className="cp-primary" disabled={Boolean(busy)} onClick={() => onSubscribe(plan)}>{busy === plan.id ? <Loader2 className="cp-spin"/> : <Crown/>}{hasGooglePlayBillingBridge() ? 'Assinar pela Google Play' : 'Assinar no site'}</button>}
    {plan.adminGrantOnly && <p className="cp-admin-note"><Lock/> Concessão vitalícia somente pelo administrador; sem botão de cobrança.</p>}
  </article>;
}

export function SubscriptionCenter({ onBack }: Pick<Props, 'onBack'>) {
  const [catalog, setCatalog] = useState<PlatformCatalog | null>(null);
  const [profile, setProfile] = useState<PlatformProfile | null>(null);
  const [billing, setBilling] = useState<PlatformBilling | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [playProducts, setPlayProducts] = useState<Record<string, { formattedPrice?: string }>>({});

  async function load() {
    setError('');
    try {
      const [catalogResult, profileResult, billingResult] = await Promise.all([getPlatformCatalog(), getPlatformProfile(), getPlatformBilling()]);
      setCatalog(catalogResult);
      setProfile(profileResult.profile);
      setBilling({ ...profileResult.billing, ...billingResult });
      if (hasGooglePlayBillingBridge()) queryGooglePlayProducts(catalogResult.plans.map((plan) => plan.googlePlayProductId || '').filter(Boolean));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não consegui carregar a assinatura.');
    }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      if (!detail.productId || !detail.purchaseToken) return;
      setBusy('restore');
      verifyGooglePlayPurchase(detail.productId, detail.purchaseToken)
        .then((result) => { if (result.needsAcknowledgement) acknowledgeGooglePlayPurchase(detail.purchaseToken); toast.success(result.message || 'Compra Google Play confirmada.'); return load(); })
        .catch((err) => toast.error(err instanceof Error ? err.message : 'Não consegui confirmar a compra.'))
        .finally(() => setBusy(''));
    };
    window.addEventListener('crewcheck:billing-purchase', listener as EventListener);
    return () => window.removeEventListener('crewcheck:billing-purchase', listener as EventListener);
  }, []);
  useEffect(() => {
    const products = (event: Event) => {
      const values = (event as CustomEvent).detail?.products || [];
      setPlayProducts(Object.fromEntries(values.map((item: any) => [item.productId, item])));
    };
    const ready = () => catalog && queryGooglePlayProducts(catalog.plans.map((plan) => plan.googlePlayProductId || '').filter(Boolean));
    const errorListener = (event: Event) => toast.error((event as CustomEvent).detail?.message || 'Google Play indisponível.');
    const pending = () => toast.message('Compra pendente na Google Play. O acesso será liberado após a confirmação.');
    window.addEventListener('crewcheck:billing-products', products as EventListener);
    window.addEventListener('crewcheck:billing-ready', ready);
    window.addEventListener('crewcheck:billing-error', errorListener as EventListener);
    window.addEventListener('crewcheck:billing-pending', pending);
    return () => {
      window.removeEventListener('crewcheck:billing-products', products as EventListener);
      window.removeEventListener('crewcheck:billing-ready', ready);
      window.removeEventListener('crewcheck:billing-error', errorListener as EventListener);
      window.removeEventListener('crewcheck:billing-pending', pending);
    };
  }, [catalog]);

  async function subscribe(plan: PlatformPlan) {
    if (plan.id !== 'premium_monthly' && plan.id !== 'premium_annual') return;
    setBusy(plan.id);
    try {
      if (hasGooglePlayBillingBridge()) {
        if (!plan.googlePlayProductId) throw new Error('Produto Google Play não configurado.');
        startGooglePlayPurchase(plan.googlePlayProductId, profile?.publicId || '');
        toast.message('Conclua a compra na janela segura da Google Play.');
      } else {
        const cpf = window.prompt('CPF do titular para a cobrança web pelo Asaas') || '';
        if (!cpf.trim()) return;
        const result = await createWebSubscription(plan.id, cpf);
        if (result.checkoutUrl) window.open(result.checkoutUrl, '_blank', 'noopener,noreferrer');
        toast.success(result.message || 'Assinatura web criada.');
        await load();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não consegui iniciar a assinatura.');
    } finally { setBusy(''); }
  }

  function restore() {
    try {
      setBusy('restore');
      restoreGooglePlayPurchases();
      toast.message('Consultando compras vinculadas à sua conta Google Play...');
      window.setTimeout(() => setBusy(''), 5000);
    } catch (err) {
      setBusy('');
      toast.error(err instanceof Error ? err.message : 'Restauração indisponível.');
    }
  }

  async function manageSubscription() {
    if (!billing) return;
    setBusy('manage');
    try {
      if (billing.provider === 'google_play') {
        const product = encodeURIComponent(billing.productId || '');
        window.open(`https://play.google.com/store/account/subscriptions?sku=${product}&package=com.crewcheck.app`, '_blank', 'noopener,noreferrer');
        return;
      }
      if (!confirm('Cancelar a renovação da assinatura web?')) return;
      const result = await cancelSubscription();
      if (result.manageUrl) window.open(result.manageUrl, '_blank', 'noopener,noreferrer');
      toast.success(result.message || 'Assinatura atualizada.');
      await load();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Não consegui gerenciar a assinatura.'); }
    finally { setBusy(''); }
  }

  const usage = billing?.usage;
  const usedWidth = usage?.limit ? Math.min(100, Math.round((usage.used / usage.limit) * 100)) : 0;
  return <section className="cp-center">
    <PageHead onBack={onBack} title="Assinaturas" subtitle="Planos claros, compra adequada à plataforma e limite mensal de custos externos."/>
    {error ? <ErrorCard message={error} retry={load}/> : !catalog || !profile || !billing ? <LoadingCard/> : <>
      <article className="cp-current-plan">
        <div><span><Crown/></span><div><small>Plano atual · {platformLabel()}</small><h2>{billingLabel(billing.status)}</h2><p>ID do usuário: <b>{profile.publicId}</b></p></div></div>
        <div className="cp-usage"><header><span>Ligações do despertador</span><strong>{usage?.used || 0} de {usage?.limit || 0} usadas</strong></header><div><i style={{ width: `${usedWidth}%` }}/></div><small>{usage?.remaining || 0} disponíveis em {usage?.monthKey || 'este mês'}</small></div>
        <div className="cp-current-actions">{hasGooglePlayBillingBridge() && <button onClick={restore} disabled={Boolean(busy)}><RefreshCcw className={busy === 'restore' ? 'cp-spin' : ''}/> Restaurar compras</button>}{['google_play', 'asaas'].includes(String(billing.provider || '')) && <button onClick={manageSubscription} disabled={Boolean(busy)}><Lock/> Gerenciar ou cancelar</button>}</div>
      </article>
      <div className="cp-plans">{catalog.plans.map((plan) => <PlanCard key={plan.id} plan={plan} current={billing.plan} busy={busy} playPrice={plan.googlePlayProductId ? playProducts[plan.googlePlayProductId]?.formattedPrice : undefined} onSubscribe={subscribe}/>)}</div>
      <article className="cp-disclosures"><ShieldCheck/><div><h2>Antes de assinar</h2>{Object.values(catalog.disclosures).map((text) => <p key={text}>{text}</p>)}<p>O CrewCheck é apoio pessoal. Escala oficial, empresa e normas aplicáveis continuam prevalecendo.</p></div></article>
    </>}
  </section>;
}

function PermissionEditor({ value, onChange }: { value: PlatformPermissions; onChange: (next: PlatformPermissions) => void }) {
  const update = (key: keyof PlatformPermissions, checked: boolean) => {
    const next = { ...value, [key]: checked };
    if (key === 'hotels' && !checked) next.room = false;
    if (key === 'roster' && !checked) next.radar = false;
    if (!next.roster && !next.hotels) next.presentation = false;
    if (key === 'room' && checked) next.hotels = true;
    if (key === 'radar' && checked) next.roster = true;
    onChange(next);
  };
  return <div className="cp-permissions">{PERMISSION_LABELS.map(([key, label, detail]) => <label key={key} className={key === 'room' ? 'sensitive' : ''}><input type="checkbox" checked={value[key]} onChange={(event) => update(key, event.target.checked)}/><span><strong>{label}</strong><small>{detail}</small></span><i/></label>)}</div>;
}

function SharePanel({ rosterKey, onEmailPdf }: { rosterKey?: string; onEmailPdf?: () => void }) {
  const [shares, setShares] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<PlatformPermissions>({ ...defaultVisitorPermissions, hotels: true, room: false, chat: false });
  const [current, setCurrent] = useState<any>(null);
  const [qr, setQr] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() { try { setShares((await listShares()).shares || []); } catch {} }
  useEffect(() => { load(); }, []);
  async function create() {
    setBusy(true);
    try {
      const result = await createRosterShare({ rosterKey, kind: 'roster', expiresHours: 72, permissions });
      setCurrent(result);
      setQr(await QRCode.toDataURL(result.url, { width: 320, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#08243b', light: '#ffffff' } }));
      await load();
      toast.success('Link e QR temporários criados por 72 horas.');
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Não consegui criar o compartilhamento.'); }
    finally { setBusy(false); }
  }
  async function copy(value: string) { try { await navigator.clipboard.writeText(value); toast.success('Link copiado.'); } catch { toast.error('Não consegui copiar.'); } }
  async function remove(id: string) { try { await revokeShare(id); if (current?.id === id) { setCurrent(null); setQr(''); } await load(); toast.success('Compartilhamento revogado.'); } catch { toast.error('Não consegui revogar.'); } }
  return <div className="cp-stack">
    <article className="cp-box"><header><div><QrCode/><span><h2>QR e link temporário</h2><p>O QR contém somente um link revogável; nunca contém escala, hotel ou quarto diretamente.</p></span></div></header><PermissionEditor value={permissions} onChange={setPermissions}/><div className="cp-actions"><button className="cp-primary" onClick={create} disabled={busy}>{busy ? <Loader2 className="cp-spin"/> : <Link2/>} Criar por 72 horas</button>{onEmailPdf && <button onClick={onEmailPdf}><Mail/> Enviar escala + PDF por e-mail</button>}</div></article>
    {current && <article className="cp-share-result">{qr && <img src={qr} alt="QR code do link temporário da escala"/>}<div><small>Link temporário</small><strong>{current.url}</strong><p>Expira em {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(current.expiresAt))}.</p><div className="cp-actions"><button onClick={() => copy(current.url)}><Copy/> Copiar</button>{navigator.share && <button onClick={() => navigator.share({ title: 'Escala CrewCheck', text: 'Acesso temporário à minha escala', url: current.url }).catch(() => undefined)}><Send/> Compartilhar</button>}<button className="danger" onClick={() => remove(current.id)}><X/> Revogar</button></div></div></article>}
    <article className="cp-box"><h2>Compartilhamentos recentes</h2>{shares.length ? <div className="cp-list">{shares.map((share) => <div key={share.id}><span><strong>{share.kind === 'roster' ? 'Escala' : share.kind}</strong><small>{share.revoked_at ? 'Revogado' : new Date(share.expires_at) < new Date() ? 'Expirado' : `Ativo até ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(share.expires_at))}`}</small></span>{!share.revoked_at && <button onClick={() => remove(share.id)}>Revogar</button>}</div>)}</div> : <p>Nenhum link criado ainda.</p>}</article>
  </div>;
}

function VisitorsPanel() {
  const [visitors, setVisitors] = useState<any[]>([]);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [telegram, setTelegram] = useState('');
  const [permissions, setPermissions] = useState<PlatformPermissions>(defaultVisitorPermissions);
  const [fallback, setFallback] = useState<any>(null);
  const [chatVisitorId, setChatVisitorId] = useState('');
  const [chat, setChat] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [editingVisitorId, setEditingVisitorId] = useState('');
  const [editingPermissions, setEditingPermissions] = useState<PlatformPermissions>(defaultVisitorPermissions);
  const [busy, setBusy] = useState(false);
  async function load() { try { setVisitors((await listVisitors()).visitors || []); } catch {} }
  useEffect(() => { load(); }, []);
  async function invite() {
    setBusy(true); setFallback(null);
    try {
      const result = await createVisitor({ email, displayName: name, telegram, permissions });
      if (!result.emailSent) setFallback(result);
      setEmail(''); setName(''); setTelegram(''); await load();
      toast.success(result.message || 'Convite criado.');
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Não consegui convidar.'); }
    finally { setBusy(false); }
  }
  async function remove(id: string) { try { await revokeVisitor(id); await load(); toast.success('Visitante revogado.'); } catch { toast.error('Não consegui revogar.'); } }
  function edit(visitor: any) { setEditingVisitorId(visitor.id); setEditingPermissions({ ...defaultVisitorPermissions, ...(visitor.permissions || {}) }); }
  async function savePermissions() { if (!editingVisitorId) return; setBusy(true); try { await updateVisitorPermissions(editingVisitorId, editingPermissions); setEditingVisitorId(''); await load(); toast.success('Permissões atualizadas imediatamente.'); } catch (err) { toast.error(err instanceof Error ? err.message : 'Não consegui atualizar as permissões.'); } finally { setBusy(false); } }
  async function openChat(id: string) { setChatVisitorId(id); try { setChat(await loadVisitorChat(id)); } catch (err) { toast.error(err instanceof Error ? err.message : 'Não consegui abrir o chat.'); } }
  async function send() { if (!message.trim() || !chatVisitorId) return; setBusy(true); try { setChat(await sendVisitorChat(chatVisitorId, message)); setMessage(''); } catch (err) { toast.error(err instanceof Error ? err.message : 'Não consegui enviar.'); } finally { setBusy(false); } }
  return <div className="cp-stack">
    <article className="cp-box"><header><div><UserPlus/><span><h2>Novo visitante</h2><p>O convite usa e-mail interno, senha temporária e troca obrigatória no primeiro acesso.</p></span></div></header><div className="cp-form"><label><span>Nome</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Familiar ou amigo"/></label><label><span>E-mail</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="pessoa@email.com"/></label><label><span>Telegram</span><input value={telegram} onChange={(event) => setTelegram(event.target.value)} placeholder="@usuario (opcional)"/></label></div><PermissionEditor value={permissions} onChange={setPermissions}/><button className="cp-primary" onClick={invite} disabled={busy || !email}>{busy ? <Loader2 className="cp-spin"/> : <Mail/>} Enviar convite pelo CrewCheck</button></article>
    {fallback && <article className="cp-fallback"><AlertTriangle/><div><h2>E-mail não configurado</h2><p>Compartilhe estes dados uma única vez:</p><strong>{fallback.link}</strong><b>Senha temporária: {fallback.temporaryPassword}</b><button onClick={() => navigator.clipboard.writeText(`${fallback.link}\nSenha temporária: ${fallback.temporaryPassword}`)}><Copy/> Copiar convite</button></div></article>}
    <article className="cp-box"><h2>Visitantes</h2>{visitors.length ? <div className="cp-list">{visitors.map((visitor) => <div className="cp-visitor-entry" key={visitor.id}><div className="cp-visitor-row"><span><strong>{visitor.display_name}</strong><small>{visitor.email} · {visitor.status === 'active' ? 'Ativo' : visitor.status === 'revoked' ? 'Revogado' : 'Convite enviado'}</small></span><aside>{visitor.status === 'active' && visitor.permissions?.chat && <button onClick={() => openChat(visitor.id)}><MessageCircle/> Chat</button>}{visitor.status !== 'revoked' && <button onClick={() => edit(visitor)}><ShieldCheck/> Permissões</button>}{visitor.status !== 'revoked' && <button className="danger" onClick={() => remove(visitor.id)}>Revogar</button>}</aside></div>{editingVisitorId === visitor.id && <div className="cp-permission-edit"><p>As alterações valem imediatamente no site, Telegram e chat.</p><PermissionEditor value={editingPermissions} onChange={setEditingPermissions}/><div className="cp-actions"><button className="cp-primary" onClick={savePermissions} disabled={busy}><Check/> Salvar permissões</button><button onClick={() => setEditingVisitorId('')} disabled={busy}><X/> Cancelar</button></div></div>}</div>)}</div> : <p>Nenhum visitante definido.</p>}</article>
    {chat && <article className="cp-box cp-chat"><header><div><MessageCircle/><span><h2>{chat.person?.displayName}</h2><p>Chat privado com visitante autorizado</p></span></div><button onClick={() => { setChat(null); setChatVisitorId(''); }}><X/></button></header><div className="cp-messages">{chat.messages?.map((item: any) => <p className={item.mine ? 'mine' : ''} key={item.id}><span>{item.body}</span><small>{new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short', dateStyle: 'short' }).format(new Date(item.createdAt))}</small></p>)}</div><div className="cp-inline-form"><input value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && send()} placeholder="Digite uma mensagem"/><button className="cp-primary" onClick={send} disabled={!message.trim() || busy === true}><Send/></button></div></article>}
  </div>;
}

function ConnectionsPanel() {
  const [publicId, setPublicId] = useState(() => new URLSearchParams(window.location.search).get('connect') || '');
  const [connections, setConnections] = useState<any[]>([]);
  const [comparison, setComparison] = useState<any>(null);
  const [chatId, setChatId] = useState('');
  const [chat, setChatState] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  async function load() { try { setConnections((await listConnections()).connections || []); } catch {} }
  useEffect(() => { load(); }, []);
  async function connect() { setBusy('connect'); try { await requestConnection(publicId); setPublicId(''); await load(); toast.success('Solicitação enviada. O outro usuário precisa aceitar.'); } catch (err) { toast.error(err instanceof Error ? err.message : 'Não consegui enviar.'); } finally { setBusy(''); } }
  async function answer(id: string, accepted: boolean) { try { await answerConnection(id, accepted); await load(); toast.success(accepted ? 'Conexão aceita.' : 'Solicitação recusada.'); } catch { toast.error('Não consegui responder.'); } }
  async function compare(id: string) { setBusy('compare'); try { setComparison(await compareRoster(id)); } catch (err) { toast.error(err instanceof Error ? err.message : 'Não consegui comparar.'); } finally { setBusy(''); } }
  async function openChat(id: string) { setChatId(id); try { setChatState(await loadChat(id)); } catch (err) { toast.error(err instanceof Error ? err.message : 'Não consegui abrir o chat.'); } }
  async function send() { if (!message.trim() || !chatId) return; setBusy('chat'); try { setChatState(await sendChat(chatId, message)); setMessage(''); } catch (err) { toast.error(err instanceof Error ? err.message : 'Não consegui enviar.'); } finally { setBusy(''); } }
  return <div className="cp-stack">
    <article className="cp-box"><header><div><Users/><span><h2>Comparar por ID, QR ou e-mail</h2><p>Os dois usuários precisam aceitar. O hotel só coincide quando ambos ativam o compartilhamento de presença.</p></span></div></header><div className="cp-inline-form"><input value={publicId} onChange={(event) => setPublicId(event.target.value.includes('@') ? event.target.value : event.target.value.toUpperCase())} placeholder="CC-ABCD-2345 ou pessoa@email.com"/><button className="cp-primary" onClick={connect} disabled={!publicId || Boolean(busy)}>{busy === 'connect' ? <Loader2 className="cp-spin"/> : <UserPlus/>} Conectar</button></div></article>
    <article className="cp-box"><h2>Conexões</h2>{connections.length ? <div className="cp-list cp-connections">{connections.map((connection) => <div key={connection.id}><span><strong>{connection.person.displayName}</strong><small>{connection.person.publicId} · {connection.direction === 'incoming' ? 'Recebida' : 'Enviada'} · {connection.status}</small></span><aside>{connection.direction === 'incoming' && connection.status === 'pending' && <><button onClick={() => answer(connection.id, true)}><Check/> Aceitar</button><button onClick={() => answer(connection.id, false)}><X/> Recusar</button></>}{connection.status === 'accepted' && <><button onClick={() => compare(connection.person.publicId)}><Users/> Comparar</button><button onClick={() => openChat(connection.person.publicId)}><MessageCircle/> Chat</button></>}</aside></div>)}</div> : <p>Nenhuma conexão ainda.</p>}</article>
    {comparison && <article className="cp-box"><h2>Comparação com {comparison.colleague?.displayName}</h2><div className="cp-summary"><span><b>{comparison.summary.daysCompared}</b> dias</span><span><b>{comparison.summary.bothFree}</b> folgas em comum</span><span><b>{comparison.summary.sameHotel}</b> mesmo hotel</span></div><div className="cp-compare"><header><span>Data</span><span>Você</span><span>Colega</span></header>{comparison.rows.slice(0, 62).map((row: any) => <div key={row.date} className={row.bothFree || row.sameHotel ? 'match' : ''}><span>{row.date}</span><span>{row.mine}</span><span>{row.colleague}{row.sameHotel ? ' · mesmo hotel' : ''}</span></div>)}</div></article>}
    {chat && <article className="cp-box cp-chat"><header><div><MessageCircle/><span><h2>{chat.person?.displayName}</h2><p>Chat interno CrewCheck</p></span></div><button onClick={() => { setChatState(null); setChatId(''); }}><X/></button></header><div className="cp-messages">{chat.messages?.map((item: any) => <p className={item.mine ? 'mine' : ''} key={item.id}><span>{item.body}</span><small>{new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short', dateStyle: 'short' }).format(new Date(item.createdAt))}</small></p>)}</div><div className="cp-inline-form"><input value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && send()} placeholder="Digite uma mensagem"/><button className="cp-primary" onClick={send} disabled={!message.trim() || busy === 'chat'}><Send/></button></div></article>}
  </div>;
}

export function CommunityCenter({ rosterKey, onBack, onEmailPdf }: Omit<Props, 'mode'>) {
  const [tab, setTab] = useState<'share' | 'visitors' | 'people'>(() => new URLSearchParams(window.location.search).has('connect') ? 'people' : 'share');
  const [profile, setProfile] = useState<PlatformProfile | null>(null);
  const [error, setError] = useState('');
  const [idQr, setIdQr] = useState('');
  useEffect(() => { getPlatformProfile().then((result) => setProfile(result.profile)).catch((err) => setError(err instanceof Error ? err.message : 'Não consegui carregar seu perfil.')); }, []);
  useEffect(() => { if (profile?.publicId) QRCode.toDataURL(`${window.location.origin}/app?connect=${encodeURIComponent(profile.publicId)}`, { width: 240, margin: 2, errorCorrectionLevel: 'M' }).then(setIdQr).catch(() => setIdQr('')); }, [profile?.publicId]);
  const rosterLabel = useMemo(() => rosterKey && !/^0-00$/.test(rosterKey) ? rosterKey : 'escala ativa', [rosterKey]);
  async function copyId() { if (!profile) return; try { await navigator.clipboard.writeText(profile.publicId); toast.success('Seu ID CrewCheck foi copiado.'); } catch { toast.error('Não consegui copiar.'); } }
  return <section className="cp-center">
    <PageHead onBack={onBack} title="Pessoas e compartilhamento" subtitle={`Compartilhe ${rosterLabel} com controle, prazo, consentimento e revogação.`}/>
    {error ? <ErrorCard message={error} retry={() => window.location.reload()}/> : !profile ? <LoadingCard/> : <>
      <article className="cp-id-card"><div><span><KeyRound/></span><div><small>Seu ID CrewCheck</small><h2>{profile.publicId}</h2><p>{profile.displayName} · compartilhe o ID, o QR ou seu e-mail de login.</p></div></div>{idQr && <img className="cp-id-qr" src={idQr} alt="QR code para solicitar comparação de escala"/>}<button onClick={copyId}><Copy/> Copiar ID</button></article>
      <nav className="cp-tabs"><button className={tab === 'share' ? 'active' : ''} onClick={() => setTab('share')}><QrCode/> Compartilhar</button><button className={tab === 'visitors' ? 'active' : ''} onClick={() => setTab('visitors')}><UserPlus/> Visitantes</button><button className={tab === 'people' ? 'active' : ''} onClick={() => setTab('people')}><Users/> Colegas e chat</button></nav>
      {tab === 'share' && <SharePanel rosterKey={rosterKey} onEmailPdf={onEmailPdf}/>} {tab === 'visitors' && <VisitorsPanel/>} {tab === 'people' && <ConnectionsPanel/>}
      <article className="cp-privacy"><Lock/><div><h2>Privacidade por padrão</h2><p>Quarto, localização, hotel e escala ficam desligados até você autorizar. Links expiram, acessos podem ser revogados e o número do quarto nunca aparece na busca de colegas.</p></div></article>
    </>}
  </section>;
}

export default function PlatformCenter(props: Props) {
  return props.mode === 'plans'
    ? <SubscriptionCenter onBack={props.onBack}/>
    : <CommunityCenter rosterKey={props.rosterKey} onBack={props.onBack} onEmailPdf={props.onEmailPdf}/>;
}
