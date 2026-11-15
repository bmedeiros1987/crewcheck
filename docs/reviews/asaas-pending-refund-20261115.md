# Asaas pending refund — local correction, operational HOLD

## Problem and resulting behavior

`PAYMENT_REFUND_IN_PROGRESS` previously mapped to canonical `refunded`, cleared the funded period and changed a non-lifetime profile to free. The event denotes processing, not completed return of money. It now passes the existing reference/owner/plan/order/payment gates and stores a quarantined receipt with reason `refund_in_progress_requires_reconciliation`, `reconciled:false`. It changes neither subscription status/metadata/period nor profile and never creates or extends access. Duplicate and explicit retry do not promote it.

No new canonical subscription status, schema, queue, timer or retention is introduced. HTTP acceptance still means a committed receipt, not a finished refund or access decision. Existing same-payment unresolved/reversal safeguards remain fail closed; a pending refund cannot serve as evidence to grant a later paid activation. A later `PAYMENT_REFUNDED` still follows the pre-existing completed-event path; this patch does not certify partial-refund or commercial access policy.

The existing 44 scenarios are unchanged; 13 new shared scenarios exercise paid/pending state preservation, duplicate/retry, pending→completed, completed→pending, later-paid blocking, different payment, stale event, orphan/missing ID, receipt-settlement rollback, concurrent pending/received and misleading nested refund arrays. The same suite runs in memory and disposable MySQL; no real provider, payment, cancellation, refund, subscription or customer is used.

## Source basis

[Asaas charge events](https://docs.asaas.com/docs/webhook-para-cobrancas) distinguishes refund processing, completed refund, partial refund and denied refund. [Refund interpretation](https://docs.asaas.com/docs/estornos) requires `DONE` before treating money as returned; the array's presence is insufficient. The patch does not infer amount, full/partial completion, a paid coverage duration or suspension policy from the pending event.

## Conditional cancellation work remains held

No `SUBSCRIPTION_DELETED`/`SUBSCRIPTION_INACTIVATED` rule is changed in this patch. A read-only synthetic diagnostic previously confirmed that the inbox clears a funded period while the direct cancellation helper preserves an existing current period. The public LegalPage source (§8, source date 19 July 2026) says cancellation stops future renewal, but runtime published/accepted terms are loaded from DB and were NOT inspected. The source catalog says monthly/annual auto-renewal and a conditional trial disclosure; actual Google base plans/offers, live prices, grace and trial eligibility remain unverified.

[Asaas subscription removal](https://docs.asaas.com/reference/remover-assinatura) stops recurrence and preserves paid charges. That does not define CrewCheck's funded-period boundaries, trial treatment, partial refunds or chargeback policy. The historical 31/366-day calculation is not promoted to a confirmed commercial contract. Preserving a period on cancellation requires explicit applicable commercial rules AND trustworthy payment-specific coverage/owner evidence; neither is synthesized, migrated or inferred here. Ambiguous cases remain an integration/release blocker, rather than an automatically granted extension or an unreviewed policy replacement.

This patch conserves existing canonical facts pending reconciliation; it is not a decision that access must always remain active during a refund, nor a repair/validation of legacy entitlements. Existing expiry and entitlement resolution continue to apply. No actual webhook backlog is replayed and no queue or receiver configuration is changed.

## Gates and limits

Require exact-head review, raw/prepared memory + real disposable MySQL and handler/transaction regressions, build/typecheck, reviewed composition and mandatory CI before integration. Production schema/configuration, effective terms/base plans, contractual cancellation/refund behavior, unknown-owner recovery, retention/erasure and real provider/native validation remain HOLD. No prior processed refund receipt or live subscription is rewritten or replayed to undo historic behavior.
