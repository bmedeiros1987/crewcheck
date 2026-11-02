# Finite admission / actual dispatch boundary — OFF

Base: `1685833af329d8288bdddeb52d9f1472d05c2c51`, including the reviewed
#1253 final-send gate (`43ea02b63cc1eceffd0b3011fb779e4548da4eac`).

## Scope

`createFiniteReserveAdmission` is an **unmounted composition boundary**, not a
working production resolver, new public policy mode, grant or activation. It
requires literal `enabled: true` plus an injected trusted resolver and uses one
clock for its scope, the existing shared-credit candidate and the reviewed final
send gate. `FINITE_ADMISSION_SHIPPING` and the existing release constants stay
literal `false`. No production module imports this adapter.

The adapter exposes the store's existing `allows` / `reserve` / `checkSend`
contract. The already approved finite policy is cloned; current owner/binding,
recipient, event, message age and authority/tariff validity constrain admission.
Reservation uses the existing account/global/request rows and finite attempt
counter. There is no second ledger or quantity counter. Successful reservation
is followed by another scope/abort check; failure throws so the caller cannot
commit a debit while treating admission as denied.

The final method delegates to #1253's gate. It must run only in the existing
store's final transaction **after its committed `dispatching` no-retry marker**.
Do not use `checkSend` as a standalone permission token or infer an unsent
message from a `reserved` credit marker.

## Evidence and limits

`scripts/regression-concierge-finite-dispatch-off.mjs` runs the real HMAC receiver,
sealed candidate SQL store and its actual `dispatchAttempt` implementation with
the existing synthetic transactional SQL fixture and an injected stub provider.
It does not replace the dispatch algorithm. Candidate `dispatch` stays disabled;
the fixture explicitly invokes the existing `exerciseDispatch` boundary.

Covered: accepted-unconfirmed, rejection, thrown error, timeout and a late
accepted result; duplicate/concurrent dispatch; recreated store; exhaustion;
owner/recipient/consent/binding, budget, authority, message/session/tariff/grant
expiry; final-gate rollback; and successful provider acceptance followed by
result-save failure, COMMIT failure or lost acknowledgement. A provider
acceptance is never called delivery. After a final rejection/timeout/rollback,
the prior reservation and global hold remain; no retry, refund or reset is added.
If the final transaction rolls back, the request may again be `reserved` while
the job remains `dispatching`: replay still must not invoke the provider.

All identities, dates, keys, amounts, tariffs and authority records are invented
fixtures. The intentionally old observation timestamps remain unchanged across
the synthetic finite path. No live network/provider calls, accounts or grants
are used. The synthetic SQL fixture serializes transactions; this is **not**
new evidence of real-MySQL lock ordering, concurrency or restart behavior.
#1253's separate MySQL evidence does not automatically prove this composition.

## Exact missing production prerequisite

The existing `createPromotionalCreditSqlResolver` combines canonical link/grant
identity with an unconditional 15-minute tariff-evidence freshness requirement.
Reusing it unchanged safely denies finite spending once the observation ages;
relaxing it would change the ordinary promotional contract. This patch does
neither. The injected fixture resolver is **not a shipping implementation**.

Before a production caller can be proposed, a separately reviewed resolver must
read and lock current canonical link/profile identity, exact owner uniqueness,
consent and binding, approved grant manifest/receipt/validity and revocation,
and authentic recorded tariff evidence. It must separate current identity and
grant authority from the explicitly approved finite financial basis without
refreshing timestamps, inventing entitlements or weakening ordinary freshness.
Its lock order must compose with reserve, prefunding, dispatch and lifecycle
mutations. Provisioning/revocation/account-deletion behavior needs its own
durable tests and review; none is supplied by the adapter.

Remaining activation gates: independent exact-source review; raw/prepared CI;
actual-MySQL composition and lifecycle/unknown-commit proof; that trusted
resolver; reviewed finite authority provisioning/revocation; real tariff,
billing and outside-consumer coverage; explicit recipient/amount/period/risk
approval; and a separately authorized restricted production caller/activation.
The finite hold bounds application exposure, **not an absolute invoice cap**.
Existing consumed pilots, ordinary promotional mode and voice remain unchanged.

## Ownership

Only this new adapter, synthetic regression and document are added. The existing
`concierge-credit-offline.yml` gains the focused regression before and after
canonical preparation and dependency/fixture/preparation/package triggers. Its
existing ordinary/shared-credit and real-MySQL checks are preserved. MySQL runs
before preparation because its clean-tree provenance guard requires that order.
No duplicate CI pipeline is introduced. The existing all-PR
`crewcheck-v13-8-validation.yml` still supplies TypeScript and full build checks;
it is unchanged and its eventual CI result must be inspected independently.

Local review used an exact-blob scoped snapshot: new raw regression (37 groups,
10 asserted stub-provider invocations, zero real provider/external calls),
existing ordinary admission/shared-credit regressions and syntax checks pass.
Five deliberate counterproof mutations fail. Full canonical preparation,
TypeScript/build, the full promotional caller and new real-MySQL composition
were **not run locally**; no complete checkout/dependency setup was supplied.
Remote raw/prepared/full CI is still required, not inferred from these checks.

Existing store, resolver, shared-credit candidate, gate, grants and
production composition are unchanged. #888/#926's Meta/webhook/PDF work,
#1241's medical coordinator, native push/Android/Play, and parallel Telegram
work are not modified. No env, secret, permission, schema, provider setting,
cost activation or remote data operation is introduced.
