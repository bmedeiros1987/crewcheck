import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createOfflineInfobipReceiver, prepareOfflineInfobipReply, verifyInfobipBasic,
  infobipDeliveryState, infobipWhatsAppReleaseResponse, INFOBIP_WHATSAPP_RELEASE_ENABLED,
} from '../server/infobip-whatsapp-candidate.mjs';

// Synthetic data only. No live phone, credentials, DB, HTTP server or transport.
globalThis.fetch = () => { throw new Error('NETWORK_FORBIDDEN'); };
const sender = '12025550100', recipient = '12025550101', other = '12025550102';
const username = 'offline-fixture', password = 'synthetic-password-never-a-real-secret';
const clock = Date.parse('2032-01-01T12:00:00.000Z');
const headers = ['Authorization', `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`];
const item = (changes = {}) => ({ from: recipient, to: sender, integrationType: 'WHATSAPP',
  receivedAt: '2032-01-01T12:00:00.000+0000', messageId: 'synthetic-message-1', message: { type: 'TEXT', text: 'synthetic question' }, ...changes });
const packet = (changes = {}) => ({ method: 'POST', rawHeaders: headers, rawBody: Buffer.from(JSON.stringify({ results: [item()] })), ...changes });
const active = () => ({ accountId: 'synthetic-account-A', revision: 'binding-1', provider: 'infobip', sender, recipient, consentConcierge: true, revoked: false });

// Explicit synthetic serializable transactional store. It is NOT a production
// durability implementation, nor evidence of real SQL isolation or persistence.
function fixture() {
  const state = { claims: new Map(), queue: [], link: active(), down: false, failEnqueue: false,
    changeDuringClaim: false, uncertainCommit: false, reads: 0, transactions: 0 };
  let tail = Promise.resolve();
  const store = { transaction: fn => {
    const result = tail.then(async () => {
      state.transactions++;
      if (state.down) throw Error('synthetic-storage-failure');
      const claims = new Map(state.claims), queue = [...state.queue];
      const value = await fn({
        lookupLink: async () => { state.reads++; return state.link && { ...state.link }; },
        claim: async (key, digest) => {
          if (state.changeDuringClaim) state.link = { ...state.link, revision: 'binding-2' };
          if (claims.has(key)) return claims.get(key) === digest ? 'duplicate' : 'conflict';
          claims.set(key, digest); return 'new';
        },
        enqueue: async job => { if (state.failEnqueue) throw Error('synthetic-enqueue-failure'); queue.push(job); },
      });
      state.claims = claims; state.queue = queue;
      if (state.uncertainCommit) { state.uncertainCommit = false; throw Error('synthetic-uncertain-commit'); }
      return value;
    });
    tail = result.catch(() => {}); return result;
  } };
  const receive = createOfflineInfobipReceiver({ sender, username, password, store, now: () => clock });
  return { state, receive, store };
}

assert.equal(INFOBIP_WHATSAPP_RELEASE_ENABLED, false);
assert.deepEqual(infobipWhatsAppReleaseResponse(), { status: 503, code: 'INFOBIP_WHATSAPP_DISABLED' });
assert(verifyInfobipBasic(headers, username, password));
for (const rawHeaders of [[], [...headers, ...headers], ['x-hub-signature', 'sha256=synthetic'],
  ['authorization', headers[1] + ' '], ['authorization', headers[1] + ', ' + headers[1]],
  ['authorization', 'Bearer synthetic'], ['authorization', headers[1], 'odd']]) {
  const { receive, state } = fixture();
  assert.equal((await receive(packet({ rawHeaders }))).status, 401);
  assert.equal(state.transactions, 0);
}
assert(!verifyInfobipBasic(headers, username, 'short'));
assert(!verifyInfobipBasic(headers, 'invalid:user', password));

