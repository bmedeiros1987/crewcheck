# Isolated contracting-intent preparation — HOLD

This local follow-up belongs to the existing Work billing branch. It is not wired to platform routes, native billing, webhooks, RTDN, a queue, timer or provider. PR #1342's published candidate324c1b3f remains a confirmation/feedback fix; its CI does not cover this later local checkpoint.

## Schema compatibility

The current canonical migration has one subscription row per email. It does not contain a durable contracting intent or separate outcome evidence. Reusing its metadata would couple an in-progress operation to a row that can be overwritten by another provider. The additive proposal20261115_022 introduces two separate InnoDB tables without changing existing profile, subscription or entitlement rows. It is never installed by application startup or the new module. No production migration is executed or authorized by this preparation.

The read-only schema check verifies required columns/types/nullability/binary receipt-reference collation, transactional engines and unique indexes. Missing old schema, missing account uniqueness or a nullable active slot fails closed. There is one occupied slot per account; no lease expiration, release, cancellation or automatic retry is implemented. Future lifecycle/privacy/deletion handling is a separate integration gate.

## Boundary

- Reservation/claim reuse the existing ordered profile/entitlement transaction boundary and verify the account public-ID incarnation. Competing requests reuse one original operation. Existing provider evidence blocks new contracting instead of being overwritten, including terminal-looking rows that still need reconciliation.
- A committed claim changes reserved to dispatching exactly once. Provider transport must occur only after that successful return and outside the helper's retryable transaction. This module performs no transport and does not claim provider exactly-once semantics.
- An uncertain provider or commit outcome stays blocked. No elapsed-time rule reopens it. Created means an entity reference was recorded, not payment, entitlement, acknowledgement or activation.
- Outcomes store operation/receipt identifiers and hashes, not a raw Google purchase token or provider payload. Google references are hashes. Uncertain evidence is retained when a later created reference is recorded; duplicate receipts cannot downgrade it. Conflicting receipts/references fail closed and do not retry contracting.
- No function changes the subscription, grants access, changes a profile plan, deletes prior evidence, cancels/refunds a provider, or releases the occupied slot.

The API is internal preparation, not an authentication boundary. A future caller must obtain identity and evidence from existing authenticated/provider-verification paths, never client claims. In particular, handling a provider result after owner deletion/recreation and durably quarantining rejected/conflicting evidence is not completed here. These are blockers before wiring a charging path; the prototype is not a two-provider rollout.

## Evidence

Using cached MySQL8.4 in a disposable local container with network none, no published ports, a unique owned temporary datadir/socket and bounded resources:

- Current schema without the proposal is unavailable, with zero admission.
- Applying the proposal twice preserves existing profiles and verifies compatibility.
- Twelve concurrent reservations converge on one operation; twelve claims produce one admission.
- Unknown outcome, lost commit acknowledgement, deadlock rollback/retry, duplicate/conflicting receipts and provider-reference uniqueness are covered.
- Existing subscriptions, account reincarnation, hashed-only Google references, malformed stored records and schema drift are covered.
- No paid entitlement or extra subscription is created.

The initial stock-image entrypoint failed while daemonizing its temporary startup server; its error log is preserved privately. The existing repository's direct-foreground mysqld pattern then started successfully with the same cached image and no network. This was a technical startup correction, not a permission workaround.

The SQL regression refuses DATABASE_URL/TCP configuration: it requires the dedicated QA flag, owned temporary root, socket, exact disposable database name and datadir. This is a new local test path; existing production/disposable notification databases are not reused or modified.

Remaining release gates: independent review, canonical-prepared repeat and restart evidence, CI coverage of the exact composition, explicit migration review, durable conflicting/late-owner evidence intake, provider-specific reconciliation/cancellation and account deletion/privacy integration. HOLD remains even if the earlier #1342 CI is green.
