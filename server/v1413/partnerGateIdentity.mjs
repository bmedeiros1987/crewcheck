const GATE_SOURCE_CLASSES = Object.freeze(['user_reported', 'crewcheck_verified', 'public_airport_source', 'licensed_provider', 'unclassified']);

export function normalizePartnerFlight(value = '') {
  const raw = String(value || '').replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z0-9]{2,3}\d{1,5}[A-Z]?$/.test(raw)) return '';
  if (/^LAN\d+/i.test(raw)) return `LA${raw.replace(/^LAN/i, '')}`;
  if (/^TAM\d+/i.test(raw)) return `JJ${raw.replace(/^TAM/i, '')}`;
  return raw;
}

export function normalizeAirport(value = '') {
  const code = String(value || '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : '';
}

export function parsePartnerScopes(value = '') {
  const values = Array.isArray(value) ? value : String(value || '').split(/[\s,]+/);
  return [...new Set(values.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean))];
}

export function normalizeGateSourceClass(value = '') {
  const sourceClass = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return GATE_SOURCE_CLASSES.includes(sourceClass) ? sourceClass : 'unclassified';
}
