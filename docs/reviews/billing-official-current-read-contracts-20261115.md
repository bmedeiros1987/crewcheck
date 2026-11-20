# Current-read contracts — source check and isolated adapters, HOLD

Scope: official public documentation, existing source, synthetic transports and disposable SQL only. No actual provider endpoint/credential, production flag/DB, persisted token/ETag, retention period, purchase, cancellation or refund. Adapters have no default transport and cannot run without an explicitly injected authenticated `readJson` capability.

## Google — documented facts and existing mismatch

The current [SubscriptionPurchaseV2 resource](https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptionsv2) documents `etag` as the subscription-state entity tag, provided for subscription actions. It does not describe it as a sortable sequence or a maximum-age guarantee. The documented successful order identifier is `lineItems[].latestSuccessfulOrderId`. Expiry uses RFC3339 with up to nanosecond precision. These fields do not prove chronological delivery or the instant a response was generated.

The existing `saveGoogleSubscription` wrapper still reads top-level `payload.latestOrderId`; the current resource page consulted does not list that field. A private synthetic counterproof used the ACTUAL wrapper plus real validation with the documented per-line order and no top-level order: it failed `GOOGLE_VERIFIED_RECORD_INVALID` before any DB call. This proves a source-shape incompatibility for that fixture, NOT that live Google responses omit the legacy field or that it caused Bruno's reported production failure. No existing route was changed to accept a new format here.

The isolated adapter supports one total, valid configured auto-renewing line. Extra known/unknown/malformed/prepaid lines, absent ownership/order/ETag/expiry, unsupported state or mismatched renewal flag are held. Configuration must explicitly select the supported plan type; no real base-plan type is assumed. It matches a request-supplied token hash and immutable owner before the read, then validates the provider resource. It uses the shared status normalizer; no access derives from a notification type or order-ID text.

It returns normalized fields plus an in-memory ETag digest marked `orderingEstablished:false`; no raw token, ETag, linked token, personal profile, full response or extra fields are returned/persisted. RFC3339 calendar/offset validation is strict; sub-millisecond expiry is conservatively truncated to the existing millisecond DB contract rather than rounded upward. Defensive field bounds are local compatibility limits, not documented vendor maxima. Pending/new/legacy purchases without the needed fields remain unconfirmed. This is a supported subset, not complete Google Billing coverage.

The injected transport must supply authenticated HTTP status plus parsed body. Only HTTP 200 is projected. Errors are sanitized and there is one attempted read, with no retries/cache/conditional GET assumptions. Transport authentication, response-size/timeout controls, logging redaction and actual plan permissions remain unvalidated. The current adapter is not wired into `platform.mjs`.

## Asaas — read evidence does not determine paid access

The official [charge GET schema](https://docs.asaas.com/reference/recuperar-uma-unica-cobranca.md) exposes charge ID, recurring subscription link, payment state, deletion and civil settlement/client-payment dates. The [subscription GET schema](https://docs.asaas.com/reference/recuperar-uma-unica-assinatura.md) exposes its own ID, state and deletion. They are separate requests. Neither consulted schema establishes a monotonic resource revision or a simultaneous snapshot. Charge `dateCreated` is a creation date, not a revision; `confirmedDate` used by the existing webhook envelope was not found in the consulted GET schema and is not substituted for settlement in this adapter.

The isolated pair adapter validates requested references, payment→subscription relation, documented states/explicit deletion flags and matching customer IDs when both are supplied. Customer IDs are used only for consistency within these two responses, never to infer a CrewCheck account. It projects hashes, separate statuses/flags and separate civil dates without UTC inference. It always reports `entitlementDecision:'not_made'`, `atomicProviderSnapshot:false` and `orderingEstablished:false`. Paid/refund/chargeback combinations are not turned into new access periods.

It does two GETs at most, stops on an unconfirmed first response, performs no retry/polling, drops personal/card/URL/credential fields and sanitizes transport errors. Missing dates remain missing; no 31/366-day duration or `nextDueDate` entitlement is inferred. The existing Asaas inbox, cancellation, transport and production configuration remain unchanged.

[Asaas send types](https://docs.asaas.com/docs/tipos-de-envio) distinguish sequential order from parallel delivery without that guarantee. Tenant mode is not known or changed. [At-least-once delivery](https://docs.asaas.com/docs/como-implementar-idempotencia-em-webhooks) still requires idempotency. Delivery mode does not make two GETs atomic or verify a paid coverage period.

## Validation scope

Pure adapter fixtures cover request method/path, field minimization, current per-line Google order, offset/nanosecond expiry, calendar errors, absent/ambiguous data, unsupported plan/resource, wrong owner/token/catalog, changing getter snapshots, ETag treated as opaque, HTTP/auth/quota/failure responses and no automatic retries. Negative cases include extra unknown/malformed/prepaid Google lines, closed after independent review.

The disposable MySQL observation suite additionally sends the isolated Google adapter through the current-state observer and atomic writer: the per-line order is preserved, one known duplicate avoids a second read, raw token/ETag never enters the stored record, and incomplete resource cannot grant access or record a completed receipt. Providers/auth are mocked; SQL and restart are real and isolated. These are not Play licensing/device tests, sandbox transactions, deployed credentials or actual upstream freshness measurements.

## Decisions/evidence required before proceeding beyond isolation

| Need | What is missing | Safe current boundary |
| --- | --- | --- |
| Effective Google contract | Real configured product/base-plan types and compatibility of deployed responses; current schema vs legacy top-order field | No blind fallback, multi-line selection or route replacement |
| Provider freshness | Source guarantees if any, measured request behavior, acceptable stale/unavailable behavior and read budget | Opaque ETag/local nonce never sorted as provider sequence; no invented TTL or fresh-read guarantee |
| Asaas paid coverage | Commercial plan rules for start/end of funded access and treatment of settlement, refund/cancel/chargeback; verified canonical charge ownership | Pair projection only; no activation/revocation or replacement of existing period calculation |
| Real adapter safety | Existing authenticated transport suitability, package/catalog/account permissions, bounded response/timeout and secret-free logs | Injection-only mocks, no new credential or permission |
| Recovery/privacy/cost | Unknown-owner policy, purpose/deletion/duration, worker/queue quotas and explicit spend limits | Option C remains temporary HOLD; no token vault, broker/service, retention or polling activated |

A concrete business question for later validation is: when verified current provider data is unavailable or conflicting, should existing confirmed access run only to its already established expiry, or should some premium features be temporarily limited? The first can delay a refund/chargeback restriction; the second can interrupt a legitimate subscriber. No choice is made by these adapters. Neither option permits extending access or starting another charge from ambiguous data.

For Asaas, obtain the commercial coverage rule and real plan configuration before converting a read into an entitlement change; provider status alone cannot choose it. This is a necessary decision/evidence gate, not a request to invent a duration. All operational wiring, retention and rollout remain HOLD.
