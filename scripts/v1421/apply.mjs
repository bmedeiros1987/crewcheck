import fs from 'node:fs';

function patchFile(path, transform) {
  if (!fs.existsSync(path)) throw new Error(`[v1421] Arquivo não encontrado: ${path}`);
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

patchFile('server/v139/delivery.mjs', (source) => {
  let next = source;

  const oldResponse = `    const raw = await response.text().catch(() => '');
    return { ok: response.ok, status: response.status, raw };`;
  const newResponse = `    const raw = await response.text().catch(() => '');
    const messageId = cleanText(response.headers.get('x-message-id') || '', 180);
    const sendPaused = /^true$/i.test(String(response.headers.get('x-send-paused') || '').trim());
    const accepted = response.ok;
    return {
      ok: accepted && !sendPaused,
      accepted,
      status: response.status,
      raw: sendPaused && !raw
        ? 'O provedor aceitou a solicitação, mas pausou o envio (x-send-paused=true).'
        : raw,
      messageId,
      sendPaused,
    };`;

  if (next.includes(oldResponse)) next = next.replace(oldResponse, newResponse);
  else if (!next.includes("response.headers.get('x-send-paused')")) throw new Error('[v1421] Âncora de resposta HTTP não encontrada.');

  next = next.replace("const defaultBcc = 'bmedeiros1987@gmail.com';", "const defaultBcc = '';");

  const functionAnchor = `function normalizeMessage(message) {
  const replyTo = optionalEmail(message, 'replyTo', env('CREWCHECK_EMAIL_REPLY_TO', env('EMAIL_FROM')));`;
  const functionReplacement = `function normalizeMessage(message) {
  const to = safeEmail(message.to);
  const replyTo = optionalEmail(message, 'replyTo', env('CREWCHECK_EMAIL_REPLY_TO', env('EMAIL_FROM')));`;
  if (next.includes(functionAnchor)) next = next.replace(functionAnchor, functionReplacement);
  else if (!next.includes('const to = safeEmail(message.to);')) throw new Error('[v1421] Âncora do destinatário não encontrada.');

  const bccAnchor = `  const bcc = optionalEmail(message, 'bcc', env('CREWCHECK_EMAIL_BCC', defaultBcc));`;
  const bccReplacement = `  const requestedBcc = optionalEmail(message, 'bcc', env('CREWCHECK_EMAIL_BCC', defaultBcc));
  const bcc = requestedBcc && requestedBcc !== to ? requestedBcc : '';`;
  if (next.includes(bccAnchor)) next = next.replace(bccAnchor, bccReplacement);
  else if (!next.includes('const requestedBcc = optionalEmail')) throw new Error('[v1421] Âncora do BCC não encontrada.');

  next = next.replace(
    '  return { ...message, html, text, replyTo, bcc };',
    '  return { ...message, to, html, text, replyTo, bcc };',
  );
  if (!next.includes('return { ...message, to, html, text, replyTo, bcc };')) throw new Error('[v1421] Retorno normalizado não encontrado.');

  return next;
});

patchFile('server/v1412/emailHealth.mjs', (source) => {
  const oldFields = `    status: Number(attempt.status || 0),
    detail: cleanText(attempt.raw || '', 400),`;
  const newFields = `    status: Number(attempt.status || 0),
    accepted: Boolean(attempt.accepted),
    sendPaused: Boolean(attempt.sendPaused),
    messageId: cleanText(attempt.messageId || '', 180),
    detail: cleanText(attempt.raw || '', 400),`;
  if (source.includes(oldFields)) return source.replace(oldFields, newFields);
  if (!source.includes('sendPaused: Boolean(attempt.sendPaused)')) throw new Error('[v1421] Âncora do diagnóstico de e-mail não encontrada.');
  return source;
});

console.log('[v1421] MailerSend: BCC duplicado removido e envio pausado diagnosticado.');
