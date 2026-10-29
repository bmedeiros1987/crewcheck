# Finite-risk caller and trusted SQL resolver — prepared, no activation

Reviewed starting point: main `a2b4870e551f0499037ad63f4d61fac3d9bf4bde`,
including #1255. This is code/test preparation only. No environment policy,
authority, grant, tariff, budget, credential, permission or provider is changed.
The shipping constants remain false; missing policy remains OFF. Accepting the
new explicit policy shape is not permission to provision it or send a message.

## Two existing seams, no new delivery system

1. `createLockedPromotionalGrantReader` extracts the existing canonical locked
   phone-link/profile/grant proof checks. The ordinary resolver still enforces
   its original 15-minute tariff freshness; ordinary shared-credit reservations
   still require fresh global reconciliation. No stale fallback is added.
2. A separate `finite-risk-beta-v1` mode in the existing restricted caller uses
   `createFiniteCreditSqlResolver` and #1255's finite admission. It reuses the
   HMAC receiver, sealed store, durable preparing/dispatching markers, existing
   read-only command selection, transport, callbacks and lifecycle fences.

No new table, ledger, queue, scheduler, ingress or provisioning endpoint exists.
Production never calls an exercise API or a grant/prefund writer at startup.
Finite mode rejects simultaneous neutral, pilot, promotional or handshake modes.
The original exhausted pilot counters are unchanged.

## Explicit future policy contract

The existing version-1 policy envelope has `mode: finite-risk-beta-v1`, a
configuration with literal `finiteBeta: true`, and admission containing
`enabled: true`, `grant` and `finiteReserve`. `maxCostUsd` is the exact decimal
representation of the finite pool, **not a guaranteed provider invoice cap**.
Existing deployment bindings, sender/API allowlists and four distinct secure
credential references are still mandatory; no values are embedded here.

`grant` is the original `promotionalGrantManifest` input: version, approval ID,
fixed global program, canonical owner digest, amount, validFrom/validUntil and
monthly budget. `finiteReserve` is the separately approved finite-risk policy.
Their approval IDs must differ. Program, owner and monthly budget must match;
the grant amount must equal the pool and its period contain the finite window.
The finite `grantManifest` must equal the calculated original grant manifest.
The public caller pins the existing `crewcheck-concierge-shared-budget-v1` and
shared USD 20/month application budget; this does not establish real headroom.

The resolver requires both stored authorities on every reserve/final-send pass:

- Original approved grant authority, matching granted receipt, exact account
  grant ID/manifest/period and current canonical link/consent/profile identity.
- Separate approved finite authority with exact full finite manifest, original
  approval time and evidence reference. No policy JSON alone grants authority.

The finite tariff observation additionally binds `sourceId`, `setupMicroUsd`
and `markupMicroUsd` in its existing manifest. These must match the stored
target-bound tariff; the sum of known unit/setup/markup must fit the approved
per-attempt amount. Missing fees are not silently assigned zero. Stored hash,
original verifiedAt, unit amount and validUntil must match exactly. The global
budget's original reconciledAt and evidence hash must match the approved
observation. No timestamp is rewritten, and finite acceptance never extends
tariff validity. Unknown/inbound/fixed/tax/outside-consumer charges still need
explicit evidence, conservative coverage and risk approval.

Canonical lookup locks precede account/grant proof, tariff, global and finite
authority reads. The global lock is taken before the finite authority, matching
prefunding and final-send order. Message age remains at most 15 minutes; service
session comes only from the original authenticated inbound timestamp. Grant,
finite window, tariff and clock checks repeat after awaited reads. Reservation
and final gate retain their existing write-boundary expiry checks.

The existing link-status projection now handles singular promotional/finite
recipients only with the exact canonical owner digest. It does not provision
links, grant consent or claim delivery. Finite mode sends no link confirmation.

## Provisioning and lifecycle remain an explicit gate

There is no production authority provisioner in this patch. A separate reviewed
operation must first check the existing schema and current canonical records,
then consume approved immutable evidence using insert-if-absent/expected-manifest
semantics. It may use the existing grant writer and prefunder only within the
authorized transaction and verified canonical locks. Initial funding still
requires genuinely fresh observations. Never borrow test fixtures or stamp an
old screenshot with the current time.

Account credit cannot be overwritten/refilled. The existing global program/month
supports one finite allocation; an existing different manifest is a stop, not
permission for a new program ID. The finite window must fit one São Paulo billing
month, at most 7 days, and all actual grant/tariff deadlines. An identical retry
must not replenish either count or balance.

Revocation must invalidate the existing approved authority without deleting
usage or refunding uncertain requests. Canonical unlink/account deletion must
continue using the existing durable active-engine/quiescence fence and send
locks. Unknown completion remains pending; no TTL unlock, retry or automatic
financial cleanup is introduced. Accepted-unconfirmed is not device delivery.

Before any live test: exact-source independent review; raw/prepared/full CI and
real-MySQL composition evidence; the reviewed provisioning/revocation operation;
verified real owner/one recipient/sender and existing host bindings; genuine
tariff/billing/outside-consumer evidence; explicit amount/count/absolute-period/
risk and paid-activation approval; runtime readiness; bounded live acceptance
with stop conditions. No approval, data or activation is implied by this code.

## Verification scope

The new regression uses the actual restricted validator, production factory,
HMAC route, store dispatch and resolver with the existing synthetic SQL fixture
and an injected provider stub. Real-provider/external calls are forbidden.
Existing ordinary/pilot/canonical-link regressions remain required. Real MySQL
scenarios are added to the existing socket-only disposable runner, not a new CI
database. The existing Infobip workflow runs the production-caller fixture raw
and prepared; the credit workflow retains its MySQL/restart checks. Full
TypeScript/build remains in the established all-main-PR web validation.

Local scoped tests are not proof of real-MySQL lock concurrency, full preparation,
TypeScript/build or real recipient delivery. Those stages must be reported from
their actual executions; production provisioning remains unimplemented.
