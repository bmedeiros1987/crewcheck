# Assisted restoration feasibility — temporary HOLD, not final policy

Decision for this checkpoint: keep automatic recovery of unknown-owner receipts unactivated (option C as temporary HOLD only). No production toggle, receiver, broker, keys, retention period, token store or cleanup policy is changed. Earlier seven-day alternatives remain proposals, not an adopted default or statutory period.

## What the existing candidate supports

- Android `CrewCheckBillingBridge.restorePurchases` calls `queryPurchasesAsync` for SUBS, emits pending separately, emits a restored purchased token for backend checking, and emits `billing-empty` for an empty query. Connection setup also invokes restoration. This is source inspection, not an Android build or device test.
- Web `PlatformCenter` has a user Restore button and native receipt listener. It fences the captured CrewCheck auth generation before and after verification, including A→B→A; the frontend only requests purchase acknowledgment after a coherent active receipt. A restore query uses the current Google Play account, which is distinct from the CrewCheck login.
- `platformClient.verifyGooglePlayPurchase` rejects missing, mismatched, inactive-as-active or malformed receipts. `handleGooglePurchase` verifies Google evidence and re-reads canonical billing before success. `saveGoogleSubscription` delegates to transactional owner/token verification; no client supplied email chooses ownership.
- Known current same-token Google subscriptions can be refreshed by the existing helper. Another owner's token, Asaas/provider replacement, unsupported token rotation, missing provider-verified owner or missing period remains blocked. Restoration does not silently authorize migration, ownership transfer, renewal cancellation or a second subscription.
- The stricter unwired Google async admission module requires a known intent and trusted per-launch origin binding. No real binding adapter has been configured. A historical restore is not necessarily a new launch: it must not be forced through a fabricated new operation or a client-echo origin proof. Reusing the verified existing-owner path versus designing an explicit restoration contract needs review before wiring either route.

## Verified gaps and diagnostic evidence

The actual RTDN handler was executed as an extracted function with mocked source authentication, provider and DB, with external fetch blocked. Unknown and ambiguous owners cause 200/ignored, no event evidence insertion and no entitlement save. Repeating the same unknown receipt performs two mocked provider reads, because provider verification occurs before owner lookup and the unknown event is not durably recorded. A previously recorded event avoids the provider read; invalid source stops before DB/provider. This is local candidate behavior, not a statement that the production endpoint or Pub/Sub is enabled. The diagnostic does not legitimize ignoring unknown purchases as a complete integration.

`billing-empty` is emitted by Java, but source search found no Web listener for this event; the Restore action relies on its timeout to clear busy, without a specific empty-query result. This is a source-level UX gap, not a proven physical failure. The native bridge capability check looks for `purchase`, not `restorePurchases`; an older partial bridge can fail on the attempted restore, caught by the action handler. No runtime fix is included in this investigation.

Synthetic mounted Web tests cover 20 cases at 390/1440 px: explicit and automatic restore, pending/inactive, empty HTTP receipt (NOT native empty-query), wrong product, revoked native callback, late verification success/error and denied storage. The test now awaits completion of the real mounted asynchronous receipt listener instead of a 250ms negative window. Native IPC, actual Google account selection, Play delivery and native empty-list behavior remain untested. No new purchase, real token, provider request or entitlement occurred.

## Safe assisted flow to evaluate

1. User opens the installed Android app, signs into the intended CrewCheck account and explicitly chooses Restore. Explain briefly that Google Play's selected account must own the purchase. Do not ask for a token, credential or receipt screenshot in chat/email.
2. The native query supplies the current token in the authenticated request only. Backend validates application/product, live provider state and a unique verified ownership association. A click or client account field is not ownership evidence; frontend purchase state is not the backend source of truth.
3. Coherent known-owner active purchase can refresh the same canonical subscription. Pending, paused, expired, unavailable and ambiguous outcomes remain distinct. Do not acknowledge a pending purchase or grant from an HTTP 200 alone. Existing Asaas access cannot be overwritten to make restore appear successful.
4. If provider ownership is absent, the token changed, another owner already holds it, or original account was deleted/recreated, stop automatic adoption. Support can guide account recovery or request a new authenticated provider query; it cannot arbitrarily move ownership or grant access from a screenshot. Escalation must show only an opaque case reference and a short reason, not raw tokens, other-account identities or complete provider payloads.
5. No real support case store is created here. Case persistence, staff roles, appeal/account-recovery proof, deletion and retention are unresolved; until approved, keep assisted guidance within the authenticated session and avoid copying billing secrets into tickets.

