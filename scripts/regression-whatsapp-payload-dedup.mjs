import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync('server/whatsapp.mjs', 'utf8');
const processSource = source.slice(source.indexOf('async function processWhatsAppPayload('), source.indexOf('function webhookHealth('));
const dispatched = [], claimed = new Set();
const context = vm.createContext({
  extractWhatsAppStatusDiagnostics: () => [], persistWhatsAppStatusDiagnostic: async () => {},
  whatsappPdfEnabled:()=>false,whatsappPdfConfiguration:null,
  Set, console: { info() {} }, payloadHash: () => 'synthetic-hash',
  extractWhatsAppEvents: payload => payload.events,
  extractWhatsAppInboundMessages: payload => payload.messages,
  claimInMemory: id => { if (claimed.has(id)) return false; claimed.add(id); return true; },
  claimPersistentEvent: async () => true,
  handleInboundMessage: async message => dispatched.push(message.id),
});
vm.runInContext(processSource, context);
const event = id => ({ eventId: `message:${id}` });
const payload = { events: [event('A'), event('A'), event('B')], messages: [{ id: 'A' }, { id: 'A' }, { id: 'B' }, { id: 'unclaimed' }] };
await context.processWhatsAppPayload(payload, Buffer.alloc(0));
assert.deepEqual(dispatched, ['A', 'B']);
await context.processWhatsAppPayload(payload, Buffer.alloc(0));
assert.deepEqual(dispatched, ['A', 'B']);
console.log('PASS duplicate items within payload and webhook replay dispatch each claimed message once; zero external calls');
