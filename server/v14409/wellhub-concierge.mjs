import { detectWellhubPlanFromText } from '../v14407/wellhub.mjs';

function normalize(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function isWellhubPlanPreferenceMessage(text = '') {
  const raw = String(text || '').trim();
  const detected = detectWellhubPlanFromText(raw);
  if (!detected) return false;
  if (/\b(plano|wellhub|gympass)\b/i.test(raw)) return true;
  return /^(?:digital|starter|basic(?:\+|\s+plus)?|silver(?:\+|\s+plus)?|gold(?:\+|\s+plus)?|platinum|diamond(?:\+|\s+plus)?)$/i.test(raw);
}

export function filterWellhubPartnersForLocation(partners = [], { city = '', state = '' } = {}) {
  const cityKey = normalize(city);
  const stateKey = normalize(state);
  if (!cityKey && !stateKey) return [...partners];
  return (partners || []).filter((partner) => {
    if (cityKey) return normalize(partner?.city) === cityKey;
    return normalize(partner?.state) === stateKey;
  });
}
