import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { GOOGLE_IDENTITY_SCOPE, verifyGoogleIdToken } from '../server/mobile/google-identity-oidc.mjs';

const read = (path) => fs.readFileSync(path, 'utf8');
const bridge = read('server/mobile/google-identity-oidc.mjs');
const client = read('client/src/lib/googleIdentityAuth.ts');
const linkCard = read('client/src/components/GoogleIdentityLinkCard.tsx');
const authClient = read('client/src/lib/authClient.ts');
const authPage = read('client/src/pages/AuthPage.tsx');
const home = read('client/src/pages/Home.tsx');
const server = read('server.mjs');
const prepare = read('scripts/v139/apply.mjs');

assert.equal(GOOGLE_IDENTITY_SCOPE, 'openid email profile');
assert.doesNotMatch(GOOGLE_IDENTITY_SCOPE, /gmail|calendar/i);
assert.match(bridge, /code_challenge_method: 'S256'/);
assert.match(bridge, /nonce,/);
assert.match(bridge, /email_verified !== true/);
assert.match(bridge, /link_required/);
assert.match(bridge, /Entre com e-mail e senha uma vez e vincule esta Conta Google/);
assert.match(bridge, /body\.confirmLink !== true/);
assert.match(bridge, /existingProviderLink\.payload\.user\.sub !== owner\.sub/);
assert.match(bridge, /existingCrewLink\.payload\.providerKey !== providerKey/);
assert.match(bridge, /claimOnce\(completionKey\(state\)/);
assert.match(bridge, /GOOGLE_IDENTITY_ALREADY_COMPLETED/);
assert.match(bridge, /context\.issueSession/);
assert.doesNotMatch(bridge, /persistSession/);
assert.match(bridge, /database-encrypted/);
assert.doesNotMatch(bridge, /local-fallback|writeFileSync/);
assert.match(server, /handleGoogleIdentityRoute\(req, res, url, \{/);
assert.match(server, /issueSession: \(response, user, message\) => cc1371Issue\(response, user, message\)/);
assert.match(prepare, /mobile-google-identity\/apply\.mjs/);
assert.match(client, /intent: 'login'/);
assert.match(client, /intent: 'link', confirmLink: true/);
assert.match(client, /nativeWindow\.CrewCheckNative\?\.openExternal/);
assert.match(client, /persistExternalAuthSession\(session\)/);
assert.match(client, /Configurações/);
assert.match(linkCard, /não concede acesso ao Gmail nem ao Google Calendar/);
assert.match(linkCard, /Calendar separado/);
assert.match(authClient, /export function persistExternalAuthSession/);
assert.match(authPage, /Entrar com Google/);
assert.match(home, /<GoogleIdentityLinkCard\/>/);

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' });
jwk.kid = 'test-key';
jwk.alg = 'RS256';
jwk.use = 'sig';
const now = Math.floor(Date.now() / 1000);
const clientId = 'crewcheck-test.apps.googleusercontent.com';
const nonce = 'nonce-exato';

function token(overrides = {}, signer = privateKey) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'test-key' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: 'https://accounts.google.com',
    aud: clientId,
    sub: 'google-sub-imutavel',
    email: 'crew@example.com',
    email_verified: true,
    nonce,
    iat: now - 5,
    exp: now + 300,
    ...overrides,
  })).toString('base64url');
  const signature = crypto.sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), signer).toString('base64url');
  return `${header}.${payload}.${signature}`;
}

const valid = await verifyGoogleIdToken(token(), { clientId, nonce }, { jwks: [jwk], nowSeconds: now });
assert.equal(valid.sub, 'google-sub-imutavel');

await assert.rejects(() => verifyGoogleIdToken(token({ iss: 'https://example.com' }), { clientId, nonce }, { jwks: [jwk], nowSeconds: now }), /Emissor/);
await assert.rejects(() => verifyGoogleIdToken(token({ aud: 'outro-cliente' }), { clientId, nonce }, { jwks: [jwk], nowSeconds: now }), /Audiência/);
await assert.rejects(() => verifyGoogleIdToken(token({ exp: now - 120 }), { clientId, nonce }, { jwks: [jwk], nowSeconds: now }), /expirado/);
await assert.rejects(() => verifyGoogleIdToken(token({ nonce: 'nonce-trocado' }), { clientId, nonce }, { jwks: [jwk], nowSeconds: now }), /Nonce/);
await assert.rejects(() => verifyGoogleIdToken(token({ email_verified: false }), { clientId, nonce }, { jwks: [jwk], nowSeconds: now }), /não confirmou/);
const attacker = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
await assert.rejects(() => verifyGoogleIdToken(token({}, attacker), { clientId, nonce }, { jwks: [jwk], nowSeconds: now }), /Assinatura/);

console.log('OK: contrato Mobile de identidade Google valida assinatura/issuer/audience/exp/nonce e não auto-vincula contas nem mistura Calendar/Gmail.');
