# Financial checkpoint and integration contract — 20 October 2026

Base: 456929e0 (main). Separate from PR1154 and its consent/source adapters. No production writes, migrations, external messages or flag activation.

## Taxi: proven behavior and owner handoff

The existing #1018 implementation is retained. `taxiPresentationOccurrence` requires a proven presentation at contractual base within its operational BRT window. The current policy is user-reported operational evidence, not an ACT clause. Do not infer eligibility from every journey, arrival, a meal window or a tariff alone.

`calculatePerDiem` emits numeric Taxi rows only with a confirmed account/period tariff. A missing tariff creates an unclassified item and blocks the complete total, but the statement renders only numeric rows. Thus an eligible occurrence with no confirmed tariff is invisible as a Taxi statement line. This is reproduced synthetically, not an assertion about the owner's private account state.

`taxi-pending-integration.patch` is an unapplied hunk for the Home owner. It adds a structured `taxi_rate` pending kind, shows a compact nonnumeric statement row, and opens the existing importer/owner tariff review through closed details. It does not change eligibility, money, totals, exports, account storage or the confirmed-zero path. The existing generic pending explanation remains; further compacting it is presentation work to coordinate separately.

Validation: patch applies cleanly to main456929e0; proposed TSX transpiles; actual Home caller regression passes against the proposed snapshot, additionally checking typed missing-tariff evidence and an explicit zero numeric row. Existing real PDF/import/confirmation regression passes. Browser/keyboard/mobile and independent review are required after integration before publication. No runtime file was changed by this handoff.

## Salary audit: confirmed code findings

- `loadActCompensationConfig`: owner monthly settings can override the legacy inputs; legacy manual base/rates precede confirmed document rates, then the applicable reference. Audit the provenance and period of each override before replacing it.
- `privatePayrollExtraction` already distinguishes competence, printed credit date, monthly base, individual earning/debit rows, source locations, missing/zero/conflicting evidence and printed gross/deductions/net reconciliation.
- `PrivatePayrollPreview` is ephemeral. Importer confirms eligible base/tariffs, not arbitrary extracted deductions or recurring schedules. The recovered document has not been written into the owner's account by this work.
- `calculateSalary` gross currently sums base, fixed additions, production, chief, instructor, reserve and standby. No explicit DSR component appears in that sum. Confirm the applicable clause and exclusions before adding a DSR formula.
- Current deductions are informed monthly/legacy inputs, not an automatic effective-dated INSS/IRRF engine. Net is presented only with the existing completeness checks. Missing evidence must remain unavailable, never a confirmed zero.
- Current flight production uses geographic distance estimates and discloses that they do not prove corporate payable kilometres. Do not present an estimate as payroll precision.
- Current majorated sector path uses the majorated rate for extra/day and night; do not stack DFS and night into an unsupported further multiplier.
- Existing cabin reference derives an adjustment from a published older table and limits its interval. Do not replace adjusted personal evidence with the older printed floor, project an unknown future index or infer an hourly divisor from a document's hours field.

## Shared contract for app and Concierge

Extend the existing canonical financial revision rather than introduce a second calculator. Each adopted input needs owner, competence, source/revision, effective interval, review state and explicit unknown/zero/value. Each output identifies its calculation revision, included components and missing material inputs. App and Concierge must read the same owner/month/revision. Preserve closed months and individual rows.

A payroll import creates a review draft, not automatic recurring deductions. Classify each debit as effective-dated recurring fixed amount, one-off, advance offset, or statutory recalculation. Recurrence requires explicit owner review, editable start/end and revision; do not repeat INSS/IRRF, vacation, advances or other one-off amounts merely because they were printed once. Manual entry uses the same contract. Recalculate supported components automatically; request only missing evidence.

Statutory calculations need official effective-dated brackets, taxable/deductible component mapping, dependent/deduction elections where relevant, rounding and reconciliation tests. DSR needs verified basis and rest-day treatment. These are pending source review, not implemented by this handoff.

Keep payroll competence, operational variable month, tariff month, expected credit month and actual paid event distinct. Printed credit date does not prove a bank receipt. Exact predicted day needs a verified rule, applicable holiday/business-day calendar and explicit uncertainty. Existing confirmed company-cycle support provides expected month without guaranteeing an exact day.

No personal salary figures, document text or identifiers are embedded in this report, tests or code. Source research is being coordinated separately; its recovered evidence must stay account-bound and private.

## Incoming source reconciliation (not adopted as a global rule)

The source researcher reports repeated payroll evidence for DSR over specified production/reserve/standby rubric codes with a 22/8 basis. This supports a component-level reconciliation candidate; adoption still requires the source report and applicable clause review. Preserve rubric inclusion/exclusion explicitly, especially chief compensation. Historical chief formulas are not evidence of a current formula.

The researcher also reports cent-level discrepancies between printed rounded rates multiplied by printed quantities and paid rubric totals. Preserve source decimal precision and original printed paid values separately. Do not force historical paid lines to equal a recomputation from a rounded display rate, round intermediate rates prematurely, or overwrite a closed ledger to make it reconcile.

Where only individual components lack evidence, expose the supported subtotal and named pending components. Keep the complete gross/net unavailable when material components are missing; a subtotal must not be labelled full salary. Do not disable supported calculation merely because another component needs evidence.

## Official ACT checked directly

Source: https://aeronautas.org.br/wp-content/uploads/2025/12/20251208-ACT-Aeronautas-Comissarios-25-27_v9-site.pdf

- Clause 3.4.8, printed page25: cabin DSR uses narrow-body22/8 or wide-body21/9, irrespective of actual days off, with no retroactive application to the former regime. Do not use actual count of roster days off as this divisor.
- Clause 3.2.8, printed page15: operational work month, tariff month and payment month differ. Its September example uses October tariffs for payment by the fifth business day of November. Existing month-cycle identity must be retained; do not relabel an operational-month gross as the next bank credit.
- The clause's printed variable rates are subject to its adjustment notes. A future unknown index cannot be extrapolated. The earlier table is not a replacement for adjusted personal evidence.

Additional integration risk found: `actRules.ts` aircraft inference returns narrow body as a fallback with no evidence, and treats any unrecognized nonempty equipment evidence as narrow body. That legal-display fallback cannot establish the financial DSR regime. This file is owned by the regulation leader and was not edited. Financial integration must use a verified owner/period regime or retain DSR unavailable; it must not silently adopt that fallback or classify a whole payroll regime from one flight.

The current seven-line gross formula has no independent DSR field. A correct integration needs: a separately sourced DSR basis (eligible production/reserve/standby, with paid historical rubrics retained), verified regime, interval/applicability, one rounding at the component boundary, a visible component in progressive details, gross inclusion exactly once, deduction reassessment for net, and propagation through the existing app/Concierge revision. Neither chief formula nor an exact corporate kilometre table has been established by the current motor. Keep those component-level limits explicit while calculating supported subtotals.
