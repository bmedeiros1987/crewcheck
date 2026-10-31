# Finite canonical-member cohort — financial core, OFF / HOLD

This is a versioned **financial capacity** candidate, not live family/visitor
WhatsApp support. No policy, authority, profile, recipient, grant, schema,
credential, scheduler or provider is provisioned or activated by this patch.
The existing one-owner v1 mode and ordinary 15-minute evidence freshness remain.
All shipping/release defaults remain OFF. `finite-risk-cohort-v1` must be selected
explicitly; mixed v1/cohort, promotional, pilot or renewal modes are rejected.

## Blocking contracts before activation

1. **Paid-plan eligibility is not implemented in this financial-core patch.**
   The latest policy allows free accounts to link Telegram only. Explicit cohort
   membership does not override that rule. A separately reviewed canonical
   `subscriptionStatus` extraction must be checked under the owned transaction's
   profile/subscription locks at prefund, reserve and final send. No profile.plan
   regex, legacy override expansion, cached premium flag, auto-upgrade, nested
   transaction or automatic financial retry is acceptable. The transaction must
   prove the required isolation/absence-lock contract. Until then: HOLD/OFF.
2. **Convidados is a separate visitor identity/ACL.** This patch admits existing,
   uniquely linked canonical CrewCheck owners only. It does not map visitor JWTs,
   create a full profile, inherit a titular's plan, authorize roster access or
   expand guest permissions. Visitor transport/ACL work must be reviewed
   separately; family membership is not a data-access entitlement.
3. **Canonical link security composition.** The separate link-identity candidate
   supplies strict unique-index preflight, challenge-generation fencing and
   monotonic owner-link revisions. The cohort pins a private HMAC of the exact
   approved canonical binding stamp. Changing number, owner or generation denies
   later dispatch without refund/reset, including reproof of the original number.
   Same-millisecond ABA prevention depends on the separately reviewed monotonic
   revision change; this core does not claim that base main already provides it.
4. Full checkout/Node22 preparation, TypeScript/build, existing offline suites,
   and owned MySQL8.4 concurrency/restart CI must pass the exact composed commit.
   The max8 cohort must fit the original 8s transaction/2s query budgets. Reduce
   and re-review the cap if it cannot; do not enlarge timeouts.

## One program, one month, one immutable finite allocation

The fixed program is `crewcheck-concierge-shared-budget-v1`; the monthly ceiling
is 20,000,000 micro-USD. It is not renewed per member, program alias or relink.
The approved participant list contains 1–8 distinct owners, normalized targets,
private target indices and original grant IDs. The aggregate attempt cap is
10,000, not 10,000 per person. These are validation bounds, not an affordability
or reply-count promise. Each original grant equals its exact member allocation
F_i; initial accounts must be untouched (available F_i, reserved 0).

The full cohort manifest binds both distinct authority classes, all member
limits, target-specific immutable unit/setup/markup evidence, exact original
observation times, sender, binding generation, period and shared budget basis.
Each member ID binds its owner/target/grant/tariff/limits. There is no ordinary
stale-evidence fallback and no refreshed evidence timestamp.

Initial prefund requires locked global reserved R == approved initial R0 and
spent S == approved observed S0. It adds F + outside-exposure reserve O exactly
once, where F = sum(F_i). The allocation stores the independently approved R0.
Later validation requires R >= R0 + F + O, S >= S0, S + R <= USD20 and the same
original evidence hash/time. A legitimate later settlement reducing R causes
HOLD for separately reviewed reconciliation; this slice never releases,
settles, repairs or infers a replacement R0.

The existing global row holds the complete member counters, not another ledger:

- sum(member allocations) = F; sum(member limits) = aggregate approved attempts;
- used_i = attempts_i * C_i; attempts_i <= N_i; used_i <= F_i;
- sum(used_i) = aggregate used; sum(attempts_i) = aggregate attempts;
- selected account available = F_i - used_i, reserved = used_i;
- every amount/count is a safe nonnegative integer; missing/extra/malformed
  members, counters, account bindings or manifest fields deny, never default.

