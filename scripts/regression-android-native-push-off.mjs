import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync('client/src/lib/androidPushLifecycle.ts', 'utf8');
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
const target = new EventTarget();
let identity = { ownerId: 'A', session: 'fake-session-A' }, enabled = false, generation = 0, tokenRevision = 0, nativeOwner = '', token = '', calls = [], delay;
const host = {
  nativePushStatus: () => JSON.stringify({ enabled, installationId: 'fake-installation', ownerId: nativeOwner, generation: String(generation), tokenRevision: String(tokenRevision), token }),
  setNativePushSession: owner => { calls.push(['scope', owner]); if (owner !== nativeOwner) { nativeOwner = owner; generation++; tokenRevision = 0; token = ''; } return true; },
  requestNativePushToken: () => { calls.push(['token']); token = 'fake-not-a-real-token'; tokenRevision++; return true; },
};
const lifecycle = context.exports.createAndroidPushLifecycle({ target, identity: () => identity, host: () => host,
  register: async (snapshot, account) => { calls.push(['register', snapshot.ownerId, account.session]); if (delay) await delay; return { registered: true }; },
  revoke: async (snapshot, account) => { calls.push(['revoke', snapshot.ownerId, account.session]); },
});
assert.equal(await lifecycle.activate(true), 'disabled'); assert.equal(calls.length, 0, 'OFF performs no token request, scope write or registry I/O');
enabled = true;
assert.equal(await lifecycle.activate(false), 'disabled'); assert.equal(calls.length, 0);
assert.equal(await lifecycle.activate(true), 'registered'); assert.equal(nativeOwner, 'A');
const a = generation;
identity = { ownerId: 'A', session: 'fake-session-A-renewed' }; target.dispatchEvent(new Event('crewcheck:auth-changed'));
await Promise.resolve(); assert.equal(generation, a, 'same-account renewal preserves native generation');
target.dispatchEvent(new Event('crewcheck:auth-will-change'));
assert.equal(nativeOwner, ''); assert.equal(token, ''); await Promise.resolve(); assert.equal(calls.at(-1)[2], 'fake-session-A-renewed');
await lifecycle.revoke();
identity = { ownerId: 'B', session: 'fake-session-B' }; target.dispatchEvent(new Event('crewcheck:auth-changed'));
assert.equal(await lifecycle.reconcile(), 'inactive', 'new account has no inherited enrollment consent');
assert.equal(await lifecycle.activate(true), 'registered');
let resolve; delay = new Promise(done => { resolve = done; });
const pending = lifecycle.reconcile();
target.dispatchEvent(new Event('crewcheck:auth-will-change')); identity = null; target.dispatchEvent(new Event('crewcheck:auth-expired'));
resolve(); assert.equal(await pending, 'stale', 'late registry result cannot bind a logged-out account'); delay = null;
assert.equal(nativeOwner, '');
lifecycle.dispose(); const end = calls.length; target.dispatchEvent(new Event('crewcheck:auth-changed')); assert.equal(calls.length, end);

const manifest = fs.readFileSync('android-wrapper/app/src/main/AndroidManifest.xml', 'utf8');
for (const component of ['com.google.firebase.provider.FirebaseInitProvider', 'com.google.firebase.iid.FirebaseInstanceIdReceiver', 'com.google.firebase.messaging.FirebaseMessagingService']) assert(manifest.includes(`android:name="${component}" tools:node="remove"`));
assert.match(manifest, /CrewCheckFirebaseMessagingService" android:enabled="false" android:exported="false"/);
assert.match(fs.readFileSync('android-wrapper/app/src/main/java/com/crewcheck/app/NativePushPolicy.java', 'utf8'), /boolean ENABLED = false/);
assert.match(fs.readFileSync('client/src/lib/androidPushHost.ts', 'utf8'), /ANDROID_PUSH_REGISTRY_ENABLED = false/);
console.log('PASS Android OFF lifecycle: no I/O while OFF, explicit consent, registration, same-account renewal, pre-mutation logout, account-switch consent fence, expiry and late ACK; synthetic tokens only');

await import("./regression-android-native-registry-client-off.mjs");
