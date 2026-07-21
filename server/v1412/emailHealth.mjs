import {
  cleanText,
  env,
  flag,
  readBody,
  requireIdentity,
  safeEmail,
  sendJson,
} from '../v139/common.mjs';
import { sendSystemEmail } from '../v139/delivery.mjs';

function maskEmail(value = '') {
  const email = safeEmail(value);
  if (!email) return '';
  const [local, domain] = email.split('@');
  const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(1, local.length - visible.length))}@${domain}`;
}

function emailConfiguration() {
  const emailSenderFrom = safeEmail(env('EMAILSENDER_FROM', env('EMAIL_FROM')));
  const mailerSendFrom = safeEmail(env('MAILERSEND_FROM', env('EMAIL_FROM')));
  const smtpUser = safeEmail(env('SMTP_USER', env('SMTP_USERNAME')));
  const smtpFrom = safeEmail(env('SMTP_FROM', env('SMTP_FROM_EMAIL', env('EMAIL_FROM', smtpUser))));

  const providers = {
    emailSenderApi: {
      configured: Boolean(env('EMAILSENDER_API_URL') && env('EMAILSENDER_API_KEY', env('EMAIL_SENDER_API_KEY')) && emailSenderFrom),
      from: maskEmail(emailSenderFrom),
    },
    mailerSend: {
      configured: Boolean(env('MAILERSEND_API_KEY') && mailerSendFrom),
      from: maskEmail(mailerSendFrom),
    },
    smtp: {
      configured: Boolean(
        !flag('CREWCHECK_EMAIL_DISABLE_SMTP', false)
        && env('SMTP_HOST')
        && smtpUser
        && env('SMTP_PASS', env('SMTP_PASSWORD'))
        && smtpFrom
      ),
      host: cleanText(env('SMTP_HOST'), 160),
      port: Number(env('SMTP_PORT', '587')),
      secure: flag('SMTP_SECURE', Number(env('SMTP_PORT', '587')) === 465),
      user: maskEmail(smtpUser),
      from: maskEmail(smtpFrom),
      disabled: flag('CREWCHECK_EMAIL_DISABLE_SMTP', false),
    },
  };

  return {
    ready: Object.values(providers).some((provider) => provider.configured),
    fallbackEnabled: flag('CREWCHECK_EMAIL_FALLBACK_ENABLED', true),
    providers,
  };
}

function summarizeAttempt(attempt = {}) {
  return {
    provider: cleanText(attempt.provider || 'unknown', 60),
    ok: Boolean(attempt.ok),
    configured: Boolean(attempt.configured),
    status: Number(attempt.status || 0),
    detail: cleanText(attempt.raw || '', 400),
  };
}

export async function handleEmailHealthRoute(req, res, url) {
  if (url.pathname !== '/api/admin/email-health') return false;

  const identity = await requireIdentity(req, res);
  if (!identity) return true;
  if (!identity.admin) {
    sendJson(res, 403, { ok: false, message: 'Acesso restrito ao administrador.' });
    return true;
  }

  const configuration = emailConfiguration();

  if (req.method === 'GET' || req.method === 'HEAD') {
    sendJson(res, 200, {
      ok: true,
      configuration,
      message: configuration.ready
        ? 'Há pelo menos um provedor de e-mail configurado. Use POST para validar a entrega real.'
        : 'Nenhum provedor de e-mail está completamente configurado.',
    });
    return true;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, message: 'Método não permitido.' });
    return true;
  }

  const body = await readBody(req, 100_000);
  const to = safeEmail(body.to) || identity.email;
  if (!to) {
    sendJson(res, 400, { ok: false, message: 'Informe um destinatário válido.' });
    return true;
  }

  const sentAt = new Date().toISOString();
  const result = await sendSystemEmail({
    to,
    bcc: false,
    subject: cleanText(body.subject || 'Teste de entrega de e-mail CrewCheck', 180),
    text: `Este é um teste administrativo de entrega do CrewCheck.\n\nHorário UTC: ${sentAt}\nDestinatário: ${to}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:28px"><h1 style="margin:0 0 16px">E-mail CrewCheck funcionando</h1><p>Esta mensagem confirma que o backend conseguiu entregar uma solicitação ao provedor de e-mail.</p><p><strong>Horário UTC:</strong> ${sentAt}</p><p><strong>Destinatário:</strong> ${to}</p></div>`,
  });

  const attempts = Array.isArray(result.attempts)
    ? result.attempts.map(summarizeAttempt)
    : [summarizeAttempt(result)];

  console.info('[crewcheck:email-test]', JSON.stringify({
    ok: Boolean(result.ok),
    provider: result.provider || 'none',
    status: Number(result.status || 0),
    toDomain: to.split('@')[1] || '',
  }));

  sendJson(res, result.ok ? 200 : 502, {
    ok: Boolean(result.ok),
    provider: cleanText(result.provider || 'none', 60),
    configuration,
    attempts,
    message: result.ok
      ? 'O provedor aceitou o e-mail de teste.'
      : 'Nenhum provedor conseguiu aceitar o e-mail de teste.',
  });
  return true;
}
