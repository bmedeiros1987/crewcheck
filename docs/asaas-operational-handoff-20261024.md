# Asaas recovery handoff — 24 October 2026, operational HOLD

This local continuation starts at existing PR1078 exactbff35a7e. Do not create a
parallel receiver, dedup store, billing integration, credit ledger or queue worker.
No production configuration, endpoint, subscription, payload or credential is
accessed or changed by these fixtures. Existing dirty worktrees are preserved.
No AGENTS.md found in the isolated checkout; the existing inbox runbook applies.

## Urgent concrete read for the integrator's browser owner

Only the existing Asaas session/tab, without touching CrewCheck/Render tabs:
1. Open existing Integrations > Webhooks > CrewCheck. Record configured enabled,
   queue enabled/interrupted state and any explicit pending-event count/oldest age.
   A count of penalized items, logs or attempts is NOT queue depth.
2. Open CrewCheck payment logs with the full retained period. Record filters,
   page count/total displayed, earliest/latest attempted delivery and displayed
   timezone. Inspect whether a separate queued-event creation timestamp exists;
   do not substitute last-attempt time for event creation/retention start.
3. If the UI supports inspection of pending unique events, record only opaque
   event identifier, event kind, creation/queued time, attempt time/count, status
   and retention/deletion indication. No customer/contact/card/payment body,
   tokens or request headers. Keep authorized metadata locally protected, not in
   public Git/review packets. Do not save full personal payloads/screenshots.
4. Inspect read-only preservation/export options and exact explanatory text.
   Report an offered option; do not assume export/retention extension is available.
   Never click replay/resume/retry/save configuration/delete to investigate.
5. Report current session observed authenticated OR exact login/access obstacle.
   Tool absence is not logout. If access is denied, stop; no cookie/token extraction,
   new remote profile, key creation or permission workaround.

The official last notice received24/10 at13:00:05UTC reports14days paused,503 and
loss from25/10, no hour/timezone. Provider docs say logs/events have up to14days
retention and oldest events can be permanently removed. The9/10 earliest attempt
observed18/10 is historical, NOT a current oldest queued event. Fifteen attempts
with503 observed18/10 are NOT fifteen unique queued events. New events may exist
without attempted-delivery logs after interruption. Do not infer zero backlog.

Support protocol1905640 at14:30:54UTC is an autoreply only: no preservation or
cutoff agreement. The authorized email is sent; do not send another or wait for it
as the only investigation path. Any support preservation measure/cost/change
requires specific approval. No resumption, replay or account-access grant authorized.

## New synthetic time-evidence defect

At exactbff35a7e the real handler processes PAYMENT_CONFIRMED with paidDate and
dateCreated in2099 as active Premium in2026. No real payment is claimed affected.
The correction retains the receipt with HTTP200/quarantined/reconciled:false and
reason future_payment_date_requires_review; it does not grant or create a local
association. An invalid processing clock is held as processing_time_unavailable.

The provider-native timestamp has NO timezone. We do not parse it as an absolute
instant. A paid civil day later than the processing UTC day is conservatively
uncertain, even if a timezone ahead of UTC could explain the date near midnight.
It remains quarantined for review; no timezone is guessed to grant access. This
may defer legitimate ahead-of-UTC boundary cases and needs exact-head review.
Existing per-payment/reversal/order checks retain precedence and their assertions.
No automatic retry is introduced for either new reason. Three cases are added to
the shared raw/prepared/real-MySQL suite; original41cases remain unchanged.

## Credit/WhatsApp composition boundary — proposal, not coordinated acceptance

Asaas HTTP200 proves committed receipt, NEVER purchased credits, provider delivery,
plan entitlement or a funded quota. Informational/orphan/ambiguous/future/terminal
receipts cannot create credits. The separate credit owner owns the shared ledger,
reservations, usage/cost reconciliation, price conversion and channel preference.
No copied quota counters, implicit grant/reset, seed balance or plan resolver here.

A future read adapter must use a currently authenticated canonical account, exact
existing provider subscription association, reconciled active plan and unexpired
payment-specific funded period with revocable revision. A profile.plan string,
Asaas event, externalReference, email hint or HTTP200 alone is insufficient. No
credit adapter is implemented or imported in1078. The proposed shared WhatsApp/voice
budget and plan allowances remain outside this candidate; a channel switch cannot
mint credits. Test1/1 is not a plan quota. Coordination message to the credit owner
was rejected by automatic approval review for missing direct human authorization;
no alternate route attempted. Integrator must relay/authorize that specific message.

## Exact deployment blockers, separate authorizations

- Independent review of the NEW time-evidence HEAD, current-head CI including real
  isolated MySQL, and reviewed composition onto current main. Oldbff checks don't
  approve the new diff; no production database was inspected in this continuation.
- Explicit operator authorization for existing additive migration and backup/
  preflight/readiness on the real existing database, still with queue paused.
  No schema execution or new credential/permission is authorized here.
- Explicit approved merge/rollout sequence: render.yaml autoDeploy main means
  merging is deployment. Missing schema intentionally returns503, not fake200.
- Read aggregate authenticated diagnostics after readiness; independently prove
  provider/local owner and plan mapping before any bounded internal retry. No
  owner inference or subscription changes simply to unblock the sequential queue.
- Any real queue resumption/replay is separately authorized and bounded because
  it can change subscription/access state. Financial settlement and lost-event
  history cannot be inferred/rebuilt merely from current charge status.

Sources: https://docs.asaas.com/docs/fila-pausada
https://docs.asaas.com/docs/logs-de-webhooks
No read-only browser capability is exposed to this agent at the handoff time.
