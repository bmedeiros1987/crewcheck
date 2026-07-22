import fs from 'node:fs';

function patchFile(path, transform) {
  if (!fs.existsSync(path)) throw new Error(`[v1425] Arquivo não encontrado: ${path}`);
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`[v1425] Âncora não encontrada: ${label}`);
  return source.replace(before, after);
}

patchFile('server.mjs', (source) => {
  let next = source;

  if (!next.includes('async function refreshLinkedTelegramUsername(')) {
    const anchor = 'async function handleTelegramLinkStatus(req, res, url) {';
    const helper = `function normalizeTelegramUsername(value = '') {
  const username = String(value || '').trim().replace(/^@/, '');
  return /^[A-Za-z0-9_]{5,32}$/.test(username) ? username : '';
}

async function telegramUsernameFromChat(chatId = '') {
  const target = telegramApiUrl('getChat');
  if (!target || !chatId) return '';
  try {
    const response = await fetch(target, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ chat_id: String(chatId) }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) return '';
    return normalizeTelegramUsername(payload?.result?.username);
  } catch {
    return '';
  }
}

async function refreshLinkedTelegramUsername(linked = null, data = null) {
  const existing = normalizeTelegramUsername(linked?.username);
  if (existing) return existing;
  const discovered = await telegramUsernameFromChat(linked?.chatId);
  if (!discovered || !linked?.email) return discovered;
  const updated = { ...linked, username: discovered, usernameUpdatedAt: new Date().toISOString() };
  if (data?.linked) {
    data.linked[linked.email] = updated;
    telegramLinksWrite(data);
  }
  const writes = [
    conciergeDbPut('link-email:' + linked.email, updated),
    conciergeDbPut('link-chat:' + String(linked.chatId), updated),
  ];
  if (linked.code) writes.push(conciergeDbPut('link-code:' + linked.code, updated));
  await Promise.all(writes);
  Object.assign(linked, updated);
  return discovered;
}

${anchor}`;
    next = replaceRequired(next, anchor, helper, 'resolução automática do username Telegram');
  }

  next = next.replace(
    "  const snapshot = linked?.email ? await conciergeLoadSnapshot({ ...user, email: linked.email, chatId: linked.chatId }) : (email ? await conciergeLoadSnapshot(user) : null);",
    "  const telegramUsername = linked ? await refreshLinkedTelegramUsername(linked, data) : '';\n  const snapshot = linked?.email ? await conciergeLoadSnapshot({ ...user, email: linked.email, chatId: linked.chatId }) : (email ? await conciergeLoadSnapshot(user) : null);",
  );

  next = next.replace(
    "    chatId: linked?.chatId ? String(linked.chatId) : '',\n    linkedAt: linked?.linkedAt || '',",
    "    chatId: linked?.chatId ? String(linked.chatId) : '',\n    username: telegramUsername,\n    telegramUsername,\n    callMeBotReady: Boolean(telegramUsername),\n    callMeBotMessage: telegramUsername ? 'Usuário do Telegram confirmado para o CallMeBot.' : 'O CallMeBot exige um @usuário público. Crie um nome de usuário no Telegram e toque em Atualizar status.',\n    linkedAt: linked?.linkedAt || '',",
  );

  next = next.replace(
    "    username: message?.from?.username || message?.chat?.username || '',",
    "    username: normalizeTelegramUsername(message?.from?.username || message?.chat?.username || ''),",
  );

  if (!next.includes('callMeBotReady: Boolean(telegramUsername)')) throw new Error('[v1425] Status do CallMeBot não recebeu o username.');
  if (!next.includes("username: normalizeTelegramUsername(message?.from?.username")) throw new Error('[v1425] Vínculo não normaliza o username Telegram.');
  return next;
});

