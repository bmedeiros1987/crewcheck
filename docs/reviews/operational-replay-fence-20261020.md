# Operational phone/Wear replay candidate — review required

Base 998507548389755f5a7487a63d0d6964c0964e8e. Local isolated candidate; no installation, distribution, store, credentials, capabilities or permissions changes. #1088 and Health/CrewLife remain outside scope. Finance/layout/authClient/persistSession unchanged.

The trusted host's successful current getMe continuation allocates an opaque native lease. Home captures that authority object; stale callbacks never obtain replacement leases. Silent continuity loss as well as auth events revoke the captured native lease. Native document fencing and one shared serialization boundary gate allocation/cache/send. Legacy unbound cache is not replayed. Ordinary background resend after process restart is conservatively blocked until a fresh verified host assertion; durable pending revoke retries remain available without getMe.

Wire: operational snapshotJson stays schemaVersion=1 with original IDs, manual gate and timestamps. Existing DataItem path carries separate transportEnvelopeJson (transportVersion, leaseId, decimal revision, SHA-256 of exact snapshot bytes). Receiver-generated persisted nonce binds actual GMS node/request/lease/admit. Exactly one connected node is required during each handshake stage. Ordinary data cannot admit a lease. The encrypted receiver journal atomically binds accepted revision/digest and payload; every operational receive/recovery/poll path uses the same validator. Duplicate accepted data is idempotent; lower revision or conflicting digest rejected. Poll freshness uses accepted lease/revision, not sentAt.

Dedicated session/revoke/v1 and revoke-ack/v1 commands correlate exact actual node/lease/revision/requestId. Phone persists the original serialized command and disables ordinary publication before sending. Outbox limit16 reserves the active lease's logout slot before admission; unconfirmed commands are not discarded on TTL or transport success. Wear persists revoked fence and clears operational cache before ACK. cleared differs from not_current; only matching remote ACK resolves an outbox entry. Exact duplicate does not clear again. Revoke of pending A cancels only pending A before not_current so an old admission cannot activate it; B remains intact. No expired operational payload is treated as a control.

## Validation
- Phone and Wear debug Java compilation: PASS.
- Full Wear Robolectric suite: 69 tests, 0 failures/errors/skips (61 existing +8 journal/revoke tests). Real store AES/cache and DataItem ingress; only Keystore key provision is synthetic. Existing lifecycle assertions preserved; ingress fixture now performs admission and uses the actual operational DataItem handler.
- Real phone Publisher with synthetic Context/storage/GMS: 55 assertions PASS, including original gate/ID/validity, stale callback, offline revoke/restart exact retry, commit failure, matching ACK and capacity16.
- Pure JVM receiver fence: 39 assertions PASS, including commit failure, rotation/restart/loss, ordering, revoke-before-admit and preservation of a different pending lease.
- Actual Protected continuation + actual Web admission module: 15 functional assertions PASS, plus 2 assertions reproducing the same-origin trust limit below.
- Actual Home effect/canonical builder/gate pipeline/cadence: PASS; invalidation asserts native captured-lease revoke instead of an expired legacy empty.
- TypeScript noEmit and git diff whitespace: PASS.
- No physical GMS/pairing/reconnect/force-stop proof, no claim of remote notification delivery, no final independent review or HEAD CI yet.

## Explicit review limits / HOLD
The native bridge accepts an assertion from JavaScript running in the trusted same-origin WebView. Origin/document fencing does NOT cryptographically prove a successful getMe HTTP response. Arbitrary same-origin JavaScript can invoke the exposed admission method directly, including from the login/demo document; the regression deliberately reproduces this. Normal App login/demo/catch/finally paths never invoke admission. No new server/native authentication protocol or token transport was added. This trust boundary must be accepted or revised by the independent reviewer/coordinator before integration; do not advertise native-verified login.

A failed disk commit is uncertain, not a remote-cleared success. The current receiver process hides its uncertain journal; after restart the last durable state can remain until an exact revoke retry succeeds or the original TTL expires. The phone never resumes ordinary replay after restart without a new verified host assertion. Immediate remote cleanup while offline is impossible.

Legacy raw SecureSnapshotStore.save is rejected; consequently the existing DEBUG-only local demo button reports unavailable. It does not create a bypass into an unbound operational cache. Production payload/IDs/manual gate and expiry are preserved.

Transport callback APIs: https://developers.google.com/android/reference/com/google/android/gms/wearable/WearableListenerService . Physical callback delivery/topology behavior remains unverified; connection revalidation and synthetic callbacks are not evidence of a device test.
