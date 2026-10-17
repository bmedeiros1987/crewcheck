# Persistent financial ledger candidate

This additive backend stage preserves financial snapshots independently from the
roster store. It does not migrate, backfill, confirm payments, recalculate old
values, or activate storage in production. The UI published in PR #1062 continues
to say that durable history is unavailable in production. This local candidate adds a read-only UI consumer, including
a month picker usable without any roster; the API remains disabled. No historical records have been populated by this change.

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
5. Wire an explicit reviewed snapshot producer. The candidate UI only reads; it
   never creates a snapshot. Never capture
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
paid resource is part of this change. Read-only UI wiring is included and verified with synthetic API fixtures.
Canonical capture producers remain a subsequent integration step after the
storage gate. The UI does not POST, confirm payments or backfill historical
rosters. It suppresses stale/account-mismatched responses, separates forecast
and settlement totals by category/currency, masks values and bars with the
existing privacy control, and distinguishes unavailable/empty/unknown/zero.
The no-roster view queries a chosen competence directly, without loading any
previous roster. Offline browser tests remove all roster storage and reload.

## Local delivery / external approval state

The candidate is composed on published main `3373a1253c460a3249e32eca0616d150be0fe9e4`
(tree `4a392d07f510c84cd4eef584dda03b06fb031f11`). The previous local commit
`40a12d77a030d740a5d2e784285553b870565b3e` was cherry-picked onto this base.
No push is part of this local-validation stage. The previous push returned
`aborted by user` without a reviewer reason or execution confirmation.
Read-only lookup of `refs/heads/feat/finance-ledger-20261017` returned 404 while
the same repository/main/PR were readable through the same connector. This
strongly indicates an absent branch rather than inaccessible repository; it
does not establish who cancelled the push. A future push requires clarification
of that cancellation and explicit permission to retry; do not change credentials
or use another route. No PR for this backend has been created.

Docker/MySQL server/client were absent from PATH and usual local binary paths.
No runtime was installed, database created, credential requested or cost incurred.
Before activation, an operator must provide an explicitly disposable MySQL 8
environment for real DDL/concurrency/erasure-race checks, then approve the
production migration and activation separately. No database or production access
is needed to review the supplied local diff/bundle.

## Original currency and expected payment dates

Original currency and minor-unit precision are retained (including JPY 0 and KWD
3 decimals). Totals and charts remain separated by currency, category and status.
Expected payment date is distinct from accrual competence and reported actual
payment date. Neither scheduling nor conversion promotes a payment status.

Timing policies are explicitly owner scoped, airline scoped, versioned by
effective period and based on the owner's report, not a global airline/legal
rule. Foreign allowances require one explicit published-flight link for the
logical allowance, with flight local date, airport and timezone; ordinary legs
are never guessed or multiplied into advances. BRL Thursday timing requires a
reviewed payment-cycle date: the payroll cutoff has not been established. A
Thursday bank holiday in São Paulo capital moves only to an open Wednesday.
A closed Wednesday, nonholiday closure or unverified 2027 calendar stays pending.
The 2026 calendar distinguishes February 18 partial service and December 31
nonholiday closure. Source: https://portal.febraban.org.br/noticia/4413/pt-br/ .

These helpers accept explicit reviewed inputs; the current forecast producer
does not yet supply the owner policy, cycle mapping and foreign flight links.
Do not describe this candidate as automatically applying those dates to all
existing forecasts. No past settlement or actual exchange rate is rewritten.

## Converter, forecast carousel and Home estimate

A single ephemeral currency-calculator route is reachable through the finance
menu and the allowance calculator shortcut. Returning preserves competence and
selected original currency. Calculator drafts are bound to the authenticated
session and discarded on account changes/logout/expiry. Simulations never write
ledger records or save a rate. Locale parsing, inverse/cross conversion and
minor-unit rounding are explicit; missing, future or incompatible dates fail
closed. The forecast card alone uses native horizontal scrolling and keyboard
controls; other sections stay fixed and financial privacy masks all slides.

Home can show a clearly labelled estimated BRL total for one allowance payment
cycle, alongside original amounts and dated source/rate details. Missing or
undated references and incomplete month coverage produce a partial estimate,
not a fabricated zero or a received-payment claim. Salary is excluded.

Inspection found the existing account-scoped manual FX settings, but no active
conversion API/route. The user's description of an existing API remains
unresolved. No new provider, paid API, credentials or per-keystroke requests are
introduced. Existing manual settings without a matching dated reference are
excluded from Home conversion; explicitly entering a new rate asks for its date.

Regulation UI and the requested +1-hour simulation are a separate subsequent
stage. No legal limits, duty formulas or actual roster are modified here.
Official applicability evidence and independent review are needed before
changing normative calculations.

## Reviewed snapshot producer — separate local stage

`server/financial-forecast-producer.mjs` accepts an explicit owner-reviewed
financial snapshot and an injected ledger store. It validates the whole input
batch before any append, derives stable source scopes from scopeId/item key,
and uses source fingerprint plus expected revision for replayable writes through
the existing SQL adapter. It never infers settlement, calls a paid API or runs
on startup/render/roster replacement. Identical retry returns the original
receipt; changed input using the same fingerprint conflicts. A changed reviewed
snapshot can append a new revision of the same logical income.

Batch writes are individually transactional, not atomic as a whole. If a later
append fails, retrying the identical batch safely replays earlier successes and
continues. The regression exercises this interruption and recovery with the
offline SQL protocol double, alongside owner isolation, revision-only totals
and prevalidation of a later invalid item. No real financial records are used.
Production integration still requires a reviewed canonical capture point; this
module is not wired to live roster ingestion or the read-only UI.

## Exact remaining external inputs

MySQL server/client, MariaDB, Docker and Podman were absent from PATH; usual
Homebrew/MySQL and Docker.app paths were also absent. No database sockets or
production connection strings were probed. To run the real integration gate,
provide an existing disposable MySQL 8.x InnoDB instance reachable locally, or
authorize installing/starting a local MySQL 8 runtime. Use a dedicated empty
schema such as crewcheck_financial_test_20261017 and a user restricted to that
schema (CREATE, SELECT, INSERT, UPDATE, DELETE); it must be safe to discard.
Supply any connection through the local secret/environment mechanism, never
paste credentials in chat. Do not point the test at the production schema.
No install, schema creation or production migration occurred.

FX discovery covered tracked currency/exchange/fx paths, client/src, shared,
server routes and snippets, canonical generator scripts, package.json, the
nonsecret configuration templates .env.example/render.yaml and matching Git
commit subjects. Searches covered currency API names, AwesomeAPI, Frankfurter,
OpenExchangeRates, Fixer, PTAX and exchange/fetch patterns. The code path found
is Home.perDiemConfig -> readNumberSetting(crewcheck_fx_usd_brl/eur_brl/gbp_brl),
backed by financialSettingStore; financialFxReference reads matching dated
metadata from those account settings. No active quote-service route, provider
client or FX config variable was found. OAuth authorization-code exchange is
unrelated to currency. No secret files/values or paid services were accessed.
The API integration remains incomplete: the missing input is its provider name,
existing route/module or service/repository location (no keys needed).
