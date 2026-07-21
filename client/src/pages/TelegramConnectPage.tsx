import { useEffect, useState } from 'react';
import { authFetch, getStoredUser } from '../lib/authClient';

type LinkPayload = { ok?: boolean; linked?: boolean; username?: string; telegramUsername?: string; link?: string; url?: string; expiresIn?: number; message?: string };

export default function TelegramConnectPage() {
  const user = getStoredUser();
  const [status, setStatus] = useState<LinkPayload>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function refresh() {
    try {
      const payload = await authFetch<LinkPayload>('/api/telegram/link/status');
      setStatus(payload || {});
    } catch (err: any) {
      setError(err?.message || 'Não foi possível verificar o Telegram agora.');
    }
  }

  useEffect(() => { void refresh(); const timer = window.setInterval(refresh, 4000); return () => window.clearInterval(timer); }, []);

  async function connect() {
    setBusy(true); setError('');
    try {
      const payload = await authFetch<LinkPayload>('/api/telegram/link/start', { method: 'POST' });
      setStatus(payload || {});
      const target = payload.link || payload.url;
      if (!target) throw new Error('O link do Telegram não foi gerado. Verifique a configuração do bot.');
      window.location.href = target;
    } catch (err: any) {
      setError(err?.message || 'Não foi possível iniciar a conexão.');
    } finally { setBusy(false); }
  }

  async function testConnection() {
    setBusy(true); setError('');
    try {
      await authFetch('/api/telegram/send', { method: 'POST', body: JSON.stringify({ text: `Tudo certo, ${user?.name || user?.email || 'tripulante'}! Seu Telegram está conectado ao CrewCheck.` }) });
    } catch (err: any) { setError(err?.message || 'Não foi possível enviar a mensagem de teste.'); }
    finally { setBusy(false); }
  }

  return <main className="cc-tg-page"><section className="cc-tg-card">
    <a className="cc-tg-back" href="/">← Voltar ao CrewCheck</a>
    <div className="cc-tg-icon">✈</div>
    <span>Integrações</span><h1>Conecte seu Telegram</h1>
    <p>Receba alertas da escala, mudanças de portão, lembretes e converse com o Concierge Operacional sem copiar códigos ou informar seu e-mail no Telegram.</p>
    {status.linked ? <div className="cc-tg-ok"><strong>Telegram conectado</strong><span>@{status.username || status.telegramUsername || 'conta vinculada'}</span><small>A conexão está pronta para alertas e mensagens.</small></div> : <div className="cc-tg-steps"><div><b>1</b><span>Toque em conectar</span></div><div><b>2</b><span>O Telegram será aberto</span></div><div><b>3</b><span>Confirme no bot</span></div></div>}
    {error && <div className="cc-tg-error" role="alert">{error}</div>}
    <div className="cc-tg-actions">{status.linked ? <button onClick={testConnection} disabled={busy}>{busy ? 'Enviando…' : 'Testar conexão'}</button> : <button onClick={connect} disabled={busy}>{busy ? 'Preparando…' : 'Conectar Telegram'}</button>}<button className="secondary" onClick={refresh}>Atualizar status</button></div>
    <small className="cc-tg-security">O código de conexão é temporário, usado uma única vez e não expõe seu e-mail.</small>
  </section><style>{`.cc-tg-page{min-height:100vh;display:grid;place-items:center;padding:22px;background:radial-gradient(circle at top right,#372067 0,#0b1d38 42%,#06101f 100%);color:#f8fbff;font-family:Inter,system-ui,sans-serif}.cc-tg-page *{box-sizing:border-box}.cc-tg-card{width:min(680px,100%);background:#0b1a2e;border:1px solid #29415f;border-radius:28px;padding:clamp(24px,6vw,48px);box-shadow:0 30px 80px rgba(0,0,0,.45)}.cc-tg-back{display:inline-flex;color:#d7e8fb!important;text-decoration:none;font-weight:800;border:1px solid #385778;border-radius:12px;padding:10px 13px;background:#102640}.cc-tg-back:hover{background:#173352}.cc-tg-icon{width:74px;height:74px;display:grid;place-items:center;border-radius:22px;margin:30px 0 18px;font-size:34px;background:linear-gradient(135deg,#8d45e8,#f03a9f,#31c9ed);color:#fff}.cc-tg-card>span{color:#ff70c7!important;font-weight:900;font-size:12px;text-transform:uppercase;letter-spacing:.14em}.cc-tg-card h1{font-size:clamp(34px,7vw,58px);line-height:1.04;margin:10px 0 16px;color:#fff!important}.cc-tg-card>p{font-size:18px;line-height:1.65;color:#e0e9f5!important}.cc-tg-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:26px 0}.cc-tg-steps div,.cc-tg-ok{padding:16px;border-radius:16px;background:#122943;border:1px solid #34516f}.cc-tg-steps b{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:#3ac7ed;color:#06101f;margin-bottom:10px;font-weight:950}.cc-tg-steps span{display:block;color:#f4f8fc!important;font-weight:750;line-height:1.45}.cc-tg-ok{border-color:#2f8f6d;margin:24px 0;background:#103126}.cc-tg-ok strong{display:block;font-size:20px;color:#82efc3!important}.cc-tg-ok span{display:block;margin:7px 0;color:#fff!important;font-weight:800}.cc-tg-ok small{display:block;color:#d7e9df!important}.cc-tg-actions{display:flex;gap:10px;flex-wrap:wrap}.cc-tg-actions button{border:0;border-radius:14px;padding:14px 18px;background:linear-gradient(90deg,#f33aa7,#4acaf2);color:#fff!important;font:inherit;font-weight:900;cursor:pointer;min-height:48px}.cc-tg-actions button.secondary{background:#173653;border:1px solid #426887;color:#fff!important}.cc-tg-actions button:disabled{opacity:.7;cursor:not-allowed}.cc-tg-error{padding:14px;border-radius:13px;background:#7f1d1d;border:1px solid #ef4444;color:#fff!important;font-weight:750;margin:16px 0}.cc-tg-security{display:block;margin-top:18px;color:#c4d5e8!important;line-height:1.5}.dark .cc-tg-page,[data-crew-theme="dark"] .cc-tg-page{color:#f8fbff}.dark .cc-tg-card,[data-crew-theme="dark"] .cc-tg-card{background:#0b1a2e;border-color:#36516e}.dark .cc-tg-card h1,.dark .cc-tg-card p,.dark .cc-tg-steps span,.dark .cc-tg-security,[data-crew-theme="dark"] .cc-tg-card h1,[data-crew-theme="dark"] .cc-tg-card p,[data-crew-theme="dark"] .cc-tg-steps span,[data-crew-theme="dark"] .cc-tg-security{opacity:1!important;text-shadow:none!important}@media(max-width:620px){.cc-tg-page{padding:14px;place-items:start center}.cc-tg-card{border-radius:22px;padding:24px 18px}.cc-tg-steps{grid-template-columns:1fr}.cc-tg-actions{display:grid}.cc-tg-actions button{width:100%}}`}</style></main>;
}