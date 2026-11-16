async function refresh() {
    const session=captureAuthSession(),revision=++readRevision.current;
    if(!session.token){if(alive.current){setStatus({});setStatusUnavailable(true);}return;}
    try {
      const payload = await authFetch<LinkPayload>('/api/telegram/link/status');
      if(!alive.current||!session.isCurrent()||revision!==readRevision.current)return;
      setStatus(payload || {});setStatusUnavailable(false);
      setError('');
    } catch (err: any) {
      if(!alive.current||!session.isCurrent()||revision!==readRevision.current)return;
      setStatus({});setStatusUnavailable(true);setError(err?.message || 'Não foi possível verificar o Telegram agora.');
    }
  }

async function connect() {
    const request=action();if(!request.session.token)return;
    setBusy(true); setError('');
    try {
      const payload = await authFetch<LinkPayload>('/api/telegram/link/start', { method: 'POST' });
      if(!current(request))return;
      setStatus(payload || {});
      const target = payload.link || payload.url;
      if (!target) throw new Error('O link do Telegram não foi gerado. Verifique a configuração do bot.');
      window.location.href = target;
    } catch (err: any) {
      if(!current(request))return;
      setError(err?.message || 'Não foi possível iniciar a conexão.');
    } finally { if(current(request))setBusy(false); }
  }

async function testConnection() {
    const request=action();if(!request.session.token)return;
    setBusy(true); setError('');
    try {
      await authFetch('/api/telegram/send', { method: 'POST', body: JSON.stringify({ text: `Tudo certo, ${user?.name || user?.email || 'tripulante'}! Seu Telegram está conectado ao CrewCheck.` }) });
    } catch (err: any) { if(!current(request))return;setError(err?.message || 'Não foi possível enviar a mensagem de teste.'); }
    finally { if(current(request))setBusy(false); }
  }

async function authorizeCallMeBot() {
    const request=action();if(!request.session.token)return;
    setBusy(true); setError('');
    try {
      const payload = await authFetch<LinkPayload>('/api/telegram/callmebot/authorize', { method: 'POST' });
      if(!current(request))return;
      setStatus((current) => ({ ...current, ...payload, callMeBotAuthorizationRequested: true }));
      const target = payload.callMeBotAuthorizationUrl || 'https://t.me/CallMeBot_txtbot';
      window.open(target, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      if(!current(request))return;
      setError(err?.message || 'Não foi possível abrir a autorização do CallMeBot.');
    } finally { if(current(request))setBusy(false); }
  }

async function verifyCallMeBot() {
    const request=action();if(!request.session.token)return;
    setBusy(true); setError('');
    try {
      const payload = await authFetch<LinkPayload>('/api/telegram/callmebot/verify', { method: 'POST' });
      if(!current(request))return;
      setStatus((current) => ({ ...current, ...payload, callMeBotReady: true }));
    } catch (err: any) {
      if(!current(request))return;
      setError(err?.message || 'O CallMeBot ainda não confirmou a autorização. Abra o bot, toque em Start/Iniciar e tente novamente.');
    } finally { if(current(request))setBusy(false); }
  }
