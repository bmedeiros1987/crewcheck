# Persistent financial ledger candidate

This additive backend stage preserves financial snapshots independently from the
roster store. It does not migrate, backfill, confirm payments, recalculate old
values, or activate storage in production. The UI published in PR #1062 continues
to say that durable history is unavailable until a separately reviewed integration
consumes this API. No historical records have been populated by this change.

## Operational dependency before activation

1. Review `migrations/20261017_020_financial_ledger_mysql.sql` against the actual
   MySQL 8 schema and verify backup/recovery and account-erasure behavior.
2. Exercise the migration plus concurrent writers in a disposable MySQL schema.
   The included regression uses an offline transactional SQL protocol double;
   passing it is not proof of a deployed schema or MySQL integration.
3. Apply the additive migration through the established operator process. This
   step is not authorized or executed by this PR. No startup code runs DDL.
4. Only after separate operational authorization, enable
   `CREWCHECK_FINANCIAL_LEDGER_ENABLED=true` in the existing service, with
   `PUBLIC_APP_URL` configured to its exact HTTPS origin. No flag is changed here.
5. Wire an explicit reviewed snapshot producer and the owner UI. Never capture
   records merely by rendering, opening history, or replacing/deleting a roster.

## API and identity

`GET /api/platform/finance/history?periodStart=YYYY-MM-DD&periodEnd=YYYY-MM-DD&aggregationLevel=item|day|week|month`
reads owner-only persisted records through `queryFinancialHistory`. Period,
revision, conflict, currency, status and missing-amount rules are shared with the
existing read model. `no_data` is an empty available ledger; disabled/missing
storage returns HTTP 503 with `state: unavailable`, never a fabricated zero or a
fallback to the current roster. A safety ceiling of 10,000 revisions fails closed
as unavailable; a bounded paging design is needed before larger accounts.

`POST /api/platform/finance/history` accepts an explicit operation, stable source
scope, expected revision and owner-scoped idempotency key. Session identity is
resolved from the verified main JWT. Visitors, development email/header fallback,
body/URL owner selectors and unsupported methods are rejected. Cookie writes
require the exact configured Origin; bearer requests may omit Origin. Responses
are `no-store` and do not expose private provenance references or raw documents.

Input consists of `record`, `expectedRevision`, `idempotencyKey`,
`sourceFingerprint` (SHA-256 of the source snapshot), `action` and `provenance`.
The record has only the existing financial read-model fields, without `id`,
`ownerId`, `revision` or free-form raw content. Provenance contains `kind` and an
opaque `reference`, not a credential, URL, raw statement or bank account.

| Action | Status | Required provenance |
| --- | --- | --- |
| capture_forecast | forecast | roster_snapshot; ruleVersion; no paymentDate |
| report_statement | statement_reported | statement; does not confirm receipt |
| record_settlement | payment_confirmed | settlement; prior revision, known amount and paymentDate |

The API records owner-reviewed assertions. An opaque source/settlement reference
is provenance, not independent bank verification; the backend does not connect to
a bank or infer a settlement from an amount/date match. Production producers must
not label unverified user input as an official calculation or verified bank event.

## Identity, revisions and concurrency

A logical entry ID is the SHA-256 of stable `sourceId`, category, currency,
aggregation level and period bounds, excluding status, amount, source fingerprint
and rule version. Producers must use the same stable source scope across roster
replacement and forecast/review/settlement, and separate scopes only for distinct
income items. Upload IDs and roster revision IDs are provenance, never sourceId.
Changing logical scope creates a different entry; corrective relocation/retraction
is deliberately not supported in this first append-only API.

Each owner/logical entry has a locked head and immutable revisions. Expected
revision prevents lost updates; unique owner/idempotency key makes exact retries
return the original receipt, and changed input with the same key conflicts.
Latest revision replaces the previous amount in totals without adding the income
twice. Status may remain or progress from forecast to statement to settlement;
there is no automatic promotion or downgrade. Corrections of a settled record
require another explicit settlement action. Null stays unknown, explicit zero
stays zero. Aggregate overlaps remain rejected by the existing read model.

Financial tables have no roster foreign keys or cascades; roster deletion and
replacement never call this store. Account erasure remains separate and must
remove this owner's revisions and heads in the same owner-deletion transaction.
No delete/update revision endpoint is supplied. The shared service DB user still
has general SQL privileges; append-only is enforced by this API, not a claim of
separate database privilege enforcement.

## Validation

`node scripts/regression-financial-ledger.mjs` runs offline with synthetic owners,
source records and a transaction-aware SQL protocol double: persistence after
store reconstruction without roster lookup, revision-only totals, unknown values,
explicit settlement, owner isolation, retry/conflict, competing revision,
rollback, HTTP methods/content type/origin and missing-schema behavior. Existing
financial read-model and monthly-credit lifecycle regressions must also pass.

No production migration, real financial write, backfill, credential creation or
paid resource is part of this change. Frontend history wiring and actual canonical
capture producers remain a subsequent integration step after the storage gate.
