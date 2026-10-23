# Infobip events — synthetic OFF candidate, 23 October 2026

Continues draft #1177 (`ed6a3c50`); no parallel integration, account change,
transport activation, real message, credential, permission, cost or migration.
The production no-argument runtime remains sealed OFF, including `/seen`.
No AGENTS.md exists in this checkout. Open PR inventory includes #1203 (local
CrewCierge), #1179 (gate notifications), #1154 (financial), and #1146 (notification
observer); their implementations are not copied. No competing WhatsApp owner was
identified in the available active task list or PR comments.

## Evidence and contract

The synthetic adapter implements this event contract:

- JSON `results[]` with no eventType: DELIVERY has status; SEEN has seenAt;
  inbound has integrationType/receivedAt/message. Delivery/seen can batch;
  inbound currently has one item (the existing bounded parser also accepts batches).
- Original event IDs/timestamps are stable. Batch membership/order and inbound
  queue counters can change. There is no independent event ID or retry counter.
- DELIVERY identity is messageId/status.id/doneAt; SEEN is messageId/seenAt;
  inbound is messageId within the configured sender namespace.
- DELIVERY/SEEN retry up to 20 times over approximately 41h30; inbound retries
  up to 35 times over approximately nine days. Expiry can stop retries earlier.

HMAC still authenticates the complete raw body before JSON parsing or SQL.
Whole-body authentication is not whole-body replay identity. Basic compatibility
remains explicitly configured, with no downgrade or header-driven fallback.

## Behavior

The authenticated HTTP boundary validates the whole bounded results array, uses
all item shapes, and rejects mixed/ambiguous batches. `/delivery` and `/seen`
require their matching shapes; the existing callback path discriminates all three
shapes. Limits remain 20 items, 64 KiB, 5 seconds. Dedicated public production
bootstrap is not enabled.

Delivery accepts coherent PENDING/UNDELIVERABLE/DELIVERED/EXPIRED/REJECTED group
objects. Only the exact existing DELIVERED_TO_HANDSET tuple advances the ledger
to delivered. Other valid states are observations, never evidence of delivery or
permission to retry a send. SEEN advances only a separate maximum seenAt, never
marks delivered, never invokes the Concierge and never queues a reply.

Each correlated report records a hashed per-item receipt in the existing state
table, in the same transaction as the projection under the existing ledger lock.
Only `cc-<64 lowercase hex>` can address an existing outbound ledger. Recipient
hash, configured sender hash and attempt time must still match. Phone numbers or
arbitrary callbackData cannot create a correlation. Unknown/unmatched ledgers
are ignored. Receipt rows retain no phone, callbackData or message content.

Delivered is sticky. Non-delivery observations use maximum original doneAt;
status ID breaks equal-time ties deterministically, without interpreting ID as
severity. A delivered observation dominates a non-delivery observation regardless
of order. SEEN uses its own maximum seenAt. Per-item commits allow a partial
batch failure to return 503; retry reuses prior receipts without reapplying them.

Inbound accepts original timestamps up to ten days old (nine-day retry horizon
plus one day margin). Identifiers/content-conflict digests remain eleven days
from first claim (one additional cleanup margin). Content still expires after
15 minutes. An already-old item commits a content-free denied tombstone and ACKs;
it cannot complete a link, query consent, enqueue or authorize a new reply.
Subsequent old duplicates ACK even after revocation. Same ID with changed event
content still fails closed. Queue counters and batch boundaries do not enter the
inbound digest. Digests are integrity commitments, not anonymization claims.

No real schema change or destructive migration is added. Cleanup scans the same
namespace with existing limits and deletes expired content-free receipts and
claims after retention. This candidate has never been activated; no deployed
72-hour ledger backfill is claimed.

## Validation and limits

Updated raw candidate/HMAC tests and prepared persistence/runtime suites exercise
synthetic dependencies only. Added cases cover HTTP DELIVERY/SEEN batches, mixed
shapes before SQL, regrouping, reordering, queue counter changes, concurrent
adapter recreation, partial-success retry, old observations, SEEN before delivery,
48h/72h/nine-day/ten-day inbound ACK without replies, content deletion, tombstones
and eventual cleanup. Existing raw-byte/case/Unicode HMAC and sealed-OFF tests
remain. SQL fixture recreation proves adapter behavior, not real engine restart.
The disposable MySQL harness has matching contracts; execution must be reported
separately. No real MySQL restart result is claimed for this change yet.

Actual subscription/profile authentication and routing remain unverified. This implementation does not configure HMAC or establish authenticated
production traffic.
Only TEXT inbound is supported. Preserve ID regex until a separate contract
justifies changes. Keep draft; independent review and exact-HEAD CI are required
before any merge. Deployment/activation remains separately unauthorized.
