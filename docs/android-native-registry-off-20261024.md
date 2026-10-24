# Native Android registry primitives — unmounted, OFF

This separate backend slice complements #1218; it does not enable native push,
change that PR or replace #1183. Base main eeb77c3b. The notifications owner granted
new native modules/tests only; no existing scheduler, server route, Web Push module,
Android, shared-PDF or environment file is edited. An open-PR inventory found
#1218 enrollment, #1217 Telegram and #1222 MCC; no parallel Android registry PR.

## What this implements

The unmounted MySQL primitive locks the canonical profile and installation state,
checks server owner versus hints, CAS registry/consent revisions and native
generation/tokenRevision, and stores a protected token envelope plus a token-hash
claim in the existing state table. It creates no production schema.

Explicit registration consent increments consent revision. Rotation retains only
current server consent. A committed revoke clears the sealed token, invalidates
the token claim and leaves a generation tombstone. Late same/older generations
cannot re-enroll. Another owner cannot silently take an active token; confirmed
old revocation is required before reassignment. That is a deliberate fail-closed
boundary, not complete automatic account-switch/outbox reconciliation.

Mutation IDs reconcile duplicate requests, including a committed transaction whose
ACK was lost. There is no automatic retry after an uncertain commit. A future
caller must reconcile current state rather than announce receipt or retry a send.

The deletion helper requires the existing canonical deletion operation on the
SAME SQL connection and refuses acknowledgement if that profile still exists.
No current account-deletion route calls this helper; integration with all existing
deletion work is still required before activation.

The protection adapter must be explicitly authorized. No key is selected, read,
created or derived here; no Web Push key is borrowed. The existing room encryption
helper is unsuitable because it truncates input to80 characters and may fall back
to authSecret. Missing/invalid protection fails closed. Tests use an ephemeral
synthetic AES key in RAM, never an actual FCM token or production secret.

## OFF boundaries and remaining gaps

nativeRegistryHost reads no arguments and remains disabled/unconfigured. The
primitives are not imported by server.mjs or any runtime route. The sender module
always reports disabled/providerAccepted=false/received=null, reads no credential
or token and performs no network I/O. It is not a working FCM transport.

Remaining: choose an existing authorized at-rest mechanism; mount authenticated
same-origin routes with canonical owner; consent UI and native lifecycle glue;
integrate canonical deletion and durable outbox/dispatch/revocation barriers;
identify existing sender authority with cloudmessaging.messages.create; native
receiver display authority and closed-app token renewal authentication. SDK/public
configuration, permissions and physical acceptance remain #1218 activation gates.
Changing one boolean is insufficient to enable delivery.

## Evidence required

Pure protocol tests cover CAS/idempotency, consent, rotation, generation revoke,
owner hints, wrong project/package and OFF zero-I/O. Disposable MySQL CI covers
actual SQL races/unique token claims, atomic deletion rollback, encrypted storage,
pool restart, stale scope and lost commit ACK reconciliation, raw and prepared.
The SQL runner refuses external hosts, non-fixture database/user and missing
explicit disposable flag. It never targets Aiven or production.

No Play code allocation/upload/submission, environment, IAM, credentials, new
permission, real account data, real token, paid message or deployment is included.
Passing these tests is neither remote receipt nor physical acceptance.
