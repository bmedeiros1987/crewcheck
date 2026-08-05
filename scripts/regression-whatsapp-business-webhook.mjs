import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { Readable } from 'node:stream';

process.env.WHATSAPP_VERIFY_TOKEN = 'crewcheck-test-verify-token';
process.env.META_APP_SECRET = 'crewcheck-test-app-secret';
process.env.CREWCHECK_WHATSAPP_AUDIT_SALT = 'crewcheck-test-audit-salt';
delete process.env.DATABASE_URL;
delete process.env.CREWCHECK_DATABASE_URL;
delete process.env.MYSQL_URL;

await import('./v14382/apply.mjs');
const {
  extractWhatsAppEvents,
  handleWhatsAppRoute,
  verifyWhatsAppSignature,
} = await import('../server/whatsapp.mjs');

function responseRecorder() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    writeHead(status, headers = {}) {
      this.statusCode = status;
      this.headers = headers;
    },
    end(value = '') {
      this.body += String(value || '');
    },
  };
}

async function runGet(query) {
  const req = { method: 'GET', headers: {} };
  const res = responseRecorder();
  const url = new URL(`https://crewcheck.online/api/whatsapp/webhook?${query}`);
  const handled = await handleWhatsAppRoute(req, res, url);
  return { handled, res };
}

async function runPost(payload, signature) {
  const raw = Buffer.from(JSON.stringify(payload));
  const req = Readable.from([raw]);
  req.method = 'POST';
  req.headers = { 'x-hub-signature-256': signature };
  const res = responseRecorder();
  const url = new URL('https://crewcheck.online/api/whatsapp/webhook');
  const handled = await handleWhatsAppRoute(req, res, url);
  return { handled, res, raw };
}

const verified = await runGet('hub.mode=subscribe&hub.verify_token=crewcheck-test-verify-token&hub.challenge=crewcheck-ok');
assert.equal(verified.handled, true);
assert.equal(verified.res.statusCode, 200);
assert.equal(verified.res.body, 'crewcheck-ok');
assert.match(String(verified.res.headers['content-type']), /^text\/plain/);

const rejected = await runGet('hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=no');
assert.equal(rejected.res.statusCode, 403);
assert.notEqual(rejected.res.body, 'no');

const payload = {
  object: 'whatsapp_business_account',
  entry: [{
    id: 'waba-test',
    changes: [{
      field: 'messages',
      value: {
        metadata: { phone_number_id: 'phone-id-test' },
        messages: [{ id: 'wamid.test', from: '5511999999999', type: 'text', text: { body: 'conteúdo sensível não deve ser persistido' } }],
      },
    }],
  }],
};
const raw = Buffer.from(JSON.stringify(payload));
const signature = `sha256=${crypto.createHmac('sha256', process.env.META_APP_SECRET).update(raw).digest('hex')}`;
assert.equal(verifyWhatsAppSignature(raw, signature), true);
assert.equal(verifyWhatsAppSignature(raw, 'sha256=invalid'), false);

const events = extractWhatsAppEvents(payload, raw);
assert.equal(events.length, 1);
assert.equal(events[0].eventId, 'message:wamid.test');
assert.equal(events[0].eventType, 'message.text');
assert.ok(events[0].subjectHash);
assert.equal(JSON.stringify(events).includes('conteúdo sensível'), false);
assert.equal(JSON.stringify(events).includes('5511999999999'), false);

const accepted = await runPost(payload, signature);
assert.equal(accepted.handled, true);
assert.equal(accepted.res.statusCode, 200);
assert.deepEqual(JSON.parse(accepted.res.body), { ok: true, queued: true });

const badSignature = await runPost(payload, 'sha256=invalid');
assert.equal(badSignature.res.statusCode, 401);

const healthReq = { method: 'GET', headers: {} };
const healthRes = responseRecorder();
assert.equal(await handleWhatsAppRoute(healthReq, healthRes, new URL('https://crewcheck.online/api/whatsapp/health')), true);
assert.equal(healthRes.statusCode, 200);
const health = JSON.parse(healthRes.body);
assert.equal(health.inbound, true);
assert.equal(health.callbackPath, '/api/whatsapp/webhook');
assert.equal(JSON.stringify(health).includes(process.env.META_APP_SECRET), false);
assert.equal(JSON.stringify(health).includes(process.env.WHATSAPP_VERIFY_TOKEN), false);

const serverSource = fs.readFileSync('server.mjs', 'utf8');
assert.match(serverSource, /import \{ handleWhatsAppRoute \} from '\.\/server\/whatsapp\.mjs';/);
assert.match(serverSource, /if \(await handleWhatsAppRoute\(req, res, url\)\) return;/);
assert.ok(serverSource.indexOf('handleWhatsAppRoute(req, res, url)') < serverSource.indexOf('handleV139Route(req, res, url)'));

const render = fs.readFileSync('render.yaml', 'utf8');
for (const key of ['WHATSAPP_VERIFY_TOKEN', 'META_APP_SECRET', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_BUSINESS_ACCOUNT_ID', 'WHATSAPP_BUSINESS_NUMBER']) {
  assert.ok(render.includes(`- key: ${key}`), `${key} deve estar declarado no Render`);
}
assert.doesNotMatch(render, /WHATSAPP_BUSINESS_NUMBER\s*\n\s*value:/);

const envExample = fs.readFileSync('.env.example', 'utf8');
assert.match(envExample, /# Official WhatsApp Business Platform \(Cloud API\)/);
assert.match(envExample, /WHATSAPP_VERIFY_TOKEN=\n/);
assert.match(envExample, /META_APP_SECRET=\n/);

console.log('[regression:whatsapp-business] verificação, assinatura, privacidade, idempotência e configuração validadas.');
