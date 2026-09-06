import { cleanText, env, readBody, requireIdentity, sendJson } from '../v139/common.mjs';

const MAX_BODY_BYTES = 256 * 1024;
const REQUEST_TIMEOUT_MS = 8_000;

export async function handleVoyageIntegrationRoute(req, res, url) {
  if (!url.pathname.startsWith('/api/voyage/integration')) return false;

  const identity = await requireIdentity(req, res);
  if (!identity) return true;

  if (req.method === 'GET' && url.pathname === '/api/voyage/integration/status') {
    sendJson(res, 200, integrationStatus());
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/voyage/integration/preview') {
    const body = await readBody(req, MAX_BODY_BYTES);
    const approved = body?.userApprovedShare === true;

    if (!approved) {
      sendJson(res, 200, {
        ok: true,
        surface: 'VOYAGE_INTEGRATED',
        legacySurface: 'CREWCHECK_EXPLORER',
        status: 'AWAITING_USER_APPROVAL',
        message: 'Autorize o compartilhamento da disponibilidade da escala para continuar com o Voyage integrado.',
        launchUrl: voyagePublicUrl(),
        shared: false
      });
      return true;
    }

    const config = integrationConfig();
    if (!config.enabled) {
      sendJson(res, 503, {
        ok: false,
        code: 'VOYAGE_INTEGRATION_NOT_CONFIGURED',
        message: 'A integração direta com o Voyage ainda não está configurada neste ambiente.',
        launchUrl: voyagePublicUrl()
      });
      return true;
    }

    const payload = {
      userApprovedShare: true,
      profile: sanitizeProfile(body.profile || {}),
      roster: sanitizeRoster(body.roster || {}),
      consent: {
        shareCrewCheckContext: true,
        observedAt: new Date().toISOString(),
        source: 'CREWCHECK_USER_ACTION'
      }
    };

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      let response;
      try {
        response = await fetch(`${config.apiBaseUrl}/api/v1/integrations/crewcheck/preview`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-crewcheck-service-token': config.serviceToken
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
      } finally {
        clearTimeout(timer);
      }

      const remote = await response.json().catch(() => null);
      if (!response.ok || !remote?.ok) {
        sendJson(res, 502, {
          ok: false,
          code: 'VOYAGE_BRIDGE_UNAVAILABLE',
          message: 'O Voyage não conseguiu receber sua disponibilidade agora.',
          launchUrl: voyagePublicUrl(),
          remoteStatus: response.status
        });
        return true;
      }

      sendJson(res, 200, {
        ok: true,
        surface: 'VOYAGE_INTEGRATED',
        legacySurface: 'CREWCHECK_EXPLORER',
        status: remote?.bridge?.context?.status || 'READY',
        bridge: remote.bridge,
        launchUrl: voyagePublicUrl(),
        shared: true,
        privacy: {
          rawRosterShared: false,
          emailShared: false,
          crewNamesShared: false,
          providerSecretsShared: false
        }
      });
      return true;
    } catch (error) {
      sendJson(res, 502, {
        ok: false,
        code: error?.name === 'AbortError' ? 'VOYAGE_BRIDGE_TIMEOUT' : 'VOYAGE_BRIDGE_ERROR',
        message: 'A integração com o Voyage está temporariamente indisponível. Sua escala não foi alterada.',
        launchUrl: voyagePublicUrl()
      });
      return true;
    }
  }

  sendJson(res, 405, { ok: false, message: 'Método não permitido.' });
  return true;
}

function integrationStatus() {
  const config = integrationConfig();
  return {
    ok: true,
    enabled: config.enabled,
    surface: 'VOYAGE_INTEGRATED',
    legacySurface: 'CREWCHECK_EXPLORER',
    title: 'Voyage',
    tagline: 'Beyond the trip.',
    launchUrl: voyagePublicUrl(),
    directBridgeConfigured: Boolean(config.apiBaseUrl && config.serviceToken),
    policies: {
      explicitApprovalBeforeRosterShare: true,
      rawRosterShareAllowed: false,
      itineraryMutationAllowedAutomatically: false,
      CrewCheckRemainsRosterSourceOfTruth: true,
      VoyageRemainsPersonalTripSourceOfTruth: true
    }
  };
}