patchFile('client/src/pages/TelegramConnectPage.tsx', (source) => {
  let next = source;

  next = next.replace(
    "type LinkPayload = { ok?: boolean; linked?: boolean; username?: string; telegramUsername?: string; link?: string; url?: string; expiresIn?: number; message?: string };",
    "type LinkPayload = { ok?: boolean; linked?: boolean; username?: string; telegramUsername?: string; callMeBotReady?: boolean; callMeBotMessage?: string; link?: string; url?: string; expiresIn?: number; message?: string };",
  );

  if (!next.includes('function buildCallMeBotUrl(')) {
    next = replaceRequired(
      next,
      'export default function TelegramConnectPage() {',
      `function buildCallMeBotUrl(username = '') {
  const cleanUsername = String(username || '').trim().replace(/^@/, '');
  if (!/^[A-Za-z0-9_]{5,32}$/.test(cleanUsername)) return '';
  const url = new URL('https://api.callmebot.com/start.php');
  url.searchParams.set('user', '@' + cleanUsername);
  url.searchParams.set('text', 'CrewCheck conectado ao CallMeBot. Esta é uma ligação de teste.');
  url.searchParams.set('lang', 'pt-BR-Standard-A');
  url.searchParams.set('rpt', '1');
  url.searchParams.set('cc', 'missed');
  url.searchParams.set('timeout', '45');
  return url.toString();
}

export default function TelegramConnectPage() {`,
      'construtor seguro do CallMeBot',
    );
  }

  const oldMemo = `  const callMeBotUrl = useMemo(() => {
    if (!telegramUsername) return '';
    const url = new URL('https://api.callmebot.com/start.php');
    url.searchParams.set('user', \`@\${telegramUsername}\`);
    url.searchParams.set('text', 'CrewCheck conectado ao CallMeBot. Esta é uma ligação de teste.');
    url.searchParams.set('lang', 'pt-BR-Standard-A');
    url.searchParams.set('rpt', '1');
    url.searchParams.set('cc', 'missed');
    url.searchParams.set('timeout', '45');
    return url.toString();
  }, [telegramUsername]);`;
  next = next.replace(oldMemo, "  const callMeBotUrl = useMemo(() => buildCallMeBotUrl(telegramUsername), [telegramUsername]);");

  const oldConnect = `  function connectCallMeBot() {
    if (!callMeBotUrl) { setError('O Telegram conectado não informou um nome de usuário. Defina um @usuário no Telegram e atualize o status.'); return; }
    window.open(callMeBotUrl, '_blank', 'noopener,noreferrer');
  }`;
  const newConnect = `  async function connectCallMeBot() {
    setBusy(true); setError('');
    try {
      const payload = await authFetch<LinkPayload>('/api/telegram/link/status');
      setStatus(payload || {});
      const refreshedUsername = String(payload?.username || payload?.telegramUsername || '').replace(/^@/, '');
      const target = buildCallMeBotUrl(refreshedUsername);
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
  }`;
  next = replaceRequired(next, oldConnect, newConnect, 'revalidação do usuário antes do CallMeBot');

  next = next.replace(
    "<span>@{telegramUsername || 'conta vinculada'}</span><small>A conexão está pronta para alertas e mensagens.</small>",
    "<span>{telegramUsername ? '@' + telegramUsername : 'Conta vinculada · @usuário pendente para chamadas'}</span><small>{telegramUsername ? 'A conexão está pronta para alertas, mensagens e CallMeBot.' : 'Mensagens funcionam normalmente. Para chamadas, crie um @usuário público no Telegram.'}</small>",
  );

  next = next.replace(
    "<p>Ative também as ligações de teste e os recursos de despertador por chamada usando o mesmo usuário do Telegram.</p></div><button type=\"button\" onClick={connectCallMeBot}>Conectar CallMeBot</button>",
    "<p>{telegramUsername ? 'Ative também as ligações de teste e os recursos de despertador por chamada usando @' + telegramUsername + '.' : 'O CallMeBot precisa de um @usuário público. O CrewCheck verificará novamente ao tocar no botão.'}</p></div><button type=\"button\" onClick={connectCallMeBot} disabled={busy}>{busy ? 'Verificando…' : 'Conectar CallMeBot'}</button>",
  );

  if (!next.includes("const refreshedUsername = String(payload?.username")) throw new Error('[v1425] Tela não revalida o username antes do CallMeBot.');
  return next;
});

console.log('[v1425] Username Telegram restaurado no status e CallMeBot com atualização automática.');
