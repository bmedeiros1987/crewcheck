import {
  cleanText,
  dbPool,
  env,
  flag,
  readBody,
  requireIdentity,
  safeEmail,
  sendJson,
} from '../v139/common.mjs';
import { sendSystemEmail } from '../v139/delivery.mjs';

// Preserve compatibility with older Render variable names previously used by CrewCheck.
for (const [canonical, legacy] of [
  ['SMTP_USER', 'SMTP_USERNAME'],
  ['SMTP_PASS', 'SMTP_PASSWORD'],
  ['SMTP_FROM', 'SMTP_FROM_EMAIL'],
]) {
  if (!String(process.env[canonical] || '').trim() && String(process.env[legacy] || '').trim()) {
    process.env[canonical] = process.env[legacy];
  }
}

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
      webhookConfigured: Boolean(env('MAILERSEND_WEBHOOK_SECRET')),
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

async function recentWebhookDelivery() {
  const db = await dbPool();
  if (!db) return { available: false, reason: 'database_unavailable' };

  try {
    const [rows] = await db.query(`
      SELECT event_type, message_id, email_id, provider_created_at, created_at
      FROM crewcheck_email_events
      ORDER BY created_at DESC
      LIMIT 20
    `);
    const events = rows.map((row) => ({
      eventType: cleanText(row.event_type || 'unknown', 80),
      hasMessageId: Boolean(row.message_id),
      hasEmailId: Boolean(row.email_id),
      providerCreatedAt: row.provider_created_at || null,
      receivedAt: row.created_at || null,
    }));
    const latestDelivered = events.find((event) => event.eventType === 'activity.delivered' || event.eventType === 'delivered') || null;
    const latestFailure = events.find((event) => [
      'activity.soft_bounced',
      'activity.hard_bounced',
      'activity.rejected',
      'activity.failed',
      'soft_bounced',
      'hard_bounced',
      'rejected',
      'failed',
    ].includes(event.eventType)) || null;

    return {
      available: true,
      eventCount: events.length,
      latestEvent: events[0] || null,
      latestDelivered,
      latestFailure,
      events,
    };
  } catch (error) {
    if (String(error?.code || '') === 'ER_NO_SUCH_TABLE') {
      return { available: true, eventCount: 0, latestEvent: null, latestDelivered: null, latestFailure: null, events: [] };
    }
    console.warn('[crewcheck:email-health:webhook]', cleanText(error?.code || error?.message || 'WEBHOOK_HEALTH_UNAVAILABLE', 120));
    return { available: false, reason: 'webhook_health_unavailable' };
  }
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
    const webhookDelivery = await recentWebhookDelivery();
    const deliveryConfirmed = Boolean(webhookDelivery.latestDelivered);
    sendJson(res, 200, {
      ok: true,
      configuration,
      webhookDelivery,
      deliveryConfirmed,
      message: !configuration.ready
        ? 'Nenhum provedor de e-mail está completamente configurado.'
        : !configuration.providers.mailerSend.webhookConfigured
          ? 'MailerSend está configurado para envio, mas o signing secret do webhook não está configurado.'
          : deliveryConfirmed
            ? 'Entrega real confirmada por webhook do MailerSend.'
            : 'O provedor está configurado, mas ainda não há confirmação de entrega por webhook. Use POST para enviar um teste real.',
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
    webhookConfigured: Boolean(configuration.providers.mailerSend.webhookConfigured),
    attempts,
    message: result.ok
      ? 'O provedor aceitou o e-mail de teste. Confirme a entrega real consultando novamente este diagnóstico após o webhook.'
      : 'Nenhum provedor conseguiu aceitar o e-mail de teste.',
  });
  return true;
}