function integrationConfig() {
  const apiBaseUrl = normalizeBaseUrl(env('VOYAGE_API_URL', env('VOYAGE_INTERNAL_API_URL')));
  const serviceToken = env('CREWCHECK_SHARED_SERVICES_TOKEN');
  return {
    enabled: Boolean(apiBaseUrl && serviceToken),
    apiBaseUrl,
    serviceToken
  };
}

function voyagePublicUrl() {
  return normalizeBaseUrl(env('VOYAGE_PUBLIC_URL', 'https://crewcheck.online/voyage')) || 'https://crewcheck.online/voyage';
}

function normalizeBaseUrl(value) {
  const text = String(value || '').trim().replace(/\/+$/, '');
  if (!text) return '';
  try {
    const parsed = new URL(text);
    return /^https?:$/.test(parsed.protocol) ? parsed.toString().replace(/\/+$/, '') : '';
  } catch {
    return '';
  }
}

function sanitizeProfile(input) {
  return {
    baseAirport: airport(input.baseAirport || input.base || input.homeBase),
    timeZone: cleanText(input.timeZone || input.timezone || 'America/Sao_Paulo', 80),
    locale: cleanText(input.locale || 'pt-BR', 30)
  };
}

function sanitizeRoster(input) {
  const year = integer(input.year, 2000, 2200);
  const month = integer(input.month, 1, 12);
  const period = /^\d{4}-\d{2}$/.test(String(input.period || '')) ? String(input.period) : year && month ? `${year}-${String(month).padStart(2, '0')}` : null;
  const days = Array.isArray(input.days)
    ? input.days.slice(0, 62).map(sanitizeDay).filter(Boolean)
    : [];
  return { year, month, period, days, minimized: true };
}

function sanitizeDay(day) {
  const date = dateOnly(day?.date || day?.localDate || day?.dayDate);
  if (!date) return null;
  const type = dayType(day);
  const legs = Array.isArray(day?.legs) ? day.legs.slice(0, 20).map(sanitizeLeg).filter(Boolean) : [];
  return {
    date,
    type,
    explicitFreeDay: type === 'FOLGA' || type === 'OFF' || type === 'FREE_DAY',
    startsAt: dateTime(day?.startsAt || day?.presentationAt || day?.presentation),
    endsAt: dateTime(day?.endsAt || day?.releaseAt),
    legs
  };
}

function sanitizeLeg(leg) {
  if (!leg || typeof leg !== 'object') return null;
  return {
    flightNumber: cleanText(leg.flightNumber || leg.flight || leg.number, 20) || null,
    origin: airport(leg.origin || leg.originAirport),
    destination: airport(leg.destination || leg.destinationAirport),
    departureAt: dateTime(leg.departureAt || leg.departureDateTime || leg.startsAt),
    arrivalAt: dateTime(leg.arrivalAt || leg.arrivalDateTime || leg.endsAt)
  };
}

function dayType(day = {}) {
  const raw = cleanText(day.type || day.kind || day.status || day.activity || '', 80)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  if (/\b(FOLGA|OFF|FREE DAY|FREE_DAY)\b/.test(raw)) return raw.includes('FOLGA') ? 'FOLGA' : raw.includes('OFF') ? 'OFF' : 'FREE_DAY';
  if (/SOBREAVISO/.test(raw)) return 'STANDBY';
  if (/RESERVA/.test(raw)) return 'RESERVE';
  if (/TREIN/.test(raw)) return 'TRAINING';
  if (/VOO|FLIGHT/.test(raw)) return 'FLIGHT';
  if (/JORNADA|DUTY/.test(raw)) return 'DUTY';
  return raw || 'UNKNOWN';
}

function airport(value) {
  const text = String(value || '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(text) ? text : null;
}

function dateOnly(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const parsed = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : text;
}

function dateTime(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function integer(value, min, max) {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : null;
}
