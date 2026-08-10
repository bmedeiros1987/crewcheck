import fs from 'node:fs';

function patchFile(path, transform) {
  if (!fs.existsSync(path)) throw new Error(`[v1423] Arquivo não encontrado: ${path}`);
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

patchFile('server/v139/delivery.mjs', (source) => {
  let next = source;

  const fromAnchor = `  const apiKey = env('MAILERSEND_API_KEY');
  const fromEmail = env('MAILERSEND_FROM', env('EMAIL_FROM'));
  const fromName = env('MAILERSEND_FROM_NAME', env('EMAIL_FROM_NAME', 'CrewCheck'));`;
  const fromReplacement = `  const apiKey = env('MAILERSEND_API_KEY');
  const configuredFromEmail = safeEmail(env('MAILERSEND_FROM', env('EMAIL_FROM')));
  const lockedFromEmail = safeEmail(env('CREWCHECK_EMAIL_FROM_LOCK', 'contato@crewcheck.com.br'));
  const fromEmail = lockedFromEmail || configuredFromEmail;
  const fromName = env('MAILERSEND_FROM_NAME', env('EMAIL_FROM_NAME', 'CrewCheck'));`;

  if (next.includes(fromAnchor)) next = next.replace(fromAnchor, fromReplacement);
  else if (!next.includes("const lockedFromEmail = safeEmail(env('CREWCHECK_EMAIL_FROM_LOCK'")) {
    throw new Error('[v1423] Remetente MailerSend não encontrado.');
  }

  const fallbackAnchor = `  if (flag('CREWCHECK_EMAIL_FALLBACK_ENABLED', true)) {
    const result = await sendSmtp(normalized);`;
  const fallbackReplacement = `  const smtpFallbackAllowed = selectedProvider !== 'mailersend'
    && flag('CREWCHECK_EMAIL_FALLBACK_ENABLED', false)
    && !flag('CREWCHECK_EMAIL_DISABLE_SMTP', true);
  if (smtpFallbackAllowed) {
    const result = await sendSmtp(normalized);`;

  if (next.includes(fallbackAnchor)) next = next.replace(fallbackAnchor, fallbackReplacement);
  else if (!next.includes('const smtpFallbackAllowed = selectedProvider')) {
    throw new Error('[v1423] Fallback SMTP não encontrado.');
  }

  return next;
});

patchFile('server/v1412/emailHealth.mjs', (source) => {
  let next = source;

  const variablesAnchor = `  const emailSenderFrom = safeEmail(env('EMAILSENDER_FROM', env('EMAIL_FROM')));
  const mailerSendFrom = safeEmail(env('MAILERSEND_FROM', env('EMAIL_FROM')));
  const smtpUser = safeEmail(env('SMTP_USER', env('SMTP_USERNAME')));`;
  const variablesReplacement = `  const selectedProvider = env('CREWCHECK_EMAIL_PROVIDER', 'mailersend').toLowerCase();
  const emailSenderFrom = safeEmail(env('EMAILSENDER_FROM', env('EMAIL_FROM')));
  const configuredMailerSendFrom = safeEmail(env('MAILERSEND_FROM', env('EMAIL_FROM')));
  const mailerSendFrom = safeEmail(env('CREWCHECK_EMAIL_FROM_LOCK', 'contato@crewcheck.com.br')) || configuredMailerSendFrom;
  const mailerSendUsingTrialDomain = /@test-[^@]+\\.mlsender\\.net$/i.test(configuredMailerSendFrom);
  const smtpUser = safeEmail(env('SMTP_USER', env('SMTP_USERNAME')));`;

  if (next.includes(variablesAnchor)) next = next.replace(variablesAnchor, variablesReplacement);
  else if (!next.includes('const configuredMailerSendFrom = safeEmail')) {
    throw new Error('[v1423] Configuração MailerSend não encontrada.');
  }

  const mailerProviderAnchor = `    mailerSend: {
      configured: Boolean(env('MAILERSEND_API_KEY') && mailerSendFrom),
      from: maskEmail(mailerSendFrom),
    },`;
  const mailerProviderWebhookAnchor = `    mailerSend: {
      configured: Boolean(env('MAILERSEND_API_KEY') && mailerSendFrom),
      webhookConfigured: Boolean(env('MAILERSEND_WEBHOOK_SECRET')),
      from: maskEmail(mailerSendFrom),
    },`;
  const mailerProviderReplacement = `    mailerSend: {
      configured: Boolean(env('MAILERSEND_API_KEY') && mailerSendFrom),
      webhookConfigured: Boolean(env('MAILERSEND_WEBHOOK_SECRET')),
      from: maskEmail(mailerSendFrom),
      configuredFrom: maskEmail(configuredMailerSendFrom),
      usingTrialDomain: mailerSendUsingTrialDomain,
      enforced: Boolean(mailerSendFrom && mailerSendFrom !== configuredMailerSendFrom),
    },`;

  if (next.includes(mailerProviderWebhookAnchor)) next = next.replace(mailerProviderWebhookAnchor, mailerProviderReplacement);
  else if (next.includes(mailerProviderAnchor)) next = next.replace(mailerProviderAnchor, mailerProviderReplacement);
  else if (!next.includes('usingTrialDomain: mailerSendUsingTrialDomain')) {
    throw new Error('[v1423] Diagnóstico do remetente não encontrado.');
  }

  next = next.replace(
    `        !flag('CREWCHECK_EMAIL_DISABLE_SMTP', false)
        && env('SMTP_HOST')`,
    `        selectedProvider !== 'mailersend'
        && !flag('CREWCHECK_EMAIL_DISABLE_SMTP', true)
        && env('SMTP_HOST')`,
  );

  next = next.replace(
    `      disabled: flag('CREWCHECK_EMAIL_DISABLE_SMTP', false),`,
    `      disabled: selectedProvider === 'mailersend' || flag('CREWCHECK_EMAIL_DISABLE_SMTP', true),
      ignoredBecauseMailerSendSelected: selectedProvider === 'mailersend',`,
  );

  const returnAnchor = `  return {
    selectedProvider: env('CREWCHECK_EMAIL_PROVIDER', 'mailersend').toLowerCase(),
    ready: Object.values(providers).some((provider) => provider.configured),
    fallbackEnabled: flag('CREWCHECK_EMAIL_FALLBACK_ENABLED', true),
    providers,
  };`;
  const returnReplacement = `  const selectedReady = selectedProvider === 'mailersend'
    ? providers.mailerSend.configured
    : selectedProvider === 'emailsender'
      ? providers.emailSenderApi.configured
      : Object.values(providers).some((provider) => provider.configured);
  return {
    selectedProvider,
    ready: selectedReady,
    fallbackEnabled: selectedProvider === 'mailersend'
      ? false
      : flag('CREWCHECK_EMAIL_FALLBACK_ENABLED', false),
    warnings: [
      ...(mailerSendUsingTrialDomain ? ['MAILERSEND_FROM ainda aponta para o domínio de teste, mas o CrewCheck está impondo contato@crewcheck.com.br.'] : []),
      ...(selectedProvider === 'mailersend' && providers.smtp.host ? ['As variáveis SMTP antigas estão presentes, porém são ignoradas.'] : []),
    ],
    providers,
  };`;

  if (next.includes(returnAnchor)) next = next.replace(returnAnchor, returnReplacement);
  else if (!next.includes('const selectedReady = selectedProvider')) {
    throw new Error('[v1423] Retorno efetivo do diagnóstico não encontrado.');
  }

  return next;
});

console.log('[v1423] Remetente verificado imposto; domínio de teste e SMTP antigo ignorados.');
