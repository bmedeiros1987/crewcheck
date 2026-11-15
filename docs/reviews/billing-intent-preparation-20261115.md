# Contracting-intent preparation — HOLD

This follow-up belongs to Work's existing billing branch. It is not wired to platform routes, native billing, webhooks, RTDN, a queue, timer or provider. It performs no provider transport and grants no entitlement. No production migration, charge, cancellation, refund or release is included.

## Schema and privacy boundary

The current schema has one subscription row per email, but no durable contracting intent or separate outcome evidence. The additive proposal20261115_022 introduces two InnoDB tables without changing existing profile/subscription rows. Application startup never installs it.

The read-only compatibility check verifies columns, types/nullability, binary identifier collation, InnoDB and unique indexes. Missing schema or account uniqueness fails closed. There is one occupied slot per account; no lease expiry or automatic release/retry is implemented.

An account key and owner-incarnation digest prevent a recreated account from adopting or contracting around an old operation. The redaction helper requires the active canonical transaction client and the current profile lock; it clears raw email/public-ID links in the same transaction as deletion. Rollback restores both. Known-original-owner outcomes can subsequently be appended under the immutable operation lock without recreating a profile or granting access.

Hashes and provider references are pseudonymous financial evidence, not anonymous data. Retention, access, erasure policy and composition with the actual account-deletion route remain required before real use. This internal API is not an authentication boundary: future callers must use verified server identity/provider evidence, never client assertions.

## Transactions and admission

The single shared transaction implementation now:

- sorts profile locks as before;
- retries an action deadlock only after confirmed rollback;
- never retries an uncertain COMMIT;
- physically discards connections after failed rollback, commit uncertainty or fatal connection errors;
- never returns an uncertain connection to a pool, even when discard is missing or fails;
- restricts atomic cleanup to the active transaction client, excluding pools and escaped completed clients.

Reservation/claim reuse the existing profile/entitlement boundary. Competing requests converge on one operation; a committed claim admits one external effect. Transport must occur only after successful admission and outside the retryable transaction. An unknown provider/commit outcome stays blocked. This is not a claim of provider exactly-once behavior.

## Evidence and reconciliation

Created means a provider entity reference was recorded, not payment or activation. Outcomes retain operation/receipt IDs and hashes, not raw Google tokens or provider payloads. Google references are hashes. Duplicate receipts are idempotent; uncertainty does not overwrite a known reference or resolve a conflict.

Conflicting provider/reference evidence is retained with its provider and reconciliation_required state. It never replaces the original provider/reference, releases the slot or grants access. Both provider orders, including a conflict before the original result, preserve both outcomes. No cancellation, refund or entitlement policy is inferred from a hash.

Still held: authenticated ingestion for unknown/legacy operations, rejected-receipt quarantine, verified legacy backfill, provider-state freshness/order, conflict adjudication, cancellation coordination, privacy policy and schema rollout. The existing charging routes remain unchanged by this preparation. Do not describe it as live Asaas–Google synchronization.

## Validation and limits

The cached MySQL8.4 runner uses an owned temporary datadir/socket, no network or published ports, bounded resources and no production DSN. It refuses another owner's QA socket and cleans only labelled/owned resources. No image pull, provider call or production DDL occurs.

-26 real SQL cases pass raw and canonically prepared, including twelve concurrent reserves/claims, uncertainty, lost commit acknowledgement, rollback/discard, deletion/redaction, late evidence, account reincarnation, schema drift and both-provider conflicts.
- Real server restart preserves every intent/evidence row and prevents another admission.
- Existing canonical entitlement and Asaas inbox SQL fixtures pass unchanged in a separate disposable database.
- Cleanup fault tests, transaction-client capability tests,1200 differential entitlement cases, Web/Google confirmation and Asaas receipt/HTTP regressions pass raw/prepared.
- Canonical build and TypeScript pass; preparation preserves all new runtime/migration/test source hashes.
- Independent read-only reviews closed the rollback/late-owner issues in the bounded preparation and found no new blocker in the conflict delta. Reviewers did not execute tests. Exact-head CI is still required.

CI adds raw/prepared intent runs to the existing validation job. Mode0 skips only duplicate legacy replay because that job already executes those fixtures; it does not skip the new SQL tests. The earlier stock-image daemon startup failure, harness failures and unsafe rollback counterproof remain preserved privately. None is relabelled as a successful run.

## Test-only orchestration follow-up

A synthetic driver composes the actual reservation, admission and outcome primitives against the disposable MySQL database. Six scenarios pass: eight competing drivers produce one simulated effect; timeout after an effect blocks another call; interruption before transport stays blocked; a late receipt recovers a known operation; deletion during transport retains redacted evidence without profile resurrection; and lost receipt-COMMIT acknowledgement does not repeat the simulated effect. The runner then restarts MySQL and checks the complete combined evidence snapshot.

The driver instruments its caller transaction scope to assert simulated transport occurs outside a transaction. This is a test recipe, not a production dispatcher or proof of actual route/provider composition. No provider adapter, authenticated ingestion, migration rollout or entitlement grant is introduced. Operational HOLD and all privacy/reconciliation gates above remain. Remote HEAD and the blocked PR description are unchanged while this follow-up is local.
