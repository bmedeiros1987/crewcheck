# Financial references: owner and document periods

## Diagnosis
The application already has canonical operational calculations, a weekly/history explorer, document reconciliation, native currencies, source details, and the shared financial query contract. Rebuilding them would duplicate existing work. The learned-rate store and manual settings were device-wide; a later account could consume another account’s references. Payroll references did not distinguish fixed payroll competence from prior-month operational variables.

## Change
References and manual settings now use authenticated account keys. Ownerless legacy keys remain untouched and are never automatically assigned or migrated. Visitor/guest and missing-token sessions cannot read/write these references. This is local-account isolation; server financial access continues to require the trusted host identity used by the shared query contract.

Every document reference requires an inclusive, valid start/end, native currency, recognized unit/rubric, source fingerprint and source file name. Corrections retain old revisions; repeated documents deduplicate. Malformed/conflicting archives and attempts to erase history are refused without overwriting their bytes. Saving failures cannot report successful calibration. Divergent meal observations require review. Derived hourly quotients are visible for review but never applied automatically.

The owner must review the document and explicitly confirm the user-supplied company cycle for payroll: fixed items use payroll month, operational variables the preceding month, expected credit month the following month. Example using synthetic March 2032 payroll: fixed March, variables February, expected credit April. The review displays the actual mapped inclusive dates. No exact credit day, settlement, APZ rule, chief percentage, ACT rate or company KM table is inferred. The existing canonical formulas and ACT tables remain intact. The ownerless legacy sample is no longer an automatic production fallback.

The home remains compact; period/source information is inside salary details. A reviewed tariff is not a confirmed bank payment. No real account values were changed by this implementation.

## Validation and review limits
All new fixtures are synthetic, with unrelated identities, periods and amounts. Unit coverage includes A/B isolation, visitor/logout, stale/rotated sessions, inclusive/leap/year boundaries, native currency, printed/derived values, revisions/dedup, malformed archives, conflict and storage failure. Browser QA exercises actual compiled finance screens on desktop/mobile, history drilldown, currencies, no-data and visitor/account switch.

The original private document cannot be materialized here: the official Library helper returned HTTP 403. No document bytes or private identities are included in this branch. No trusted settlement producer or live CrewCierge financial wiring exists in this slice. Reuse `shared/financialReadModel.mjs` through the separately coordinated bridge; this branch contains no messaging/transport changes. The reported app total discrepancy cannot be reconciled without its underlying items.

Draft review only. No merge, deployment, production mutation, credential change or destructive migration.
