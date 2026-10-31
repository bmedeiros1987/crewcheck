# Canonical paid-plan composition — OFF

This is an inactive composition on the shared finite cohort, not permission to
send, provision grants, upgrade a plan or activate a family pilot. Free accounts
are Telegram-only; cohort membership and financial approval do not override that
rule. Only existing canonical members on the existing HMAC path are covered.
Guest identity/ACL/JWT work remains separate and blocked; no profile creation or
plan inheritance is introduced.

## Authority and transactions

The unchanged `platform-entitlement.mjs` reader/resolver supplies the only plan
decision. Lifetime, subscription status/period and the existing explicitly
trusted legacy flag keep their canonical semantics. The flag is captured from
trusted application environment composition, never policy/member JSON. The
application still returns OFF before environment, connection or credential reads.

`concierge-paid-entitlement.mjs` adapts the already-owned budgeted client with
the existing MySQL adapter. Private phase-local proofs bind the exact client,
canonical owner and link generation. Private copies of locked rows are evaluated
again with fresh trusted time after awaits and at invocation, not by refreshing
financial observations or persisting a paid flag. Arbitrary/copied clients,
boolean attestations, ended transactions and backwards time do not authorize.

Cohort transactions set next-transaction REPEATABLE READ **before BEGIN** on the
same owned connection. Acquisition and each operation retain the 2-second limit;
the entire operation retains 8 seconds. A late unused acquisition is released
once. Failed/uncertain setup and cleanup discard the owned connection. No global
or pooled-session default is changed, and no transaction is retried. Ordinary/v1
default acquisition/isolation behavior remains unchanged.

Prefund validates both existing canonical storage fences and the existing
subscription table/columns/full unique-email index, using SELECT only. All links
then all profiles precede all subscription rows/gaps; financial lock classes
remain unchanged. Selected-member resolution first locks identity and plan,
then the unchanged original grant reader re-enters those exact identity rows.
An absent subscription is protected by the RR unique-email gap. Google-style
subscription UPSERT and Asaas subscription-before-profile writers can contend;
bounded abort is required, not universal deadlock-free progress.

## Invocation and exposure

Every member must be currently paid for initial prefund or same-manifest replay.
Selected-member reservation checks paid authority before and after financial
writes and the preparing marker. A failure after a write throws to roll back.
The fixed global/member allocation, original evidence dates, ordinary 15-minute
freshness, max eight members and aggregate 10,000-attempt validation cap do not
change. No refill, redistribution or refund method is added.

The engine gets a separate short current-authority transaction. It verifies the
exact preparing token/owner, link and subscription, then invokes once under those
locks. Its promise is immediately rejection-handled but never awaited by the SQL
callback: commit first, then await actual settlement outside SQL. Preparation's
existing 5-second input signal, outer shutdown and SQL abort are all checked at
invocation. A failed/unknown authorization COMMIT discards the reply; no retry or
provider call follows. Existing engineActive/quiescence ownership remains until
actual settlement, including when an engine ignores abort.

Final send re-reads current authority. Only the real finite send gate can mint
the private single-use transport fence, after verifying the locked financial
request and exact durable inbound dispatching attempt. The transport checks that
same attempt and the **built** destination/message identity immediately before
the actual injected request, after synchronous request construction. It rechecks
current plan, account/grant/tariff/policy/message dates, signals and remaining SQL
headroom. Mutating the caller's policy during credential resolution cannot remove
the captured mandatory paid mode or its schema preflight.

Invocation, not response arrival, is the authorization boundary. Once an engine
or provider has been invoked, later expiry/downgrade/rejection/timeout/unknown
COMMIT cannot refund or recreate an already-committed attempt. Even a final
no-I/O denial retains the conservative reservation. Existing no-retry markers
and cancellation/uncertain states remain in force.

## Verification and remaining gates

Local tests use synthetic SQL and provider stubs with external network trapped.
The regression covers canonical plan variants, all-member denial, schema fences,
post-await/request-build expiry, three cancellation sources, ignored abort,
unknown engine COMMIT, private request/attempt binding, construction mutation,
bounded acquisition and original-grant rollback. Existing cohort, ordinary/v1,
production, render and identity regressions must remain green.

The existing owned disposable MySQL runner is extended, not replaced: a
READ-COMMITTED negative control, actual next-transaction RR gap/row blocking,
INSERT/UPSERT/downgrade/delete/reinsert, Google-shaped separately committed
subscription/profile writes with reads in the stale-profile window, Asaas-shaped
native deadlock with successful controls, owner recreation, expiry and untouched
financial rows. Existing max8,
strict A/B plus ordinary spend, lifecycle races and restart scenarios now use
actual canonical subscriptions. Engine fixture SQL uses an independent client,
so an authorization transaction accidentally awaiting engine completion fails.
Only this socket-only QA runner creates/alters synthetic fixture schema; no
runtime migration or provisioning script is installed.

**These new real-MySQL scenarios, Node22, canonical preparation and full build/CI
have not run locally.** Local Node24/synthetic success is not their substitute.
The original SQL budgets must pass unchanged; otherwise HOLD and review the
cohort bound rather than enlarge timeouts.

Before any activation: independent exact-patch review and exact-tree CI, security
dependency/live-index compatibility, paid-link policy for other WhatsApp modes,
eligible canonical participants, current tariff/usage/voice/fixed exposure,
remaining balance within the **one joint USD20** approval, exact finite period
and manifest, and separately reviewed provisioning. Generic original grants stay
unchanged; future cohort grant procedure must lock current paid authority in its
own RR transaction and throw/rollback if that authority expires after writer
changes. No new endpoint, credential, funding, cost, permission or scheduler is
created here. Guests and other unreviewed transports remain HOLD.