Failure and risk boundaries: empty query does not prove the subscription never existed; wrong Play account, disconnected service, expired purchase, suspended subscription coverage, reinstalls or account mismatch can affect results. Expired subscriptions are not a promised complete query history. A canceled subscription before expiry can still have access; restoring its renewal is a different action from merely re-reading a receipt. Offline/timeout cannot prove failure or justify another purchase. Non-acknowledgment of new purchases has refund/access consequences, so HOLD is not a production reconciliation strategy or permission to leave payable purchases unfulfilled.

## Official sources checked

- [Billing integration](https://developer.android.com/google/play/billing/integrate): query purchases on connection/foreground, handle pending separately, verify before access. Current docs discuss suspended-subscription inclusion; availability in this project's installed library must be checked before relying on that option. No library update made.
- [Backend purchase security](https://developer.android.com/google/play/billing/security): token uniqueness and backend verification; do not substitute a screenshot/client assertion for verification.
- [Subscription lifecycle](https://developer.android.com/google/play/billing/lifecycle/subscriptions): current state from subscriptionsv2.get; token usable until 60 days after expiry. This API validity window is NOT a retention policy or guarantee of restoration. The source distinguishes restoring renewal before expiry from repurchase after expiry; repurchase may produce a new token and requires explicit supported ownership reconciliation.
- [Subscriptions API](https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptionsv2/get): requires original token and authorized Publisher access. Hash-only correlation cannot reconstruct it.
- [RTDN](https://developer.android.com/google/play/billing/rtdn-reference): notifications only signal change; deduplication and authoritative verification remain needed.

## Requirements before a durable option

| Area | Required decision/evidence | Current state |
| --- | --- | --- |
| Ownership and restore | Rules for historical/missing account identifiers, token replacement and deleted accounts; conflict/appeal process | Fail closed; no silent adoption policy selected |
| Receiver | Verified identity/audience/package, anti-replay, bounded payload/rate, current-state lookup and durable exactly-once EFFECT semantics | Existing source partly present; live auth/config/coverage not validated |
| Storage | Minimal schema; atomic inbox/ownership/effect correlation; unresolved operation fences; conflict quarantine; approved purpose and deletion rules | Isolated proposals/tests only; no production migration |
| Recoverable token | Whether necessary; protected encryption, key owner/rotation, worker-only access and audit, backup erasure | No vault or new keys/services selected |
| Worker | Bounded verification concurrency, quotas, read-only recovery, monotonic/current provider evidence and retry after confirmed safe failure | Local mocked parts tested; no running service or schedule activated |
| Operations | Timely fulfillment/refund/ack handling, support roles and notices, outage/reconciliation runbook | Needs provider-specific end-to-end review and safe sandbox/device validation |
| Cost | Existing plan/Publisher quota, Pub/Sub delivery/storage/replay, DB/worker/crypto/backup/logging usage and explicit spending limits | Unknown actual configuration/volume; no monetary estimate or free-service claim |
| Privacy | Purpose/legal basis, access/deletion/account closure, duration based on need, backup policy and incident handling | Requires Bruno/privacy review; no arbitrary duration fixed |

Do not use broker retention as a free token vault or equate message acknowledgment with purchase acknowledgment. No new Pub/Sub/Render service, preview, paid provider or permission is created. Option C does not resolve missed unknown events, stale offline access, or the new-purchase fulfillment deadline; it keeps those release dependencies visible while safe local work proceeds.

## Owner-first RTDN follow-up — local correction, no activation

The earlier private diagnostic remains a valid counterexample for its historical candidate. The successor moves purchase-state verification AFTER unique hash-owner and profile lookup. Unknown/ambiguous owner or missing profile no longer consumes a purchase-status API read that cannot be applied. Source authentication (including its existing tokeninfo request), package checks and known-event deduplication remain first. This does not promise zero network/auth cost or introduce durable unknown-event recovery.

Actual extracted handler/save wrapper tests now cover ten mocked scenarios; disposable MySQL additionally composes the actual RTDN body, actual save wrapper and actual transactional write helper. It verifies unknown replay causes zero purchase-status reads and zero writes, known-owner success/duplicate, owner recreation or provider replacement during the mocked API await, mismatched provider-verified account, provider failure and absent profile. Source authentication/provider transport are mocked; database transactions are real and isolated. No live owner, provider token or entitlement is used.

This preserves current ignored/blocked semantics and changes no production flag, schema, retention, provider plan or credential. The existing known-event receipt write still follows the entitlement transaction rather than sharing one atomic inbox boundary; concurrent/replayed known events, authoritative freshness/order and cleanup remain release requirements. The unknown-owner HOLD still risks missed unattended fulfillment and is not a complete RTDN integration. No new-purchase acknowledgment/refund policy is selected or invoked. Authenticated user restoration remains the assisted candidate, subject to the ownership and native gates above.
