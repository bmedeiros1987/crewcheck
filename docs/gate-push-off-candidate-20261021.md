# Gate-change notification candidate — isolated, OFF

Base main 792fd649. This is an independent offline producer/receiver component, not an
Android delivery implementation, auth proof, deployment or activation request.
No AGENTS.md or checkout skills were present. Existing #1146 remains the
observational diagnostic, #1172/#1173 remain blocked, and no duplicate diagnostic,
native receiver, Watch transport, phone bridge or message service is created.

`server/web-push/gateCandidate.mjs` accepts only an explicitly injected isolated
host/repository/mock sender. Its no-argument path returns disabled before touching
dependencies. It has no environment reads, DB discovery, public endpoint, polling,
live sender or startup import. It composes the existing `dispatchMockPush` and the
existing PWA receiver behind a gate-only fence. The isolated host read is a
fixture authority contract; its kind string/booleans DO NOT authenticate anyone.

## Implemented boundary

- Context comes from the host, never process arguments or a public request. The
  account, active installation/revision, gate-specific consent/revision and
  roster revision are exact. BIDS or generic browser permission is not consent
  for gate changes. Replacing any of these starts a new baseline without backfill.
- Existing gate-query occurrence/date policy and custom source-update validator
  are reused. Only a source-produced departure-gate update for the exact flight,
  route and absolute scheduled instant is eligible. Receipt, global flight update,
  aircraft signal, arrival gate and missing/stale/future/conflicting data cannot
  manufacture a gate. This bounded candidate accepts short alphanumeric boarding
  codes only; remote/position/unknown labels are unsupported, never guessed.
- The first valid observation establishes a baseline. A newer different gate may
  create an event only while both observations remain fresh, within the existing
  eight-hour-before/one-hour-after alert window. Source evidence expires after
  thirty minutes at most; refreshing a receipt cannot extend it. Equal-time
  disagreement invalidates the baseline; an older sample cannot regress it.
- A host transaction saves baseline and pending changes together. Event identity
  includes account, installation/consent/roster revisions, occurrence and source
  update. Dispatcher claims survive producer recreation in the supplied repository.
  Unknown outcomes remain held, not retried. Pending superseded values are
  coalesced; no historical gate is announced after a newer differing observation.
- Authority is reread inside the journal transaction and before/inside dispatcher
  claims. The existing receiver rechecks binding/expiry and deduplicates display.
  Payload adds only `topicRevision` to the existing minimal opaque envelope; generic lock-screen copy never
  carries flight, airport, gate, hotel or financial details. Manual gate state is
  not written. Provider acceptance and display API resolution never mean receipt.

## Installed receiver fence and correlated ACK (offline component)

`client/public/crewcheck-gate-receiver-offline.js` wraps the existing receiver;
it is NOT imported by the shipping worker. Default OFF reads no dependencies.
There is no grant/bind admission endpoint or permission request. A separately
verified host must admit a binding before this component can display anything.

The gate-only binding is scoped by owner, installation, installation revision and
topic revision. `withGateStore` uses the existing worker IndexedDB database and
persists an inactive tombstone with a compare-and-set transaction. Gate changes
require that exact active topic binding as well as the current global binding.
Generic/BIDS notifications and the global installation binding are not revoked.

Display and revoke use the SAME origin-wide Web Lock through display API
resolution and dismissal. There is no per-module mutex fallback: absent locks
fail closed. Revocation waits for a pending display, persists its tombstone,
closes only matching gate tray entries, rereads the tombstone, then returns a
request-correlated `crewcheck.gate-revoked.v1` ACK. Persistence/enumeration/close
failure, wrong account/revision or missing binding cannot return a success ACK.
The host must use `matchesAck`, check its still-current owner/session/pending
request generation and reject late/foreign ACKs. An ACK never grants authority,
renews a binding, proves authentication or proves physical delivery/dismissal.

Every future bind/rotation/logout/global cancellation affecting gate notices must
participate in that same lock/fence before its own success ACK. Existing global
lifecycle handlers are unchanged and are NOT certified as integrated with this
dormant component. No direct storage write is an admission mechanism; the browser
fixture seeds synthetic bindings only to test the receiver.

## Validation and limits

`scripts/regression-gate-push-candidate.mjs` drives producer → real existing
dispatcher → real existing worker with synthetic transactional storage, mocked
display API and mock provider. Concurrency, recreation, binding/consent/source
changes, rejection, expiry and unknown outcomes are tested. No actual DB durability,
restart of a SQL engine, physical device or delivery is certified by this suite.
The existing push lifecycle/receiver suites remain required; configuration OFF
and sealed candidate limits remain separate from fixture success.

The original unprotected-receiver counterexample remains characterized. A new
positive case uses the gate fence and blocks the same in-flight envelope after
ACK. Twelve receiver scenarios cover pending display/revoke ordering, rejection,
revocation faults, scoped tray cleanup, immutable requests and ACK correlation.
The browser fixture uses a real service worker, real IndexedDB transactions and
real origin Web Locks, but MOCKS display APIs. Tombstone persistence across page
and receiver recreation is tested. No physical OS notification is displayed.

