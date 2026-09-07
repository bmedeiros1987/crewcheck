import assert from 'node:assert/strict';

process.env.CREWCHECK_PARTNER_WEBHOOK_ENCRYPTION_KEY = 'test-only-partner-webhook-encryption-key-32-bytes-minimum';

const {
  decryptWebhookSecret,
  encryptWebhookSecret,
  gateEventPayload,
  isPrivateAddress,
  normalizeWebhookUrl,
  webhookSignature,
} = await import('../server/v1413/partnerGateWebhooks.mjs');

assert.equal(normalizeWebhookUrl('https://partner.example.com/hooks/crewcheck'), 'https://partner.example.com/hooks/crewcheck');
assert.equal(normalizeWebhookUrl('http://partner.example.com/hooks'), '');
assert.equal(normalizeWebhookUrl('https://localhost/hook'), '');
assert.equal(normalizeWebhookUrl('https://partner.example.com:8443/hook'), '');
assert.equal(normalizeWebhookUrl('https://user:pass@partner.example.com/hook'), '');

for (const address of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.10', '169.254.10.2', '100.64.1.1', '::1', 'fc00::1', 'fe80::1']) {
  assert.equal(isPrivateAddress(address), true, `${address} must be private`);
}
assert.equal(isPrivateAddress('8.8.8.8'), false);
assert.equal(isPrivateAddress('2606:4700:4700::1111'), false);

const originalSecret = 'whsec_test_super_secret_value';
const ciphertext = encryptWebhookSecret(originalSecret);
assert.notEqual(ciphertext.includes(originalSecret), true);
assert.equal(decryptWebhookSecret(ciphertext), originalSecret);

const signature = webhookSignature('secret', '1700000000', '{"ok":true}');
assert.match(signature, /^v1=[a-f0-9]{64}$/);
assert.equal(signature, webhookSignature('secret', '1700000000', '{"ok":true}'));
assert.notEqual(signature, webhookSignature('secret', '1700000001', '{"ok":true}'));

const event = gateEventPayload({ id: 42, flight: 'LA3729', origin: 'GRU', destination: 'BSB' }, {
  ok: true,
  flight: 'LA3729',
  origin: 'GRU',
  destination: 'BSB',
  gate: '325',
  terminal: '3',
  status: 'Programado',
  quality: 91,
}, '322', new Date('2026-08-26T16:00:00.000Z'), 'evt_contract_1');

assert.deepEqual(event, {
  id: 'evt_contract_1',
  type: 'flight.gate.updated',
  apiVersion: 'v1',
  createdAt: '2026-08-26T16:00:00.000Z',
  data: {
    flight: 'LA3729',
    origin: 'GRU',
    destination: 'BSB',
    previousGate: '322',
    gate: '325',
    terminal: '3',
    flightStatus: 'Programado',
    confidence: 0.91,
    confidenceBand: 'high',
    source: 'crewcheck-radar',
    reason: 'changed',
    occurrenceMatch: 'live-flight-route',
    watchId: 42,
  },
});

const assignment = gateEventPayload({ id: 43, flight: 'LA3730', origin: 'BSB', destination: 'GRU' }, {
  ok: true,
  flight: 'LA3730',
  origin: 'BSB',
  destination: 'GRU',
  gate: '18',
  quality: 65,
}, null, new Date('2026-08-26T16:05:00.000Z'), 'evt_contract_2');
assert.equal(assignment.data.reason, 'assigned');
assert.equal(assignment.data.previousGate, null);
assert.equal(assignment.data.confidenceBand, 'medium');

console.log('partner-gate-webhooks regression: PASS');
