# Gate-change notification candidate — isolated, OFF

Base main792fd649. This is an independent offline producer component, not an
Android delivery implementation, auth proof, deployment or activation request.
No AGENTS.md or checkout skills were present. Existing #1146 remains the
observational diagnostic, #1172/#1173 remain blocked, and no duplicate diagnostic,
native receiver, Watch transport, phone bridge or message service is created.

`server/web-push/gateCandidate.mjs` accepts only an explicitly injected isolated
host/repository/mock sender. Its no-argument path returns disabled before touching
dependencies. It has no environment reads, DB discovery, public endpoint, polling,
live sender or startup import. It composes the existing `dispatchMockPush` and the
existing PWA receiver, not a new push protocol. The isolated host read is a
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
  Payload is the existing minimal opaque envelope; generic lock-screen copy never
  carries flight, airport, gate, hotel or financial details. Manual gate state is
  not written. Provider acceptance and display API resolution never mean receipt.

## Validation and limits

`scripts/regression-gate-push-candidate.mjs` drives producer → real existing
dispatcher → real existing worker with synthetic transactional storage, mocked
display API and mock provider. Concurrency, recreation, binding/consent/source
changes, rejection, expiry and unknown outcomes are tested. No actual DB durability,
restart of a SQL engine, physical device or delivery is certified by this suite.
The existing push lifecycle/receiver suites remain required; configuration OFF
and sealed candidate limits remain separate from fixture success.

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
   existing receiver knows the installation revision, not the separate topic
   revision checked by this producer. A live topic-consent mutation MUST revoke
   or rotate that binding on the actual installed receiver, with acknowledgement,
   as well as cancel pending jobs; a server-only revision change is insufficient.
   Otherwise a previously
   accepted generic envelope could still display after topic revocation. This
   draft does not certify post-acceptance topic revocation, retract accepted
   notifications, or claim that its sender checks close that receiver boundary.
   The regression includes this counterexample as an explicit live HOLD, not a
   test asserting that topic revocation has been implemented.
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

This component is reviewable independently while these live adapters remain
blocked. It must not be described as functioning closed-app notifications.
