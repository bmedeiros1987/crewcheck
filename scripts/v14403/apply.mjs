import fs from 'node:fs';

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`[v14403] Ancora nao encontrada: ${label}`);
  return source.replace(before, after);
}

function patchFile(path, transform) {
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

patchFile('server.mjs', (source) => {
  let next = source;

  next = next.replace(`function callMeBotPhoneConfigured() {
  return Boolean(envAny(['CALLMEBOT_API_KEY', 'CALLMEBOT_KEY']));
}
`, '');
  next = replaceOnce(
    next,
    `function preferredPhoneCallProvider() {
  const preferred = String(envAny(['CREWCHECK_WAKEUP_CALL_PROVIDER']) || 'auto').trim().toLowerCase();
  if (preferred.includes('infobip')) return 'infobip';
  if (preferred.includes('callmebot')) return 'callmebot';
  if (infobipPhoneConfigured()) return 'infobip';
  if (callMeBotPhoneConfigured()) return 'callmebot';
  return 'none';
}
function phoneProviderStatus() {
  const infobip = infobipPublicStatus();
  const callmebot = { provider: 'callmebot', configured: callMeBotPhoneConfigured() };
  const selected = preferredPhoneCallProvider();
  const configured = selected === 'infobip' ? infobip.configured : selected === 'callmebot' ? callmebot.configured : false;
  return { selected, configured, infobip, callmebot, lastInfobipAttempt: infobipLastAttempt };
}`,
    `function phoneProviderStatus() {
  const infobip = infobipPublicStatus();
  return { selected: 'infobip', configured: infobip.configured, infobip, lastInfobipAttempt: infobipLastAttempt };
}`,
    'Infobip como unico provedor telefonico',
  );
  next = next.replace(/async function sendCallMeBotPhoneCall\(phone, text\) \{[\s\S]*?\n\}\nasync function sendInfobipPhoneCall/, 'async function sendInfobipPhoneCall');
  next = replaceOnce(
    next,
    `async function sendAdminPhoneCall(phone, text) {
  const preferred = preferredPhoneCallProvider();
  if (preferred === 'infobip') return sendInfobipPhoneCall(phone, text);
  if (preferred === 'callmebot') {
    if (callMeBotPhoneConfigured()) return sendCallMeBotPhoneCall(phone, text);
    return { ok: false, configured: false, provider: 'callmebot-phone', message: 'CallMeBot selecionado, mas CALLMEBOT_API_KEY não está configurada.' };
  }
  return { ok: false, configured: false, provider: '', message: 'Nenhum provedor de ligação telefônica está configurado.' };
}`,
    `async function sendAdminPhoneCall(phone, text) {
  return sendInfobipPhoneCall(phone, text);
}`,
    'envio telefonico exclusivo Infobip',
  );
  next = next.replace(
    /  const phoneCallMessage = phoneCall[\s\S]*?;\n  return sendJson\(res, 200, \{/,
    `  const phoneCallMessage = phoneCall
    ? 'Infobip conectada para ligações telefônicas Premium.'
    : \`Infobip aguardando: ${'${phoneProvider.infobip.missing.join(\', \')}'} .\`.replace(' .', '.');
  return sendJson(res, 200, {`,
  );
  if (!next.includes('Infobip conectada para ligações telefônicas Premium.')) throw new Error('[v14403] Mensagem exclusiva da Infobip nao aplicada.');
  next = next.replace("'INFOBIP_PHONE_FROM','INFOBIP_FROM','CALLMEBOT_API_KEY','CALLMEBOT_TELEGRAM_CALL_USER'", "'INFOBIP_PHONE_FROM','INFOBIP_FROM','CALLMEBOT_TELEGRAM_CALL_USER'");

  next = replaceOnce(
    next,
    `async function handleTelegramLinkStatus(req, res, url) {`,
    `const CALLMEBOT_TELEGRAM_BOT_URL = 'https://t.me/CallMeBot_txtbot';

async function persistTelegramLinkRecord(linked = null, data = null) {
  if (!linked?.email || !linked?.chatId) return false;
  if (data?.linked) {
    data.linked[linked.email] = linked;
    telegramLinksWrite(data);
  }
  const writes = [
    conciergeDbPut('link-email:' + linked.email, linked),
    conciergeDbPut('link-chat:' + String(linked.chatId), linked),
  ];
  if (linked.code) writes.push(conciergeDbPut('link-code:' + linked.code, linked));
  await Promise.all(writes);
  return true;
}

function callMeBotAuthorizationKeyboard() {
  return { inline_keyboard: [[{ text: 'Autorizar ligacoes no CallMeBot', url: CALLMEBOT_TELEGRAM_BOT_URL }]] };
}

async function handleCallMeBotAuthorize(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, message: 'Metodo nao permitido.' });
  const body = await readJsonBody(req, 30_000);
  const user = telegramRequestUser(req, body);
  if (!telegramAppRequestAllowed(user)) return sendJson(res, 401, { ok: false, message: 'Faca login para autorizar as ligacoes via Telegram.' });
  const data = telegramLinksRead();
  const linked = data.linked?.[user.email] || await telegramLinkedRecordForEmail(user.email);
  if (!linked?.chatId || !conciergeAccessMatches(user, linked)) return sendJson(res, 403, { ok: false, message: 'Vincule o Telegram antes de autorizar o CallMeBot.' });
  const username = await refreshLinkedTelegramUsername(linked, data);
  if (!username) return sendJson(res, 400, { ok: false, message: 'Crie um @usuario publico no Telegram e atualize o status antes de continuar.' });
  const updated = { ...linked, callMeBotOnboardingVersion: 2, callMeBotAuthorizationRequestedAt: new Date().toISOString() };
  await persistTelegramLinkRecord(updated, data);
  await sendTelegramMessage(linked.chatId, [
    'Falta uma confirmacao para receber ligacoes pelo Telegram.',
    '',
    'Toque no bot abaixo e depois toque em Start/Iniciar. Essa autorizacao individual e exigida pelo CallMeBot para evitar spam.',
    '',
    'Depois, volte ao CrewCheck e escolha “Testar e concluir”.'
  ].join('\\n'), { reply_markup: callMeBotAuthorizationKeyboard() });
  return sendJson(res, 200, { ok: true, linked: true, username, authorizationUrl: CALLMEBOT_TELEGRAM_BOT_URL, authorizationRequested: true, message: 'Abra o CallMeBot e toque em Start/Iniciar.' });
}

async function handleCallMeBotVerify(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, message: 'Metodo nao permitido.' });
  const body = await readJsonBody(req, 30_000);
  const user = telegramRequestUser(req, body);
  if (!telegramAppRequestAllowed(user)) return sendJson(res, 401, { ok: false, message: 'Faca login para testar as ligacoes via Telegram.' });
  const data = telegramLinksRead();
  const linked = data.linked?.[user.email] || await telegramLinkedRecordForEmail(user.email);
  if (!linked?.chatId || !conciergeAccessMatches(user, linked)) return sendJson(res, 403, { ok: false, message: 'Vincule o Telegram antes de testar o CallMeBot.' });
  const username = await refreshLinkedTelegramUsername(linked, data);
  if (!username) return sendJson(res, 400, { ok: false, message: 'O Telegram vinculado precisa de um @usuario publico.' });
  const rateKey = user.email + ':callmebot-onboarding';
  const retryAfterSeconds = crewcheckRateLimit(crewcheckAlarmTestRateLimit, rateKey, 35_000);
  if (retryAfterSeconds) return sendJson(res, 429, { ok: false, retryAfterSeconds, message: 'Aguarde ' + retryAfterSeconds + 's antes de repetir o teste.' });
  let usage = null;
  const admin = Boolean(typeof cc1371IsAdmin === 'function' && cc1371IsAdmin(user.email));
  if (!admin) {
    usage = await consumePlatformUsage(req, 'wakeup_call', 1);
    if (!usage.allowed) return sendJson(res, Number(usage.status || 429), { ok: false, usage, message: usage.message || 'Limite mensal de ligacoes atingido.' });
  }
  const result = await sendTelegramVoiceCall(username, 'CrewCheck chamando. Seu CallMeBot foi autorizado corretamente.');
  if (!result.ok) {
    if (!admin) await refundPlatformUsage(req, 'wakeup_call', 1);
    return sendJson(res, 502, { ok: false, linked: true, callMeBotReady: false, usage: usage ? { ...usage, refunded: !admin } : null, message: result.message || 'O CallMeBot ainda nao aceitou a ligacao. Confirme o Start e tente novamente.' });
  }
  const updated = { ...linked, username, callMeBotOnboardingVersion: 2, callMeBotAuthorizationRequestedAt: linked.callMeBotAuthorizationRequestedAt || new Date().toISOString(), callMeBotVerifiedAt: new Date().toISOString() };
  await persistTelegramLinkRecord(updated, data);
  return sendJson(res, 200, { ok: true, linked: true, username, callMeBotReady: true, callMeBotVerifiedAt: updated.callMeBotVerifiedAt, usage, message: 'CallMeBot confirmado. Atenda a ligacao de teste no Telegram.' });
}

async function handleTelegramLinkStatus(req, res, url) {`,
    'endpoints de autorizacao CallMeBot',
  );

  next = replaceOnce(
    next,
    `  const telegramUsername = linked ? await refreshLinkedTelegramUsername(linked, data) : '';
  const snapshot = linked?.email ? await conciergeLoadSnapshot({ ...user, email: linked.email, chatId: linked.chatId }) : (email ? await conciergeLoadSnapshot(user) : null);`,
    `  const telegramUsername = linked ? await refreshLinkedTelegramUsername(linked, data) : '';
  const callMeBotLegacyReady = Boolean(telegramUsername && linked?.linkedAt && !linked?.callMeBotOnboardingVersion);
  const callMeBotReady = Boolean(telegramUsername && (linked?.callMeBotVerifiedAt || callMeBotLegacyReady));
  const callMeBotAuthorizationRequested = Boolean(linked?.callMeBotAuthorizationRequestedAt);
  const snapshot = linked?.email ? await conciergeLoadSnapshot({ ...user, email: linked.email, chatId: linked.chatId }) : (email ? await conciergeLoadSnapshot(user) : null);`,
    'estado real do CallMeBot',
  );

  next = replaceOnce(
    next,
    `    callMeBotReady: Boolean(telegramUsername),
    callMeBotMessage: telegramUsername ? 'Usuário do Telegram confirmado para o CallMeBot.' : 'O CallMeBot exige um @usuário público. Crie um nome de usuário no Telegram e toque em Atualizar status.',`,
    `    callMeBotReady,
    callMeBotAuthorizationRequested,
    callMeBotVerifiedAt: linked?.callMeBotVerifiedAt || '',
    callMeBotLegacyReady,
    callMeBotAuthorizationUrl: CALLMEBOT_TELEGRAM_BOT_URL,
    callMeBotMessage: !telegramUsername
      ? 'O CallMeBot exige um @usuario publico. Crie um nome de usuario no Telegram e toque em Atualizar status.'
      : callMeBotReady
        ? 'Ligacoes via Telegram prontas.'
        : callMeBotAuthorizationRequested
          ? 'Toque em Start/Iniciar no CallMeBot e depois teste para concluir.'
          : 'Autorize o CallMeBot antes de testar as ligacoes via Telegram.',`,
    'status confirmado do CallMeBot',
  );

  next = replaceOnce(
    next,
    `    accessKeyHash: pending.accessKeyHash || '',
    linkedAt: new Date().toISOString(),`,
    `    accessKeyHash: pending.accessKeyHash || '',
    callMeBotOnboardingVersion: 2,
    linkedAt: new Date().toISOString(),`,
    'marca novos vinculos',
  );

  next = replaceOnce(
    next,
    `  ].join('\\n'), { reply_markup: conciergeKeyboard });
  return true;
}

// CrewCheck v13.7.15`,
    `  ].join('\\n'), { reply_markup: conciergeKeyboard });
  if (data.linked[email].username) {
    await sendTelegramMessage(chatId, [
      'Quer receber tambem ligacoes de despertador pelo Telegram?',
      '',
      'Toque abaixo, abra o CallMeBot e pressione Start/Iniciar. Depois confirme o teste na tela de Integracoes do CrewCheck.'
    ].join('\\n'), { reply_markup: callMeBotAuthorizationKeyboard() });
  }
  return true;
}

// CrewCheck v13.7.15`,
    'convite automatico para novos usuarios',
  );

  next = replaceOnce(
    next,
    `if (url.pathname === '/api/telegram/link/start') return handleTelegramLinkStart(req, res, url);
  if (url.pathname === '/api/telegram/link/status') return handleTelegramLinkStatus(req, res, url);`,
    `if (url.pathname === '/api/telegram/link/start') return handleTelegramLinkStart(req, res, url);
  if (url.pathname === '/api/telegram/link/status') return handleTelegramLinkStatus(req, res, url);
  if (url.pathname === '/api/telegram/callmebot/authorize') return handleCallMeBotAuthorize(req, res, url);
  if (url.pathname === '/api/telegram/callmebot/verify') return handleCallMeBotVerify(req, res, url);`,
    'rotas CallMeBot',
  );

  return next;
});

patchFile('render.yaml', (source) => source
  .replace(`      - key: CALLMEBOT_MODE
        sync: false
      - key: CALLMEBOT_PHONE
        sync: false
      - key: CALLMEBOT_API_KEY
        sync: false
`, ''));

patchFile('.env.example', (source) => source.replace('CALLMEBOT_API_KEY=\n', ''));

patchFile('client/src/pages/TelegramConnectPage.tsx', (source) => {
  let next = source;
  next = next.replace("import { useEffect, useMemo, useState } from 'react';", "import { useEffect, useState } from 'react';");
  next = replaceOnce(
    next,
    `type LinkPayload = { ok?: boolean; linked?: boolean; username?: string; telegramUsername?: string; callMeBotReady?: boolean; callMeBotMessage?: string; link?: string; url?: string; expiresIn?: number; message?: string };`,
    `type LinkPayload = { ok?: boolean; linked?: boolean; username?: string; telegramUsername?: string; callMeBotReady?: boolean; callMeBotAuthorizationRequested?: boolean; callMeBotVerifiedAt?: string; callMeBotLegacyReady?: boolean; callMeBotAuthorizationUrl?: string; callMeBotMessage?: string; link?: string; url?: string; expiresIn?: number; message?: string };`,
    'payload da tela',
  );
  next = next.replace(/\nfunction buildCallMeBotUrl\(username = ''\) \{[\s\S]*?\n\}\n\nexport default function TelegramConnectPage/, '\nexport default function TelegramConnectPage');
  next = next.replace("\n  const callMeBotUrl = useMemo(() => buildCallMeBotUrl(telegramUsername), [telegramUsername]);", '');

  next = replaceOnce(
    next,
    `  async function connectCallMeBot() {
    setBusy(true); setError('');
    try {
      const payload = await authFetch<LinkPayload>('/api/telegram/link/status');
      setStatus(payload || {});
      const refreshedUsername = String(payload?.username || payload?.telegramUsername || '').replace(/^@/, '');
      const target = callMeBotUrl || buildCallMeBotUrl(refreshedUsername);
      if (!target) {
        setError(payload?.callMeBotMessage || 'O CallMeBot exige um @usuário público. No Telegram, abra Configurações > Nome de usuário, crie seu @usuário e depois toque novamente em Conectar CallMeBot.');
        return;
      }
      window.open(target, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      setError(err?.message || 'Não foi possível atualizar o usuário do Telegram agora.');
    } finally {
      setBusy(false);
    }
  }`,
    `  async function authorizeCallMeBot() {
    setBusy(true); setError('');
    try {
      const payload = await authFetch<LinkPayload>('/api/telegram/callmebot/authorize', { method: 'POST' });
      setStatus((current) => ({ ...current, ...payload, callMeBotAuthorizationRequested: true }));
      const target = payload.callMeBotAuthorizationUrl || 'https://t.me/CallMeBot_txtbot';
      window.open(target, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      setError(err?.message || 'Não foi possível abrir a autorização do CallMeBot.');
    } finally { setBusy(false); }
  }

  async function verifyCallMeBot() {
    setBusy(true); setError('');
    try {
      const payload = await authFetch<LinkPayload>('/api/telegram/callmebot/verify', { method: 'POST' });
      setStatus((current) => ({ ...current, ...payload, callMeBotReady: true }));
    } catch (err: any) {
      setError(err?.message || 'O CallMeBot ainda não confirmou a autorização. Abra o bot, toque em Start/Iniciar e tente novamente.');
    } finally { setBusy(false); }
  }`,
    'acoes de autorizar e verificar',
  );

  next = replaceOnce(
    next,
    `{status.linked && <div className="cc-callmebot"><div><strong>CallMeBot</strong><p>{telegramUsername ? 'Ative também as ligações de teste e os recursos de despertador por chamada usando @' + telegramUsername + '.' : 'O CallMeBot precisa de um @usuário público. O CrewCheck verificará novamente ao tocar no botão.'}</p></div><button type="button" onClick={connectCallMeBot} disabled={busy}>{busy ? 'Verificando…' : 'Conectar CallMeBot'}</button></div>}`,
    `{status.linked && <div className="cc-callmebot"><div><strong>CallMeBot · ligações via Telegram</strong><p>{status.callMeBotMessage || (telegramUsername ? 'Autorize o bot para receber chamadas no Telegram.' : 'Crie um @usuário público no Telegram para continuar.')}</p>{status.callMeBotAuthorizationRequested && !status.callMeBotReady && <small>O teste usa uma ligação da franquia e só é descontado se o CallMeBot aceitar.</small>}</div>{status.callMeBotReady ? <span className="cc-callmebot-ready">Ativo</span> : status.callMeBotAuthorizationRequested ? <button type="button" onClick={verifyCallMeBot} disabled={busy}>{busy ? 'Testando…' : 'Testar e concluir'}</button> : <button type="button" onClick={authorizeCallMeBot} disabled={busy || !telegramUsername}>{busy ? 'Abrindo…' : 'Autorizar CallMeBot'}</button>}</div>}`,
    'fluxo visual CallMeBot',
  );
  next = next.replace('.cc-callmebot button{flex:0 0 auto;', '.cc-callmebot-ready{flex:0 0 auto;padding:10px 14px;border-radius:999px;background:#103126;border:1px solid #2f8f6d;color:#82efc3;font-weight:900}.cc-callmebot small{display:block;margin-top:7px;color:#adc3db}.cc-callmebot button{flex:0 0 auto;');
  return next;
});

console.log('[crewcheck:prepare] v14.4.03 CallMeBot onboarding e verificacao aplicados.');
