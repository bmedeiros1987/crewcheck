# Asaas receipt recovery — candidate, operational HOLD

This candidate does not resume the Asaas queue, reconcile a real subscription, create
provider credentials, change products/prices, or send a provider request. The configured
URL stays `/api/webhooks/asaas`; its canonical alias keeps the same token check.

## Demonstrated defects

On main `afcf5651`, synthetic execution of the actual handler reproduced:

1. A `PAYMENT_CONFIRMED` whose provider subscription has no local row returns503 and
   deletes its receipt. Every retry can block the sequential queue at that event.
2. Classification happens after correlation, so even `PAYMENT_CREATED` can cause503.
3. Dedupe is committed before subscription/profile writes. A failure after claiming
   the event poisons subsequent retries as duplicates without applying the payment.

The private log was inspected only for event kind and field shape. No personal payload
is part of this repository or review fixtures. The real unmatched subscription's owner
and plan are **not established** by this change.

## Receipt and entitlement are distinct

An additive inbox stores the event ID, canonical body hash, provider subscription
reference, event kind/time and a minimal decision projection. No customer/contact,
externalReference, money amount, card, token, URL or original payload is stored.
The hash detects conflicting reuse of an ID and tolerates object property ordering.

Receipt insertion, subscription/profile updates and final disposition share one
InnoDB transaction/connection. HTTP200 means a committed receipt, not premium access.
Quarantine is explicit in the response (`reconciled:false`), category-only server
warnings and the admin aggregate diagnostic. Storage/schema/commit failures remain503;
conflicting reuse of an ID remains409. No receipt means no successful acknowledgement.

Only an existing, unique Asaas provider reference may update its existing local owner.
No email/public-ID/externalReference inference, subscription creation or provider I/O
is permitted. Unknown kinds, orphan/ambiguous references, invalid evidence, unproven
legacy receipts/order, same-time ordering ambiguity and cross-payment reversals are
held. Informational allowlisted kinds cannot change access. Reactivation alone is not
payment evidence. The existing31/366-day period policy is retained; received does not
shorten a confirmed period. Older notifications cannot undo a newer disposition.

The provider-native `dateCreated` format is validated and compared as a wall-clock
stamp without guessing the Mac/server timezone. Unsupported formats are held.
Existing unlimited profiles are preserved. The Asaas path cannot claim a Google row.

## Observation and explicit recovery

`GET /api/platform/admin/diagnostics/asaas-webhooks` requires a signed existing main
admin identity and returns counts/reasons/oldest receipt times only. It never lists
event IDs, owner identities, provider references or payloads. It does not replay.

`retryAsaasReceipt(db,eventId)` is an internal explicit operator function, with no
HTTP mutation endpoint, timer, automatic checkout callback or cron. It accepts no
owner, plan or payload overrides. Only missing-subscription/profile cases can retry,
after an independently evidenced local association is repaired. Final and unsafe
quarantines are not replayed. Late retry rechecks ordering under the same locks.
Account erasure removes receipts matching that account's existing Asaas reference.
Unmatched receipts have no inferred owner; any retention/review must respect this limit.

## Tests and limits

The shared32-case scenario suite runs against a controlled SQL adapter and an actual
disposable MySQL8.4 over a UNIX socket, before and after canonical preparation in the
existing CI job. It covers orphan retention, explicit retry, duplicate/concurrent IDs,
canonical hash conflicts, rollback after subscription write, legacy uncertainty,
ordering/refund races, ambiguous owners, Google/unlimited isolation and missing evidence.
Actual HTTP-wrapper tests preserve method/token-before-body/DB, failure503, admin-only
read observation and scoped erasure wiring. No production database/provider is used.

## Actions that require later operational authorization

Keep the real Asaas queue paused. Before deployment, authorize/apply the additive
`20261018_001_asaas_webhook_inbox.sql` migration to the existing database through the
established operator path, then confirm readiness. Never deploy without this table.
After independent review and current-head CI, authorize the rollout and read the
aggregate diagnostic. The historical orphan remains unassigned: establish its
provider/local ownership and plan from authoritative records before authorizing a
bounded explicit retry. No access should be granted solely to clear the queue.

Reactivating the Asaas queue is a separate action: it may deliver accumulated real
events and change billing/access state. No real replay, resumption or migration is
executed by these tests or this candidate. No paid worker or scheduled service added.

Primary references: [Asaas paused queue](https://docs.asaas.com/docs/fila-pausada),
[payment events](https://docs.asaas.com/docs/webhook-para-cobrancas),
[webhook introduction](https://docs.asaas.com/docs/sobre-os-webhooks).
