import fs from 'node:fs';

// v14.1.5 — hotfix de apresentação: Telegram deve continuar funcionando
// mesmo quando o usuário não possui @username para ligação CallMeBot.
const runtimePath = 'server/telegram-fast-ack.mjs';
if (fs.existsSync(runtimePath)) {
  let source = fs.readFileSync(runtimePath, 'utf8');
  source = source.replace(/const RUNTIME_VERSION = '[^']+';/, "const RUNTIME_VERSION = '14.1.5-demo-recovery';");

  source = source.replace(
    "  const channels = channel.split('+');\n\n  if (channels.includes('telegram') && !chatId)",
    "  let effectiveChannel = channel;\n  let channels = effectiveChannel.split('+');\n\n  // Ligação via Telegram (CallMeBot) exige @username público. Isso não pode\n  // derrubar o Telegram normal: quando há chat vinculado, convertemos somente\n  // esse canal para mensagem no Telegram e mantemos os demais canais.\n  if (channels.includes('telegram-call') && !telegramUsername && chatId) {\n    channels = [...new Set(channels.map((item) => item === 'telegram-call' ? 'telegram' : item))];\n    effectiveChannel = channels.join('+');\n  }\n\n  if (channels.includes('telegram') && !chatId)"
  );

  source = source.replace(
    "  if (channels.includes('telegram-call') && !telegramUsername) return sendJson(res, 400, { ok: false, message: 'Cadastre um nome de usuário no Telegram para receber ligação.' });",
    "  if (channels.includes('telegram-call') && !telegramUsername) return sendJson(res, 400, { ok: false, message: 'A ligação via Telegram exige um @username público. O Telegram por mensagem continua disponível após vincular o bot.' });"
  );

  source = source.replace(
    "    [user.email, jobKey, scheduledAt, channel, chatId, telegramUsername, phone, message]);\n\n  return sendJson(res, 200, { ok: true, scheduledAt: scheduledAt.toISOString(), channel, jobKey, message: 'Despertador agendado no servidor.' });",
    "    [user.email, jobKey, scheduledAt, effectiveChannel, chatId, telegramUsername, phone, message]);\n\n  return sendJson(res, 200, { ok: true, scheduledAt: scheduledAt.toISOString(), channel: effectiveChannel, requestedChannel: channel, fallbackApplied: effectiveChannel !== channel, jobKey, message: effectiveChannel !== channel ? 'Telegram vinculado. A ligação foi convertida em mensagem porque não há @username público.' : 'Despertador agendado no servidor.' });"
  );

  fs.writeFileSync(runtimePath, source, 'utf8');
  console.log('[v1415] Telegram normal preservado quando CallMeBot não encontra @username.');
}

// O Cockpit e a Saída Inteligente não devem usar pernoite/folga como a
// próxima apresentação quando já existe um voo ou atividade operacional futura.
const canonicalPath = 'client/src/lib/canonicalRoster.ts';
if (fs.existsSync(canonicalPath)) {
  let source = fs.readFileSync(canonicalPath, 'utf8');
  const oldFn = `export function selectNextRosterEvent(events: CanonicalRosterEvent[], now = new Date()): CanonicalRosterEvent | null {
  const sorted = [...events].sort((a, b) => new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime());
  const active = sorted.find((event) => {
    const start = new Date(event.startDateTime).getTime();
    const end = new Date(event.endDateTime).getTime();
    return start <= now.getTime() && end >= now.getTime();
  });
  if (active) return active;
  return sorted.find((event) => new Date(event.startDateTime).getTime() > now.getTime()) || null;
}`;
  const newFn = `export function selectNextRosterEvent(events: CanonicalRosterEvent[], now = new Date()): CanonicalRosterEvent | null {
  const sorted = [...events].sort((a, b) => new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime());
  const nowMs = now.getTime();
  const actionable = (event: CanonicalRosterEvent) => event.kind === 'flight' || event.kind === 'duty';

  // Uma atividade operacional já iniciada continua sendo prioritária.
  const activeOperational = sorted.find((event) => {
    if (!actionable(event)) return false;
    const start = new Date(event.startDateTime).getTime();
    const end = new Date(event.endDateTime).getTime();
    return start <= nowMs && end >= nowMs;
  });
  if (activeOperational) return activeOperational;

  // Durante pernoite/repouso, o Cockpit deve apontar para a próxima
  // apresentação real, que também alimenta a Saída Inteligente e o despertador.
  const nextOperational = sorted.find((event) => actionable(event) && new Date(event.startDateTime).getTime() > nowMs);
  if (nextOperational) return nextOperational;

  // Só exibe pernoite/folga como próximo evento quando não existe mais nenhuma
  // programação operacional futura na escala carregada.
  const activeAny = sorted.find((event) => {
    const start = new Date(event.startDateTime).getTime();
    const end = new Date(event.endDateTime).getTime();
    return start <= nowMs && end >= nowMs;
  });
  return activeAny || sorted.find((event) => new Date(event.startDateTime).getTime() > nowMs) || null;
}`;
  if (source.includes(oldFn)) source = source.replace(oldFn, newFn);
  fs.writeFileSync(canonicalPath, source, 'utf8');
  console.log('[v1415] Próxima programação operacional unificada para Cockpit, Saída e Despertador.');
}

// Mensagem clara na interface: Telegram por texto não depende de @username.
const homePath = 'client/src/pages/Home.tsx';
if (fs.existsSync(homePath)) {
  let source = fs.readFileSync(homePath, 'utf8');
  source = source.replace(
    '<option value="telegram-call">Somente ligação via Telegram</option>',
    '<option value="telegram-call">Ligação via Telegram (requer @username)</option>'
  );
  source = source.replace(
    '<option value="telegram">Somente Telegram</option>',
    '<option value="telegram">Mensagem no Telegram (não exige @username)</option>'
  );
  fs.writeFileSync(homePath, source, 'utf8');
  console.log('[v1415] Interface diferencia Telegram normal de ligação CallMeBot.');
}
