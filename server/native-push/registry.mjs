import crypto from 'node:crypto';

// Unmounted primitives only. No server route, scheduler or environment activation.
export const NATIVE_REGISTRY_ENABLED = false;
export const NATIVE_PROJECT = 'api-project-627296893301';
export const NATIVE_PACKAGE = 'com.crewcheck.app';
const PREFIX = 'crewcheck-native-push:';
const fail = (code, status = 409) => { throw Object.assign(new Error(code), { code, status }); };
const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{8,160}$/.test(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const bindingPrefix = identity => PREFIX + 'binding:' + digest(identity.ownerId) + ':';
export const nativeBindingKey = (identity, installationId) => bindingPrefix(identity) + digest(installationId);
const tokenKey = tokenHash => PREFIX + 'token:' + tokenHash;
function identityChecked(identity) {
  if (!id(identity?.ownerId) || typeof identity.email !== 'string' || identity.email.length > 254 || !identity.email.includes('@')) fail('NATIVE_IDENTITY_REQUIRED', 401);
}
function checked(input) {
  identityChecked(input?.identity);
  if (!id(input.installationId) || !id(input.mutationId) || !integer(input.expectedRevision)
      || !integer(input.expectedConsentRevision) || !integer(input.generation) || input.generation < 1
      || !integer(input.tokenRevision) || input.tokenRevision < 1
      || input.project !== NATIVE_PROJECT || input.package !== NATIVE_PACKAGE
      || !['register','rotate','revoke'].includes(input.action)) fail('NATIVE_INVALID_MUTATION', 400);
  if (input.ownerHint !== undefined && input.ownerHint !== input.identity.ownerId) fail('NATIVE_OWNER_HINT_MISMATCH', 401);
  if (input.action !== 'revoke' && (typeof input.token !== 'string' || input.token.length < 20 || input.token.length > 4096 || /[\x00-\x20\x7f]/.test(input.token))) fail('NATIVE_INVALID_TOKEN', 400);
  const tokenHash = input.action === 'revoke' ? null : digest(input.token);
  const fingerprint = digest(JSON.stringify([input.action,input.installationId,input.expectedRevision,input.expectedConsentRevision,input.generation,input.tokenRevision,input.consent === true,tokenHash]));
  return { ...input, tokenHash, fingerprint };
}
function bindingChecked(value, input) {
  if (!value) return;
  if (value.schema !== 1 || value.ownerId !== input.identity.ownerId || value.email !== input.identity.email
      || value.installationId !== input.installationId || !integer(value.revision)
      || !integer(value.consentRevision) || !integer(value.generation) || !integer(value.tokenRevision)
      || typeof value.active !== 'boolean' || value.revision < 1 || value.consentRevision < 1 || value.generation < 1 || value.tokenRevision < 1
      || !id(value.lastMutationId) || !/^[a-f0-9]{64}$/.test(value.lastFingerprint)
      || (value.active && !/^[a-f0-9]{64}$/.test(value.tokenHash))
      || (!value.active && (value.tokenHash !== null || value.sealedToken !== null))) fail('NATIVE_REGISTRY_STATE_INVALID', 503);
}
export function nativeMutationPlan(previous, input, now) {
  input = checked(input); bindingChecked(previous, input);
  if (!Number.isFinite(now) || !Number.isFinite(new Date(now).getTime())) fail('NATIVE_CLOCK_REQUIRED', 503);
  if (previous?.lastMutationId === input.mutationId) {
    if (previous.lastFingerprint !== input.fingerprint) fail('NATIVE_MUTATION_REUSED');
    return { previous, next: previous, duplicate: true };
  }
  if ((previous?.revision || 0) !== input.expectedRevision || (previous?.consentRevision || 0) !== input.expectedConsentRevision) fail('NATIVE_REVISION_CHANGED');
  if (previous && (input.generation < previous.generation || (input.generation === previous.generation && input.tokenRevision < previous.tokenRevision))) fail('NATIVE_STALE_GENERATION');
  if (previous && !previous.active && input.action !== 'revoke' && input.generation <= previous.generation) fail('NATIVE_GENERATION_REVOKED');
  if (input.action === 'rotate' && (!previous?.active || input.generation !== previous.generation || input.tokenRevision <= previous.tokenRevision)) fail('NATIVE_ROTATION_STALE');
  if (input.action === 'register' && input.consent !== true) fail('NATIVE_EXPLICIT_CONSENT_REQUIRED', 400);
  const active = input.action !== 'revoke';
  const next = {
    schema: 1, ownerId: input.identity.ownerId, email: input.identity.email, installationId: input.installationId,
    revision: input.expectedRevision + 1,
    consentRevision: input.expectedConsentRevision + (input.action === 'rotate' ? 0 : 1),
    generation: input.generation, tokenRevision: input.tokenRevision,
    active, tokenHash: active ? input.tokenHash : null, sealedToken: null,
    lastMutationId: input.mutationId, lastFingerprint: input.fingerprint, updatedAt: new Date(now).toISOString(),
  };
  return { previous, next, duplicate: false };
}
function summary(record, duplicate = false) {
  return { installationId: record.installationId, revision: record.revision, consentRevision: record.consentRevision,
    generation: record.generation, tokenRevision: record.tokenRevision, active: record.active, duplicate,
    registryConfirmed: true, received: null };
}
function envelopeChecked(value) {
  const decode = (v, n) => typeof v === 'string' && /^[A-Za-z0-9_-]+$/.test(v) && Buffer.from(v,'base64url').length === n && Buffer.from(v,'base64url').toString('base64url') === v;
  if (!value || value.format !== 'native-token-aes256gcm-v1' || !decode(value.iv,12) || !decode(value.tag,16)
      || typeof value.ciphertext !== 'string' || !/^[A-Za-z0-9_-]{20,6000}$/.test(value.ciphertext)
      || Buffer.from(value.ciphertext,'base64url').toString('base64url') !== value.ciphertext
      || Buffer.from(value.ciphertext,'base64url').length < 20 || Buffer.from(value.ciphertext,'base64url').length > 4096
      || Object.keys(value).some(k => !['format','iv','tag','ciphertext'].includes(k))) fail('NATIVE_PROTECTION_INVALID', 503);
  return value;
}
function parse(value) {
  if (value === null || value === undefined) return null;
  try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { fail('NATIVE_REGISTRY_STATE_INVALID',503); }
}
async function lockState(connection, key) {
  await connection.query('INSERT INTO crewcheck_telegram_state (state_key,payload,updated_at) VALUES(?,?,NOW(3)) ON DUPLICATE KEY UPDATE state_key=state_key',[key,'null']);
  const [rows] = await connection.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE',[key]);
  return parse(rows[0]?.payload);
}
async function write(connection, key, value) {
  await connection.query('UPDATE crewcheck_telegram_state SET payload=?,updated_at=NOW(3) WHERE state_key=?',[JSON.stringify(value),key]);
}
async function lockIdentity(connection, identity) {
  const [rows] = await connection.query('SELECT public_id FROM crewcheck_platform_profiles WHERE email=? FOR UPDATE',[identity.email]);
  if (rows[0]?.public_id !== identity.ownerId) fail('NATIVE_SESSION_REVOKED',401);
}
function storedBindingChecked(record, input) {
  bindingChecked(record,input);
  if (record?.active) { try { envelopeChecked(record.sealedToken); } catch { fail('NATIVE_REGISTRY_STATE_INVALID',503); } }
}
function claimChecked(claim) {
  if (claim && (claim.schema !== 1 || typeof claim.active !== 'boolean' || typeof claim.bindingKey !== 'string' || !claim.bindingKey.startsWith(PREFIX+'binding:') || claim.bindingKey.length > 190 || !integer(claim.revision) || claim.revision < 1)) fail('NATIVE_TOKEN_CLAIM_INVALID',503);
}
async function verifyActiveClaim(connection, bindingKey, record) {
  if (!record?.active) return;
  const [rows] = await connection.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE',[tokenKey(record.tokenHash)]);
  const claim = parse(rows[0]?.payload); claimChecked(claim);
  if (!claim?.active || claim.bindingKey !== bindingKey || claim.revision !== record.revision) fail('NATIVE_TOKEN_CLAIM_CHANGED');
}
// No table creation, ambient credential/key lookup, transport or retry after an
// uncertain commit. The caller must reconcile by mutationId after an unknown ACK.
export async function mutateNativeInstallation(db, raw, { protection, now = Date.now() } = {}) {
  const input = checked(raw);
  if (input.action !== 'revoke' && typeof protection?.seal !== 'function') fail('NATIVE_PROTECTION_REQUIRED',503);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction(); await lockIdentity(connection,input.identity);
    const bindingKey = nativeBindingKey(input.identity,input.installationId);
    const previous = await lockState(connection,bindingKey);
    storedBindingChecked(previous,input);
    const plan = nativeMutationPlan(previous,input,now);
    if (plan.duplicate) { await verifyActiveClaim(connection,bindingKey,plan.next); await connection.commit(); return summary(plan.next,true); }
    const keys = [...new Set([previous?.tokenHash,input.tokenHash].filter(Boolean).map(tokenKey))].sort();
    const claims = new Map();
    for (const key of keys) { const claim = await lockState(connection,key); claimChecked(claim); claims.set(key,claim); }
    if (input.tokenHash) {
      const claim = claims.get(tokenKey(input.tokenHash));
      // Reassignment requires confirmed revocation first; never silently steal
      // a token from another active owner/installation.
      if (claim?.active && claim.bindingKey !== bindingKey) fail('NATIVE_TOKEN_ALREADY_BOUND');
    }
    if (previous?.active && previous.tokenHash) {
      const key = tokenKey(previous.tokenHash), claim = claims.get(key);
      if (!claim?.active || claim.bindingKey !== bindingKey || claim.revision !== previous.revision) fail('NATIVE_TOKEN_CLAIM_CHANGED');
      if (previous.tokenHash !== input.tokenHash) await connection.query('DELETE FROM crewcheck_telegram_state WHERE state_key=?',[key]);
    }
    if (plan.next.active) {
      const context = JSON.stringify([NATIVE_PROJECT,NATIVE_PACKAGE,plan.next.ownerId,plan.next.installationId,plan.next.revision,plan.next.generation,plan.next.tokenRevision,plan.next.consentRevision]);
      // Trusted, explicitly authorized protection adapter only. No fallback to
      // Web Push key or platform room helper (which truncates input to80 chars).
      try { plan.next.sealedToken = envelopeChecked(protection.seal(input.token,context)); }
      catch { fail('NATIVE_PROTECTION_FAILED',503); }
      await write(connection,tokenKey(input.tokenHash),{schema:1,bindingKey,active:true,revision:plan.next.revision});
    }
    await write(connection,bindingKey,plan.next); await connection.commit(); return summary(plan.next);
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
}
export async function readNativeInstallation(db, identity, installationId) {
  identityChecked(identity); if (!id(installationId)) fail('NATIVE_INVALID_INSTALLATION',400);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction(); await lockIdentity(connection,identity);
    const [rows] = await connection.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE',[nativeBindingKey(identity,installationId)]);
    const record = parse(rows[0]?.payload); storedBindingChecked(record,{identity,installationId});
    await verifyActiveClaim(connection,nativeBindingKey(identity,installationId),record);
    await connection.commit();
    return record ? summary(record) : {installationId,revision:0,consentRevision:0,active:false,registryConfirmed:true,received:null};
  } catch(error) { await connection.rollback(); throw error; } finally { connection.release(); }
}
// Host is intentionally OFF; primitives above are never mounted by this change.
export async function nativeRegistryHost() {
  return {enabled:NATIVE_REGISTRY_ENABLED,configured:false,registryConfirmed:false,received:null};
}

