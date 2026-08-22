import { infobipConfiguration } from './v1396/infobip.mjs';

function envValue(environment, keys) {
  for (const key of keys) {
    const value = String(environment?.[key] || '').trim();
    if (value) return value;
  }
  return '';
}

function cleanCallText(value = '') {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240);
}

export function callMeBotPhoneConfiguration(environment = process.env) {
  const apiKey = envValue(environment, ['CALLMEBOT_API_KEY', 'CALLMEBOT_KEY']);
  const phone = envValue(environment, ['CALLMEBOT_PHONE', 'CREWCHECK_ADMIN_PHONE']).replace(/[^+\d]/g, '');
  return { provider: 'callmebot', configured: Boolean(apiKey), apiKey, phone };
}

export function selectWakeupPhoneProvider(environment = process.env) {
  const requested = envValue(environment, ['CREWCHECK_WAKEUP_CALL_PROVIDER']).toLowerCase() || 'auto';
  const callmebotConfigured = callMeBotPhoneConfiguration(environment).configured;
  const infobipConfigured = infobipConfiguration(environment).configured;

  if (requested.includes('callmebot') && callmebotConfigured) return 'callmebot';
  if (requested.includes('infobip') && infobipConfigured) return 'infobip';

  // A provider selected without credentials must not disable a provider that is
  // already ready. This preserves existing VoIP alarms during migrations.
  if (callmebotConfigured) return 'callmebot';
  if (infobipConfigured) return 'infobip';
  return 'none';
}

export function buildCallMeBotPhoneRequest({ environment = process.env, phone = '', text = '' } = {}) {
  const configuration = callMeBotPhoneConfiguration(environment);
  const destination = String(phone || configuration.phone || '').trim().replace(/[^+\d]/g, '');
  if (!configuration.apiKey) return { ok: false, configured: false, provider: 'callmebot-phone', message: 'Ligação VoIP aguardando chave do CallMeBot.' };
  if (!destination) return { ok: false, configured: true, provider: 'callmebot-phone', message: 'Informe o telefone com DDI para receber a ligação VoIP.' };

  const url = new URL('https://api.callmebot.com/call.php');
  url.searchParams.set('phone', destination);
  url.searchParams.set('text', cleanCallText(text) || 'Despertador CrewCheck.');
  url.searchParams.set('apikey', configuration.apiKey);
  return { ok: true, configured: true, provider: 'callmebot-phone', url: url.toString() };
}
