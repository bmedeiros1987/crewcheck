# Native Android registry primitives — unmounted, OFF

## Existing-account authority mapping — still OFF

`createNativeRegistryExistingIdentityHandler` composes the unmounted boundary
with the existing `requireExistingIdentity` helper and its existing MySQL pool.
It never calls `ensureProfile`, uses development email hints or creates a pool.
The verified context must have issuer crewcheck, audience crewcheck-web, finite
unexpired numeric expiry, explicit password-change clearance, and matching JWT
subject/email and canonical profile. A fresh profile requiring a password change
blocks an older cleared JWT. The captured bearer fingerprint is in memory only;
fresh existing-account checks fence replacement/recreation/expiry around awaits.
The existing pool object is pinned within the request; a changed pool cannot lend
authority to a transaction or receipt from its predecessor. This is not global
JWT revocation or a new session/credential store.

Disabled requests do not call that helper or touch credentials/DB. The factory
still requires independent admission, allowed origin and protection composition;
it is not mounted and does not enable enrollment or delivery. Unit tests execute
the actual common-module JWT, token-reader and existing-identity functions selected
by AST, with a synthetic RAM key and fake pool. SQL tests separately validate the
mapped canonical profile/current-password/recreation/deletion behavior against
disposable MySQL; their identity context is synthetic, not production JWT setup.

## Authenticated composition factory — not a mounted endpoint

`createNativeRegistryAuthenticatedHandler` is default OFF and is not imported by
the platform router. The existing `nativeProtocolHost`, registry gate and sender
remain OFF. There is no environment toggle, route registration, consent prompt,
token acquisition or send. Test-only instances explicitly enable this isolated
factory and supply synthetic dependencies.

A future reviewed composition must supply independently verified owner identity,
current-identity fencing, request admission, the existing platform pool, a trusted
HTTPS app origin and authorized protection. Missing dependencies fail closed.
Cookie-only and development email/header fallbacks are not accepted. POST needs
the exact configured origin and bounded JSON; body/query owner overrides are
rejected. GET accepts only one installation ID. Authority is checked again after
async preparation and after SQL, before sending a redacted receipt. A late change
can withhold the ACK after a durable mutation: it does not mean nothing was
written, and fixed-ID reconciliation is required. Errors disclose neither bearer,
FCM token nor SQL/provider messages. Responses are no-store.

Tests select the actual existing platform JWT verification/token-reader functions
by AST and inject only a synthetic in-memory key; no production secret or startup
is accessed. The HTTP boundary is invoked in memory, without a listening socket.
SQL CI composes the same host factory with the real platform adapter and disposable
MySQL, including late-identity receipt withholding and duplicate reconciliation.
These proofs do not certify a production authentication/admission/protection
provider, native permission, background delivery or physical receipt. Mounting
and account-deletion route ownership remain a separate composition step.

## Explicit platform-connection bridge (still unmounted)

`createNativeRegistryPlatformAdapter(platformDb)` accepts the existing MySQL
platform adapter; it creates no pool, connection, key, route or activation flag.
The registry side keeps its mysql2 tuple/`?` contract. Only its fixed internal
statements are translated to the platform `$n`/`{rows}` contract, with argument
counts and result shapes checked. Unsupported statements fail before query I/O.
The existing global platform adapter is unchanged.

For account deletion, pass `bridge.canonicalDeletion(callback)` to
`deleteNativeAccountWithRegistry(bridge.registryDb, identity, ...)`. The callback
receives the exact original platform client from the registry transaction. It
must perform only the existing canonical SQL deletion on that supplied client,
without opening/committing/releasing another connection. It is not the whole
HTTP deletion handler: external cancellation/preflight stays outside the SQL
transaction in the future composition. Foreign, released or inactive registry
connections cannot enter this callback. Missing canonical deletion remains an
error; commit uncertainty is not acknowledged or blindly retried.
The platform client must support `discard()`. An uncertain BEGIN, failed rollback
or release while a transaction is still active destroys that connection instead
of returning it to the pool. A successful rollback after a lost commit ACK does
not create an ACK; fixed-ID reconciliation remains required.

This closes an API incompatibility, not production mounting or authorization.
The current account-deletion route and authenticated registry route remain
unmodified. Their ownership/composition, protection authority, consent UI,
sender/outbox and native display barriers are still separate activation gates.
Unit tests use the actual platform adapter with fake I/O. Disposable SQL tests
exercise registration/read, callback rollback, missing deletion, lost commit ACK,
fixed-ID reconciliation, one-connection identity and atomic erasure through the
real platform adapter. No production DDL or real token/message is involved.

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

## Protocol adapter follow-up

`protocol-adapter.mjs` adds an unmounted, OFF wire boundary. It accepts only the
expected public project/package, canonical identity supplied separately by a
future authenticated route, safe decimal native counters, explicit CAS revisions,
consent and a stable mutation ID. Register, rotate and revoke remain distinct.
It calls the existing durable primitive once and maps only a correlated committed
summary to `registered`/`revoked`; `received` stays null. Unknown commit results
are not retried. This does not mount a route or make the older Android payload
compatible: the client must still supply the new CAS/operation fields and revoke
under the captured old authenticated scope. The caller must durably retain the
operation ID and reconcile lost ACKs; this adapter does not invent that storage.

45 synthetic wire/ACK counterproofs run raw and prepared in the existing registry
workflow. They use actual mutation plans for register/rotation/revocation, reject
malformed/overflow counters and body identities, and prove invalid requests and
OFF host touch no DB/protection. Existing actual MySQL tests remain separate.

The requested ongoing flight/duty notification is not implemented by this slice.
It must update one opaque notification identity per current owner/event, expose
only approved lock-screen content, validate action identity/revision on tap, and
label cached source/time honestly. Local saved-time alarms remain a distinct
existing AlarmManager path; no continuous service, new infrastructure, sender
activation or claim of iOS Live Activities is introduced here.

## Recomposition against main 94b68053 (10 November 2026)

The original branch history is preserved by merging main
`94b6805380b68cf4afd5ed6002ac9a928dad8cdb`. The merge has no conflicts and
changes none of the eight registry-slice files relative to `54730ab3`.
No runtime route, Android path, scheduler, credential, flag or sender is added.
The historical SQL results above are not evidence for this new composition.

On the recomposition, the raw synthetic suites passed 22 registry checks and
45 protocol checks. A new local disposable MySQL 8.4 fixture was isolated with
network disabled, no published ports and a tmpfs database. Its socket connection
failed with EACCES before the test could execute DDL. That SQL run is NOT a pass;
no permission change or alternate connection was attempted. The fixture was
stopped. Actual disposable SQL coverage remains required from the exact candidate
CI workflow before integration. Neither these tests nor that CI enable FCM or
prove receipt on a device.