// Future integration must supply the existing canonical deletion implementation
// on this SAME SQL connection. This helper is not mounted and replaces no current
// account deletion behavior. It refuses to ACK if the canonical profile remains.
export async function deleteNativeAccountWithRegistry(db, identity, deleteCanonicalAccount) {
  identityChecked(identity);
  if (typeof deleteCanonicalAccount !== 'function') fail('NATIVE_DELETION_CALLBACK_REQUIRED',503);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction(); await lockIdentity(connection,identity);
    const [rows] = await connection.query('SELECT state_key,payload FROM crewcheck_telegram_state WHERE state_key LIKE ? ORDER BY state_key FOR UPDATE',[bindingPrefix(identity)+'%']);
    const records = rows.map(row => {
      const record = parse(row.payload);
      if (!record) fail('NATIVE_REGISTRY_STATE_INVALID',503);
      storedBindingChecked(record,{identity,installationId:record.installationId});
      return {key:row.state_key,record};
    });
    for (const tokenHash of [...new Set(records.map(x=>x.record.tokenHash).filter(Boolean))].sort()) {
      const key = tokenKey(tokenHash), claim = await lockState(connection,key); claimChecked(claim);
      if (claim?.active && !records.some(x=>x.key===claim.bindingKey)) fail('NATIVE_TOKEN_CLAIM_CHANGED');
      await connection.query('DELETE FROM crewcheck_telegram_state WHERE state_key=?',[key]);
    }
    for (const {key} of records) await connection.query('DELETE FROM crewcheck_telegram_state WHERE state_key=?',[key]);
    await deleteCanonicalAccount(connection);
    const [remaining] = await connection.query('SELECT public_id FROM crewcheck_platform_profiles WHERE email=? FOR UPDATE',[identity.email]);
    if (remaining.length) fail('NATIVE_ACCOUNT_DELETION_NOT_CONFIRMED',503);
    await connection.commit(); return {registryDeleted:records.length,registryConfirmed:true,received:null};
  } catch(error) { await connection.rollback(); throw error; } finally { connection.release(); }
}
