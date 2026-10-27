# CrewCierge financial read contract

Reconciled on 2026-10-20 against main `19d067e573d8c616340ad3ad46a21540cfc44a0a`. #1054 and #1055 are merged, with subsequent financial corrections already present. This draft reuses #1115; it changes the existing owner-bound upcoming reader, not the financial calculator, UI, Telegram transport, identity authority, schema or operational gate. No real account, document, financial data or production flag was accessed or modified. No merge/deploy is included.

## Shared source

`GET /api/platform/finance/upcoming` calls the existing store once for the authenticated owner and projects `shared/financialReadModel.mjs` through `shared/financialUpcoming.mjs`. History and upcoming use the same latest-revision validation, conflict rejection, categories, original currencies/minor units and settlement distinction. Invalid latest records never resurrect previous values; unknown is null, explicit zero remains zero. No FX or second calculation is introduced. No existing records, individual values or closed months are written.

The additive query `?category=allowance` (also advance/payroll/vacation) selects before sorting and the three-event cap. Omitting it preserves the mixed-category view. Duplicate, unknown or additional selectors are rejected before storage. Selecting allowance client-side after the mixed cap remains insufficient: salary/vacation/advance can occupy all three slots. Rejection diagnostics are excluded only if the entire revision lineage establishes one other known category. Unknown/changing category lineages retain conservative incompleteness; an invalid latest row cannot hide a relevant pending record.

Events now include `periodStart`, `periodEnd`, `aggregationLevel`, `revision`, `sourceId` and `ruleVersion` from the same validated record as amount/date. Payroll also retains `operationalMonth`, `payrollMonth`, `rateMonth`, `expectedCreditMonth` and `amountBasis`. These fields are already available in the owner-only History contract. Evidence references, documents, flight provenance and event owner IDs are excluded. These account-only fields are not permission to forward financial data anywhere.

The horizon remains 30 civil days inclusive of today, interpreted in each expected payment timezone; maximum three events with `hasMore`. Only forecasts enter upcoming; statement-reported and settlement-confirmed values remain separate in History. Payroll dated forecasts must agree with their expected credit month. A month alone never invents an exact day. Amounts remain forecasts, never available balance or received payment.

Revision is the stored record revision, not a freshness timestamp. No `updatedAt`, capture freshness or proof of equality with an unsaved browser estimate is fabricated. The record's source/rule are provenance identifiers, not bank verification. Separate History/upcoming HTTP calls can race and must not be described as one atomic snapshot.

## App and Concierge availability

The web Concierge already reads this endpoint. Only on `FINANCIAL_LEDGER_NOT_ENABLED` can it use `localUpcomingAllowance(useHomeFinancialEstimate())`, a projection of the authenticated browser's canonical calculation. That local snapshot is not available in Telegram. The existing estimate has its own cycle/horizon and may be newer than an explicitly saved ledger capture. Equality is asserted only for the same source/revision, never by silently replacing one with the other.

Ledger default remains OFF. The task did not inspect production activation, migration, account population or freshness. No automatic capture, save or recurrence is added. The current UI/design is untouched. #1113 (payroll deduction review, HEAD observed `90d5e181`) and monthly-store prototypes remain separate. Regulation, Google, Cirium, replay, auth, bot transport and paid sends are outside this change.

## Remaining dependency before Telegram can show amounts

1. Confirm an enabled/populated authoritative source, or retain unavailable. No migration or activation is authorized by this draft.
2. Establish the reviewed financial read authority for the validated Telegram binding. Never fabricate JWT owner identity from profile email, callback/request input or browser tokens. Revalidate binding/session around asynchronous reads and before any authorized delivery.
3. Consume the category selection and returned competence/revision together; retain partial/coverage warnings. Source freshness and detailed pending reasons remain missing from the compact contract and must stay unknown. No raw statements or financial data may be forwarded to models/third parties by this task.
4. Keep the existing unavailable Telegram reply and verified app link `https://crewcheck.online/?view=perdiem`. No new Telegram send, provider activation or inferred deep link is introduced.

`no_data` means no eligible result in the selected category/payment horizon, not an empty ledger or no allowances. Records beyond 30 days remain in History. Unavailable and no_data are never zero. Unknown dates/amounts remain pending; settlement is never inferred from a roster, overnight stay or forecast.

## Synthetic evidence

`node --test scripts/tests/telegram-financial-read-contract.test.mjs` executes the real handler with injected synthetic host identities and a memory store whose write paths throw. Coverage includes owner/visitor isolation, default OFF, unavailable schema, read-only methods, selected category before cap, duplicate selector rejection, equality of History/upcoming latest competence/revision/provenance, payroll competence fields, null/zero, invalid latest, currency precision, date horizon, settlement exclusion and no_data with records outside the horizon. Existing upcoming and timing regressions remain gates. Raw/prepared results are preserved by the existing workflow. Tests establish the code contract only, not actual Telegram authority or real source freshness. Independent review and final CI must be reported separately before any merge decision.
