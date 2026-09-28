import assert from 'node:assert/strict';
import fs from 'node:fs';

const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const start = home.indexOf("const incidents = route?.incidents || [];");
const end = home.indexOf("}, [route?.updatedAt, event.id]);", start);
assert.ok(start >= 0 && end > start, 'effect de alerta de incidente de rota deve existir');
const alertBlock = home.slice(start, end);

assert.ok(alertBlock.includes("const signatureKey = `crewcheck_route_incident_signature_${event.id}`;"), 'dedupe persistida por evento deve permanecer');
assert.ok(alertBlock.includes("const previous = lastAlertedIncidentFingerprintRef.current ?? storage.get(signatureKey, '');"), 'estado persistido deve participar da deduplicação');
assert.ok(alertBlock.includes('if (previous === fingerprint) return;'), 'mesma ocorrência ativa não deve alertar novamente');
assert.ok(alertBlock.includes('storage.set(signatureKey, fingerprint);'), 'fingerprint deve ser persistida antes da entrega');
assert.ok(!alertBlock.includes('if (!previous) return;'), 'primeira ocorrência ativa não pode ser silenciada');
assert.ok(alertBlock.includes("const critical = incidents.find((item) => item.roadClosure || item.severity === 'critical');"), 'severidade ativa deve continuar distinguindo bloqueio crítico');
assert.ok(alertBlock.includes('notifyCrewCheck(title, body);'), 'primeira ocorrência ativa deve continuar apta a notificar');
assert.ok(alertBlock.includes('toast.warning(title, { description: body });'), 'primeira ocorrência ativa deve continuar apta a aparecer na UI');

const persistedAt = alertBlock.indexOf('storage.set(signatureKey, fingerprint);');
const notifyAt = alertBlock.indexOf('notifyCrewCheck(title, body);');
assert.ok(persistedAt >= 0 && notifyAt > persistedAt, 'dedupe deve ser persistida antes da entrega para resistir a remount/reload');

console.log('[p0-maps-active-first-alert] OK — incidente ativo alerta no primeiro encontro e não repete após fingerprint persistida.');
