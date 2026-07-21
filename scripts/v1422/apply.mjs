import fs from 'node:fs';

function patchFile(path, transform) {
  if (!fs.existsSync(path)) throw new Error(`[v1422] Arquivo não encontrado: ${path}`);
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

patchFile('server/v139/delivery.mjs', (source) => {
  let next = source;

  const preferredLoop = `  for (const provider of [sendMailerSend, sendEmailSenderApi]) {`;
  const legacyLoop = `  for (const provider of [sendEmailSenderApi, sendMailerSend]) {`;
  const providerSelection = `  const selectedProvider = env('CREWCHECK_EMAIL_PROVIDER', 'mailersend').toLowerCase();
  const providers = selectedProvider === 'mailersend'
    ? [sendMailerSend]
    : selectedProvider === 'emailsender'
      ? [sendEmailSenderApi]
      : [sendMailerSend, sendEmailSenderApi];
  for (const provider of providers) {`;

  if (next.includes(preferredLoop)) next = next.replace(preferredLoop, providerSelection);
  else if (next.includes(legacyLoop)) next = next.replace(legacyLoop, providerSelection);
  else if (!next.includes("const selectedProvider = env('CREWCHECK_EMAIL_PROVIDER'")) {
    throw new Error('[v1422] Laço de provedores não encontrado.');
  }

  if (!next.includes("const defaultBcc = '';")) {
    next = next.replace("const defaultBcc = 'bmedeiros1987@gmail.com';", "const defaultBcc = '';");
  }

  return next;
});

patchFile('server/v1412/emailHealth.mjs', (source) => {
  if (source.includes("selectedProvider: env('CREWCHECK_EMAIL_PROVIDER', 'mailersend')")) return source;
  const anchor = `  return {
    ready: Object.values(providers).some((provider) => provider.configured),`;
  const replacement = `  return {
    selectedProvider: env('CREWCHECK_EMAIL_PROVIDER', 'mailersend').toLowerCase(),
    ready: Object.values(providers).some((provider) => provider.configured),`;
  if (!source.includes(anchor)) throw new Error('[v1422] Retorno de configuração de e-mail não encontrado.');
  return source.replace(anchor, replacement);
});

console.log('[v1422] MailerSend travado como provedor transacional exclusivo.');
