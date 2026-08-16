import fs from 'node:fs';

const homePath = 'client/src/pages/Home.tsx';
if (!fs.existsSync(homePath)) throw new Error('[p0-route-active-first-alert] Home.tsx ausente.');

const before = fs.readFileSync(homePath, 'utf8');
const stale = `    if (previous === fingerprint) return;\n    lastAlertedIncidentFingerprintRef.current = fingerprint;\n    storage.set(signatureKey, fingerprint);\n    if (!previous) return;\n    const critical = incidents.find((item) => item.roadClosure || item.severity === 'critical');`;
const fixed = `    if (previous === fingerprint) return;\n    lastAlertedIncidentFingerprintRef.current = fingerprint;\n    storage.set(signatureKey, fingerprint);\n    const critical = incidents.find((item) => item.roadClosure || item.severity === 'critical');`;

let after = before;
if (after.includes(stale)) {
  after = after.replace(stale, fixed);
} else if (!after.includes(fixed)) {
  throw new Error('[p0-route-active-first-alert] Âncora de deduplicação de incidente não localizada.');
}

if (after !== before) fs.writeFileSync(homePath, after, 'utf8');
console.log('[p0-route-active-first-alert] primeira ocorrência ativa alerta uma vez; fingerprint persistida impede repetição em refresh/reload.');
