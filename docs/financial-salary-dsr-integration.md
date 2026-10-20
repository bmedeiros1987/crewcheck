# Sourced DSR integration — preparation, not an activated app change

`shared/financialSalaryDsr.mjs` composes the outputs of the existing salary engine; it does not reimplement production, chief, kilometre tariffs or tax. It is importable by both browser and server/Concierge. No storage or network action occurs. Home and actRules remain with their existing owner. Integrate only after the leader has reconciled its current HEAD.

## Input/output contract

Pass `ownerId`, the exact calculation `competence` (YYYY-MM), and canonical calculation `revision`. Pass seven components: `base`, `fixedAdditions`, `production`, `reserve`, `standby`, `chief`, `instructor`. Each carries `ownerId`, `competence`, `amountMinor` (BRL cents or null), `currency:'BRL'`, `status:'estimated'|'confirmed'|'unavailable'`, `sourceId`, positive source `revision`, `effectiveFrom` and `effectiveTo`. These source dates establish applicability of the component total to this competence; they are NOT tariff dates. Preserve the separately verified work/payroll/tariff/credit cycle already calculated by `actPayrollCompetences` and the existing engine. Never relabel a tariff-month source as an operational-month source to pass validation.

The caller authenticates the owner and constructs all components from ONE canonical calculation revision. Source revisions may differ, because source documents differ. This pure model checks ownership/period/provenance structure; it is not an authentication service or cryptographic document verifier. No record from the model is evidence of bank payment.

`profile` requires matching owner/competence/source revision and applicability interval, `company:'TAM'`, `role:'cabin'`, `regime:'NB'|'WB'`, `review:'confirmed'`, and `sourceKind:'owner_reviewed'|'employer_document'`. Do not pass actRules fallback or derive a payroll regime from one flight. Missing profile produces pending DSR, not NB by default.

`basisReview` is matching owner/competence/source/revision/interval with `review:'confirmed'`: it records the independent review establishing that production/reserve/standby are the applicable DSR basis. The ACT clause establishes the ratio; it alone does not authorize arbitrary component inclusion. Chief, instructor and fixed pay are excluded by the model. Monthly totals for absent activities must be explicitly established as zero, not synthesized by this module.

Set `componentsExcludeDsr:true` only when the supplied engine components genuinely exclude DSR. Unknown/additional `dsr` components and duplicate keys prevent a complete gross. The DSR component is added once. The model sums eligible cents before rounding DSR once (half up); it never rounds a tariff or overwrites a historical printed amount.

Optional `reportedDsr` uses the same source fields with `status:'confirmed'`; it remains independently reported. `reportedDsrMinor` and `dsrDifferenceMinor` reconcile it with the projection. A difference does not rewrite either amount or mark payment received.

Output `grossMinor` is nonnull only with complete supported composition. `knownSubtotalMinor` is the supported gross subtotal, explicitly NOT a complete salary. `dsr.knownDsrSubtotalMinor` is a DSR subtotal on the known reviewed basis, separate from full DSR; do not silently add a partial DSR as a full component. `pending` uses compact machine codes so UI can show icons/short labels with source details collapsed. Net remains pending until the same revised gross is passed through existing, applicable deduction/tax evidence. Do not retain an old net after adding DSR.

## Leader's Home integration points

1. In `calculateSalary`, map the existing aggregated `production`, `reserveAssessment`, `standbyAssessment` and fixed/chief/instructor components into the contract, preserving their completeness and source metadata. Unknown intervals yield null for the complete component; preserve the engine's own per-activity subtotal separately.
2. Supply the owner/period financial profile and basis review from the existing confirmed configuration. This PR does not invent or persist that profile. Do not import `getLegalProfile(...).aircraftGroup` as evidence without its owner-bound independent verification.
3. Consume `composeSalaryWithDsr(...)` once. Return its complete gross or pending state plus supported subtotal. Update salary diagnostics and canonical capture to include DSR and the same calculation revision. App and Concierge read the same resulting canonical record, never independently add DSR a second time.
4. Render a short DSR value/status inside existing progressive salary details; preserve eye privacy for displayed values and accessible text. No new paragraphs on the main screen.
5. Browser checks after integration: unknown/zero/complete NB/WB; owner/period switching; confirmed monthly overrides; closed paid rows unchanged; gross/net and app/Concierge revision parity; privacy; mobile/keyboard. This isolated model has no UI to claim those checks have already passed.

## Vacation legal timing

`shared/financialVacationTiming.mjs` exposes `vacationPaymentTiming({ownerId,plan,lawApplicable})`. The plan is owner-bound with positive revision and optional civil `startDate`. Its `deadlineDate` is two calendar days before a real start under Lei13.475 art71. A month alone returns pending; there is no exact date guess or weekend extension. `expectedDepositDate` stays null and `paymentConfirmed:false`: legal deadline and employer deposit forecast remain distinct. The caller separately establishes applicability of the law. This module computes no vacation amount, second instalment, 13th advance, deduction recurrence or holiday/bank adjustment.

Legal source: https://planalto.gov.br/ccivil_03/_ato2015-2018/2017/lei/l13475.htm (art71). DSR source and validity are returned by `CABIN_DSR_RULE` (ACT3.4.8, 2025-12-01..2027-11-30).

## Executable validation

```
node scripts/regression-financial-salary-dsr.mjs
node scripts/regression-financial-vacation-timing.mjs
```

Synthetic tests cover partial/zero evidence, account isolation, source revision and applicability, NB/WB, reviewed basis, exclusions/duplicate components, integer overflow, rounding boundary, original reported amounts, leap/year/weekend boundaries and absence of deposit/payment inference. The existing financial workflow runs these before dependency installation and retains all existing gates.
