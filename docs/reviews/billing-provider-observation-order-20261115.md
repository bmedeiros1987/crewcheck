# Provider event ordering — isolated observation proposal, HOLD

No receiver activation, real API request, token storage, production schema change, new service or retention period. A notification is a trigger to obtain current state; its arrival order/event timestamp is not a trusted sequence of authoritative subscription snapshots.

## Google local stale-response protection

`createGoogleEventObserver` uses a trusted injected server adapter for `subscriptionsv2.get` current-state observations. The internal source label is an adapter contract, NOT a Google field/signature or proof supplied by a client. The real adapter, authentication, freshness/age instrumentation and quota settings are not configured here. Raw token recovery remains on temporary HOLD; a future adapter could use a token supplied in the authenticated request without retaining it, subject to the earlier ownership rules.

1. Lock the known immutable profile/subscription and inspect an exact existing event receipt. A duplicate returns receipt-only status without a new probe or claim about current access. Unknown owner/provider/token or conflicting receipt stops before the probe.
2. Capture a fingerprint of the current subscription plus an opaque server-generated nonce in its existing metadata. Known legacy rows with supported metadata can bootstrap this marker without changing access. Malformed or unfamiliar metadata stays blocked instead of being silently rewritten. Every shared Google writer generates a new nonce on each write, including a return to an earlier state (ABA).
3. Release the DB transaction before the injected read. The notification's state/time is not passed as authoritative evidence. Reject unsupported provider states without changing the existing subscription; do not reinterpret an unknown state as an expiration in this new observer. Validate verified owner/token/product/expiry and require status/access/cancellation to match the SAME status normalizer used by `platform.mjs`.
4. Re-lock and compare the fingerprint in the same transaction that applies subscription/profile and event receipt. If another local write happened, return `GOOGLE_STATE_RECHECK_REQUIRED`; do not apply the old result, store it as completed, retry the provider automatically or grant from an event timestamp. A fresh explicit observation can later apply current state.

The fingerprint includes provider/reference, token hash, plan/status/product, expiry, cancellation, normalized metadata and nonce. It is not a provider version, credential, purchase token, legal retention choice or clock. It detects direct state changes that leave the nonce intact; all participating shared Google writes rotate it so ABA is detected. An external writer that restores an identical record including nonce is not covered. Source inventory found current server Google writes in the shared helper; Asaas-only mutations remain separate. Future/legacy writers and compositions need auditing before wiring.

Single-flight reuses the existing bounded process-local helper with explicit capacity and no post-flight result cache. Identical in-flight events share one probe; different events/instances can still query concurrently, but a local intervening write invalidates the older observation. This is not a distributed rate limit or a promise of free queries. No timeout/lease duration or retention window is invented.

A delayed event may legitimately result in a newer current state; only the current-state response is considered. A duplicate known receipt is idempotent, not a fresh status lookup. This protocol prevents local lost updates but does NOT prove Google's upstream replica consistency or guarantee that a response has not become stale in the outside world after its read. Authoritative adapter implementation, source/received timestamps, observability and recovery policy remain gates.

## Evidence and boundaries

Disposable MySQL plus trusted adapter mocks cover delayed notification/current expired state, old notification/current renewed state, exact duplicate before probe, late old response after another factory commits, fresh explicit retry, twelve shared in-flight calls/one probe, ABA, direct mutation with unchanged nonce, wrong source/owner, timeout without automatic retry, unknown owner, malformed legacy metadata, capacity saturation, provider replacement, incoherent adapter state, and an actual server restart rejecting the old fingerprint. The original 16 atomic-event cases and 21 shared writer cases must remain green.

The normalizer was extracted from `platform.mjs` into `google-subscription-status.mjs`; the wrapper delegates to it and source-extraction tests inject that same real function. Twenty-four lifecycle/boundary tests require expiry strictly after now, distinguish pending/hold/paused/canceled/grace, and reject non-Date/invalid expiry for active access. These are tests of local processing, not native/Google account/production verification.

## Asaas — reuse and explicit limitation

No competing Asaas writer was created. Existing inbox logic rejects older provider-native stamps, quarantines equal/invalid stamps and incompatible payment cycles, deduplicates IDs and preserves rollback/identity boundaries. Its 44 synthetic scenarios were rerun unchanged; this does not certify a live delivery configuration or a current-state API adapter. `dateCreated` lacks an offset in the existing model and is not converted to a fabricated UTC instant.

For a future assisted authoritative recheck, `GET /payments/{id}` supplies the current charge and `GET /subscriptions/{id}` supplies the current subscription; subscription status alone does not prove a particular charge is paid or fund an access period. The paid/refunded state, payment-to-subscription identity, funded period and current owner must agree. This checkpoint does not activate those reads, reinterpret payment status or change the existing period calculation. Unconfirmed/conflicting evidence remains a reconciliation dependency, without new quarantine/retention policy.

Asaas delivery is at-least-once, so event ID deduplication remains necessary. Sequential delivery is a documented configuration to consider when chronological order is required, but tenant mode is unverified and has NOT been changed. Sequential delivery would not replace transactional guards, freshness checks or conflict handling.

## Primary sources checked

- [Google RTDN](https://developer.android.com/google/play/billing/rtdn-reference): signal only; obtain complete purchase state through Developer API and deduplicate message IDs.
- [Google subscription lifecycle](https://developer.android.com/google/play/billing/lifecycle/subscriptions): `subscriptionsv2.get` is the subscription source of truth. Its token-validity window is not a retention policy.
- [Asaas webhook idempotency](https://docs.asaas.com/docs/como-implementar-idempotencia-em-webhooks): at-least-once delivery and stable event ID on redelivery.
- [Asaas queue behavior](https://docs.asaas.com/docs/penaliza%C3%A7%C3%A3o-de-filas): recommends sequential delivery when chronology matters; no account configuration was inspected or changed.
- [Current charge](https://docs.asaas.com/reference/recuperar-uma-unica-cobranca) and [current subscription](https://docs.asaas.com/reference/recuperar-uma-unica-assinatura): read-only reconciliation endpoints with different meanings. No endpoint was called.

HOLD remains: real source/auth/coverage, upstream consistency/freshness, distributed quotas/cost limits, all-writer/deletion composition, native testing, unknown-owner durable recovery, retention/erasure and production rollout. No final privacy decision was needed or taken to run this isolated proposal.
