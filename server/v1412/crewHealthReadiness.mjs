import { cleanText, readBody, requireIdentity, sendJson } from '../v139/common.mjs';

const MAX_BODY_BYTES = 64 * 1024;
const CIVP_TYPE = 'CIVP_YELLOW_FEVER';

export function crewHealthReadinessCapabilities() {
  return {
    version: '1.0',
    surface: 'CREWCHECK_NATIVE',
    purpose: 'Operational readiness for crew international health documents without building a general medical record.',
    documents: [{
      type: CIVP_TYPE,
      label: 'CIVP Febre Amarela',
      operationalProfile: 'INTERNATIONAL_CREW',
      validity: 'LIFETIME_AFTER_VALID_FROM',
      primaryDoseValidAfterDays: 10
    }],
    privacy: {
      fullVaccinationHistoryRequired: false,
      medicalRecordRequired: false,
      minimumOperationalStatusOnly: true,
      localEncryptedDocumentPreferred: true
    },
    officialGuidance: {
      meuSusDigital: 'https://meususdigital.saude.gov.br/',
      govBrCivp: 'https://www.gov.br/pt-br/servicos/obter-o-certificado-internacional-de-vacinacao-e-profilaxia',
      anvisaCivp: 'https://www.gov.br/anvisa/pt-br/assuntos/paf/certificado-internacional-de-vacinacao'
    }
  };
}

export function buildCrewHealthReadiness(input = {}) {
  const internationalDuty = input.internationalDuty === true || input.profile === 'INTERNATIONAL_CREW';
  const civp = normalizeCivp(input.civp || input.documents?.find?.((item) => String(item?.type || '').toUpperCase().includes('CIVP')) || {});

  let status = 'READY';
  let action = null;
  let message = 'CIVP de febre amarela disponível para prontidão internacional.';

  if (!civp.present) {
    status = internationalDuty ? 'BLOCKED' : 'ACTION_REQUIRED';
    action = 'OBTAIN_OR_STORE_CIVP';
    message = internationalDuty
      ? 'CIVP de febre amarela não localizado. Regularize antes da programação internacional.'
      : 'Cadastre o CIVP de febre amarela no CrewLocker para manter sua carteira operacional pronta.';
  } else if (civp.validFrom && civp.validFrom > new Date(input.at || Date.now())) {
    status = 'BLOCKED';
    action = 'WAIT_UNTIL_CIVP_VALID';
    message = `O CIVP informado ainda não estará válido nesta data. Validade internacional a partir de ${isoDate(civp.validFrom)}.`;
  } else if (civp.verification === 'PENDING') {
    status = 'ATTENTION';
    action = 'VERIFY_CIVP_DOCUMENT';
    message = 'CIVP armazenado, mas ainda aguardando validação do documento.';
  }

  return {
    ok: true,
    status,
    operationalReady: status === 'READY',
    internationalDuty,
    document: {
      type: CIVP_TYPE,
      present: civp.present,
      validFrom: civp.validFrom ? isoDate(civp.validFrom) : null,
      verification: civp.verification
    },
    action,
    message,
    privacy: {
      vaccinationHistoryShared: false,
      medicalDataShared: false,
      minimumOperationalStatusOnly: true
    }
  };
}

export async function handleCrewHealthReadinessRoute(req, res, url) {
  if (!url.pathname.startsWith('/api/crew/health-readiness')) return false;
  const identity = await requireIdentity(req, res);
  if (!identity) return true;

  if (req.method === 'GET' && url.pathname === '/api/crew/health-readiness/capabilities') {
    sendJson(res, 200, crewHealthReadinessCapabilities());
    return true;
  }
  if (req.method === 'POST' && url.pathname === '/api/crew/health-readiness/preview') {
    const body = await readBody(req, MAX_BODY_BYTES);
    sendJson(res, 200, buildCrewHealthReadiness(body || {}));
    return true;
  }
  sendJson(res, 405, { ok: false, message: cleanText('Método não permitido.', 80) });
  return true;
}

function normalizeCivp(input = {}) {
  const administeredAt = safeDate(input.administeredAt || input.vaccinationDate);
  const explicitValidFrom = safeDate(input.validFrom);
  const validFrom = explicitValidFrom || (administeredAt ? addDays(administeredAt, 10) : null);
  const verification = input.verification === 'VERIFIED' || input.verified === true ? 'VERIFIED' : input.verification === 'PENDING' ? 'PENDING' : 'DECLARED';
  return { present: input.present === true || Boolean(input.fileStored || input.documentId), validFrom, verification };
}

function safeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
function addDays(date, days) {
  const out = new Date(date.getTime());
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}
function isoDate(date) { return date.toISOString().slice(0, 10); }