for (const event of [item({to: other}), item({from: 'US.synthetic12345678'}), item({from: '+' + recipient}),
  item({from: 'user-' + recipient}), item({integrationType: 'RCS'}), item({messageId: ''}),
  item({receivedAt: 'invalid'}), item({receivedAt: '2031-12-21T11:59:59.999Z'}),
  item({receivedAt: '2032-01-01T12:00:30.001Z'}), item({message: {type: 'DOCUMENT', url: 'https://example.invalid/file'}}),
  item({message: {type: 'TEXT', text: 'x'.repeat(4001)}}), item({message: {type: 'TEXT', text: '   '}}),
  item({contact: {phoneNumber: other}}), item({status: {groupId: 3}}), item({seenAt: 'now'})]) {
  const { receive, state } = fixture();
  assert.equal((await receive(packet({rawBody: Buffer.from(JSON.stringify({results: [event]}))}))).status, 400);
  assert.equal(state.transactions, 0);
}
for (const rawBody of [Buffer.alloc(65537), Buffer.from('{'), Buffer.from('{}'), Buffer.from('{"results":[]}'),
  Buffer.from(JSON.stringify({results: Array.from({length: 21}, () => item())})),
  Buffer.from(JSON.stringify({results: [item(), item({to: other})]}))]) {
  const { receive, state } = fixture(); assert.equal((await receive(packet({rawBody}))).status, 400);
  assert.equal(state.transactions, 0, 'validate entire batch before any effect');
}
{
  const { receive, state } = fixture(); assert.equal((await receive(packet({method: 'GET'}))).status, 405);
  const results = await Promise.all(Array.from({length: 20}, () => receive(packet())));
  assert.equal(results.reduce((n, x) => n + x.accepted, 0), 1);
  assert.equal(results.reduce((n, x) => n + x.duplicates, 0), 19); assert.equal(state.queue.length, 1);
  const rotatedPassword = 'synthetic-rotated-password-not-a-secret';
  const recreated = createOfflineInfobipReceiver({sender, username, password: rotatedPassword, store: {transaction: async fn => fn({
    lookupLink: async () => state.link, claim: async key => state.claims.has(key) ? 'duplicate' : 'new',
    enqueue: async () => assert.fail('restart must not enqueue duplicate'),
  })}, now: () => clock});
  const rotatedHeaders = ['authorization', `Basic ${Buffer.from(`${username}:${rotatedPassword}`).toString('base64')}`];
  assert.equal((await recreated(packet({rawHeaders: rotatedHeaders}))).duplicates, 1, 'credential rotation preserves dedup keys');
  assert.equal((await receive(packet({rawBody: Buffer.from(JSON.stringify({results: [item({message: {type: 'TEXT', text: 'changed'}})]}))}))).status, 503);
  assert.equal(state.queue.length, 1, 'same ID with changed content fails closed');
}
for (const replacement of [null, {...active(), accountId: ''}, {...active(), revision: ''}, {...active(), provider: 'meta'},
  {...active(), sender: other}, {...active(), recipient: other}, {...active(), consentConcierge: false}, {...active(), revoked: true}]) {
  const { receive, state } = fixture(); state.link = replacement;
  assert.equal((await receive(packet())).denied, 1); assert.equal(state.queue.length, 0); assert.equal(state.claims.size, 0);
}
for (const flag of ['down', 'failEnqueue', 'changeDuringClaim']) {
  const {receive, state} = fixture(); state[flag] = true;
  assert.equal((await receive(packet())).status, 503); assert.equal(state.queue.length, 0); assert.equal(state.claims.size, 0);
  state[flag] = false; assert.equal((await receive(packet())).accepted, 1, 'rollback must allow retry');
}
{
  const {receive, state} = fixture(); state.uncertainCommit = true;
  assert.equal((await receive(packet())).status, 503); assert.equal((await receive(packet())).duplicates, 1);
  assert.equal(state.queue.length, 1, 'uncertain commit retry must not duplicate');
}
{
  const {receive, state} = fixture(); await receive(packet()); const job = state.queue[0];
  let engineCalls = 0;
  const dependencies = {lookupLink: async () => state.link, concierge: async () => {engineCalls++; return 'synthetic reply';}, now: () => clock};
  const reply = await prepareOfflineInfobipReply(job, dependencies);
  assert.equal(reply.sender, sender); assert.equal(reply.recipient, recipient); assert.equal(reply.provider, 'infobip');
  for (const replacement of [null, {...active(), revision: 'new'}, {...active(), accountId: 'synthetic-account-B'}, {...active(), revoked: true}, {...active(), consentConcierge: false}, {...active(), sender: other}, {...active(), recipient: other}]) {
    state.link = active();
    assert.equal(await prepareOfflineInfobipReply(job, {...dependencies, concierge: async () => {state.link = replacement; return 'private reply';}}), null);
  }
  state.link = null; const before = engineCalls;
  assert.equal(await prepareOfflineInfobipReply(job, dependencies), null); assert.equal(engineCalls, before);
  state.link = active(); assert.equal(await prepareOfflineInfobipReply(job, {...dependencies, now: () => clock + 900001}), null);
  assert.equal(await prepareOfflineInfobipReply({...job, recipient: other}, dependencies), null);
  assert.equal(await prepareOfflineInfobipReply(job, {...dependencies, concierge: async () => {throw Error('synthetic');}}), null);
}
assert.equal(infobipDeliveryState({groupId: 1, groupName: 'PENDING', id: 26, name: 'PENDING_ACCEPTED'}), 'unconfirmed');
assert.equal(infobipDeliveryState({groupId: 3, groupName: 'DELIVERED', id: 5, name: 'DELIVERED_TO_HANDSET'}), 'delivered');
for (const status of [null, {}, {groupName: 'DELIVERED'}, {groupId: 3, groupName: 'DELIVERED', id: 26, name: 'PENDING_ACCEPTED'}]) assert.equal(infobipDeliveryState(status), 'unconfirmed');
const source = fs.readFileSync(new URL('../server/infobip-whatsapp-candidate.mjs', import.meta.url), 'utf8');
assert(!/\b(?:fetch|console|process\.env)\s*[.(]/.test(source), 'candidate has no network, logs or env activation');
assert(!fs.readFileSync('server.mjs', 'utf8').includes('infobip-whatsapp-candidate'), 'production never imports the offline receiver directly');
console.log('PASS Infobip candidate: auth, strict inbound, binding, consent, atomic synthetic queue, concurrent dedup, rollback/retry, replay, reply revocation, status distinction; RELEASE OFF');