## Required live adapters and ownership handoff

1. Server owner must supply transactional, authenticated current-owner reads,
   unique canonical active-roster revision/occurrence, and source observations
   produced by the server's existing provider response path. A browser cache or
   Concierge roster's copied gate/`radarUpdatedAt` is not equivalent evidence.
   The component intentionally does not start more provider queries. A durable
   SQL journal/outbox adapter must be tested for concurrent claims, rollback,
   restart, deletion and revocation; the synthetic adapter is not that proof.
2. Gate-specific opt-in needs the existing authenticated settings/installation
   lifecycle, with an explicit user action and server revision. It is not written
   by this draft. No production gate consent or installation is presumed. The
   unprotected receiver knows only installation revision. The new dormant gate
   fence closes its counterexample in offline tests, but a live topic-consent
   mutation MUST invoke the installed fence/rotation, with acknowledgement,
   as well as cancel pending jobs; a server-only revision change is insufficient.
   Otherwise a previously accepted generic envelope could still display. The
   shipping worker/UI do not yet route through the new fence, so LIVE remains
   HOLD. This draft certifies only mocked API ordering on the guarded path, not
   physical platform behavior, current installed software or a live revocation.
3. Existing PWA worker is reused unchanged. Enabled transport configuration and
   actual supported-device subscription/permission remain unverified. No new
   VAPID/protection key is generated/read/configured and no flag is enabled.
4. Native phone owner must own any Android remote receiver and token lifecycle.
   The checked-in wrapper has local notifications, not FCM registration/receiver.
   A future receiver needs matching authorized sender/app configuration,
   authenticated account/installation binding, token rotation/revocation/logout,
   expiry and duplicate guards, generic private lock-screen content and physical
   closed-app tests. Existing Watch authority/HOLD and voice are untouched; neither
   is reused as proof of native phone admission. APK/store delivery is outside
   this web/offline scope. Coordinate through parent before native edits.

### Exact native handoff, without a parallel implementation

Reuse the cancellation ordering of the existing `NotificationLedger.LOCK` and
its commit-before-cancel principle. Native topic display/revoke must share a lock
through `NotificationManager.notify/cancel`, persist an account/installation/
epoch/topic-revision tombstone before cancellation, retain durable dedup claims,
and ACK the exact request ID and captured scope only after that barrier and cancel
API return. Store failure, stale owner/epoch/revision, wrong ACK, timeout or restart
uncertainty must remain unconfirmed; do not infer server `getMe` from a JS hint.
This is a receiver contract, not permission to create FCM credentials or services.

Local inventory found compiled `NativeFcmSession` fixture artifacts dated 18/10;
the corresponding source/owner was not located in the current checkout or searched
temporary sources. Do not duplicate/decompile that prototype. Parent must reconcile
it with phone owner before native hunks. No new Java receiver, MainActivity,
manifest, Gradle, Watch, token or APK change is part of this patch.

This component is reviewable independently while these live adapters remain
blocked. It must not be described as functioning closed-app notifications.


## SQL continuation (isolated only, 2026-10-21)

The candidate now carries an explicit synthetic owner epoch and finite admission
lease (at most five minutes), included in context comparison and event expiry.
These fields are fixture authority, not a getMe/authentication implementation.
Missing, revoked, foreign, expired or overlong authority fails closed.

`gateSqlOffline.mjs` connects the SAME candidate/dispatcher to the existing state
and profile table layout in database `crewcheck_gate_push_qa` only. It requires an
explicit fixture flag and example.test owner email, verifies the database before
owner reads/writes, scopes all keys by owner/email, and locks profile, authority
and journal rows in the same transaction. Epoch/consent/install/roster changes
between claim and dispatch are rechecked under those locks. The existing account
state deletion prefixes cover its binding and journal records. No DDL, environment
lookup, production admission, startup import or credential discovery is added.

The existing mock dispatcher now commits its dispatching claim in a first
transaction BEFORE mock I/O; finalization uses a second transaction with the same
owner/context validation. A crash after mock acceptance can roll back finalization
but leaves the committed claim non-retryable. Concurrent callers may observe
`dispatching`; they must never call it delivered/accepted until terminal state.

The new MySQL fixture runs producer baseline/change, eight consumers, recreation,
revocation/epoch/consent/installation/roster changes between claim and send, rollback
after mock acceptance, owner replacement and exact account deletion isolation.
CI restarts the disposable SQL ENGINE before proving the claim cannot resend.
It uses --network none, synthetic records and a mock sender. Local SQL startup
on this Mac did not create a socket/log and was stopped; no local SQL pass is
claimed until a real engine test completes. Existing Node producer/worker suites
remain separate evidence. No shipping receiver, real auth writer, real source
writer, sender or native code is connected by this continuation; LIVE remains HOLD.