Every dispatch uses the existing request key `[fixedProgram,eventKey]` and
records exact cohort/member/owner/private-target/tariff/channel/period/C_i.
Reservation changes one account, one member, aggregate counters and one request
atomically. It **does not increase global reserved again**. The final gate
revalidates both authorities, canonical identity/consent/generation and exact
request binding (including its original quote source), then consumes only that marker. The existing dispatchAttempt
no-retry marker remains authoritative. Rejection, timeout, uncertain provider
result, lost COMMIT acknowledgement and process restart retain exposure. There
is no fanout, automatic refill, release, refund or retry.

Same-manifest prefund replay validates the full state and every current member,
including untouched/consumed account conservation and current original proofs;
manifest equality alone is insufficient. A present malformed allocation (including
null, false, zero or an empty string) is a conflict, never an absent slot to refill. Revoking a sibling blocks that replay
but does not grant it new credit or necessarily block another valid member's
selected dispatch. A v1 allocation or different cohort manifest blocks funding.
Global counters/requests store private indices and manifests, not a copied
family phone/name/email list. Link status projects the authenticated owner only.

## Existing transaction and lock contract

Original owner grants commit as separate reviewed transactions. Cohort prefund
locks all links in private-index order, all profiles in canonical-owner order,
then whole classes of account, original authority, receipt and target tariff
keys in stable order, then shared global and cohort authority. It creates no
request markers. Any invalid member prevents the entire financial hold.

Dispatch retains the existing store canonical/inbound positions and selected
account -> original authority/receipt -> tariff -> global -> cohort authority
-> request order. Existing lifecycle profile -> link inversion may force an
abort; universal deadlock freedom is not promised. The original owned SQL budget
rolls back/destroys timed-out connections, with no automatic retry or partial
financial writes. Plan-entitlement locking is a pending design amendment, not
silently inferred from these financial locks.

## Evidence and composition

The synthetic suite uses the actual production HMAC caller, real grant writer,
prefunder, resolver, shared reservation and final dispatchAttempt, with a stub
provider and synthetic SQL only. It includes differing member prices, max8,
aggregate10k rejection, all-member denial, corrupted replay, request transplant,
revocation/expiry/account deletion/relink, clock rollback, duplicate/restart,
provider rejection/throw/real transport timeout and uncertain COMMIT, shared
ordinary-voice boundary, immutable callbacks and MySQL JSON key normalization.

`concierge-finite-cohort-sql-scenarios.mjs` joins the existing socket-only owned
MySQL runner. Its January2032 fixture uses the same fixed program in a distinct
synthetic month without changing the existing October v1 allocation. It tests
max8 lock/deadlock/timeout behavior, all-or-nothing/replay, shared ordinary spend,
actual production dispatch and real database restart. Separate February–May fixtures encode max8 prefund races with the actual ordinary
grant writer, ordinary shared spend, installed lifecycle/store unlink and same-client
profile deletion; each keeps the fixed program and never resets an older hold.
A fifth synthetic month prefunds max8/aggregate10,000 and seeds an explicitly
consumed boundary to reject attempt10,001; it is not10,000 delivery evidence.
Races require both real SQL contenders, at least one fulfilled result, no unknown
SQL errors and a captured real deadlock for any rejected operation. Lifecycle
entrypoints additionally have successful no-contention controls. Local syntax
checks are not an InnoDB pass. No real schema or production records were inspected.

Core local checks use base main sources only, not unmerged link/entitlement
files. The separate security candidate owns its production fixture, schema-index
helper, Infobip workflow and minimal canonical UNIQUE constraints in the existing
credit SQL fixture. Compose those exact reviewed changes later, rerun all suites
and freeze new hashes; never overwrite that writer's files wholesale.

## Smallest operator prerequisites (not executed)

Confirm exact eligible canonical participant accounts/targets/consent and their
current binding hashes; approve the final immutable cohort manifest and limits.
Obtain account-specific Infobip tariff/fee applicability, current billed/pending
usage, existing voice/fixed/external exposure and original evidence times. Verify
required existing tables/unique indexes and absent or exact grant/budget records
read-only. Reserve only the remaining shared USD20 balance after that exposure,
not a fresh USD20 per person. Current family numbers and billing evidence remain
missing. Proposed end is 2026-11-01T03:00:00Z exclusive (October31 Sao Paulo end),
with exact start later and <=7days; no automatic renewal. It is still a proposal,
not configured authority or a guaranteed Infobip invoice cap. Provisioning, if
subsequently reviewed/approved, remains a separate bounded operator procedure.
