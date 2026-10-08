# Finance history foundation — review package

Base: main `d54f1950c903d2b53d2c67a2a10294f6d5f6d1e8` revalidated by fetch.
Isolated branch: `feat/finance-statement-history`. Existing dirty checkout and WhatsApp #888 preserved.

## Diagnosis

- `Home.tsx` calculates allowances using the existing financial engine; it has currency totals and current cycle estimates, but calls a predicted cycle a statement and uses wording implying payment.
- `financialStatementLearning.ts` extracts rates and a declared total. `FinancialStatementImporter.tsx` saves only confirmed rates, using a device-global storage key. It is not an owner-scoped payment ledger, and confirming a rate does not confirm a payment.
- `observedStatementCycle` assumes Wednesday–Tuesday/Thursday using the device timezone. The sample does not establish a contractual recurring rule. This foundation does not change that engine or claim its predictions are homologated.
- `conciergePerDiemReply` currently lists potential overnight stays and directs users to the app. No server financial read model with official history was identified.
- Existing finance learning regression checks arithmetic and source strings; it is not company reconciliation or a payment proof.

## Delivered slice

`shared/financialReadModel.mjs` is a side-effect-free query contract for the future authenticated producer. It separates forecast, company-statement-reported, and settlement-confirmed states; enforces owner scope; preserves explicit competence, currency, timezone, source ID, rule version and revision history; separates advances; rejects conflicting duplicates; never prorates statement totals. Amounts use integer minor units, with no rounding or exchange conversion. Missing amounts keep the aggregate unknown.

The contract now requires `aggregationLevel` on every record (`item`, `day`,
`week`); the query selects one level (default `week`) and never adds the others.
Multiple day/week aggregates for the same exact document/currency/period/status/
category scope with different IDs are ambiguous and excluded. Item identity is
still a producer responsibility; different documents and overlapping periods
must not be represented as independent earnings without verified identity.

Latest revision is resolved before validation. Invalid/unorderable latest data
quarantines the ID; it cannot silently resurrect an earlier value or payment.
Invalid distinct records and conflicts make the collection `incomplete`, set
`publishable: false`, and null all totals, including otherwise valid groups.
Unambiguous valid historical revisions remain for review. A subsequent valid,
ordered correction can replace an invalid older revision, whose rejected history
is still counted separately. Evidence kind/reference participates in duplicate
identity before private reference projection; structural equality does not
authenticate a bank receipt. Reconciliation provenance requires nonempty typed
strings and normalizes their whitespace.

Reconciliation compares already-grouped canonical amounts at item/day/week level. It returns exact differences and requires source and rule version; it does not infer rates or adjust predictions. Stable record IDs must be supplied by the producer: document/page/footer occurrences are not distinct financial records. Corrections retain the same logical ID and increment revision.

The existing PDF rate learner now leaves missing/conflicting declared totals unavailable and deduplicates identical repeated totals. It still returns existing numeric values for compatibility and is not a ledger or exact-money calculation engine.

Every declared-total marker is inspected with a strict positive Brazilian money
token and exact two decimal digits. Extra decimals, malformed thousands groups,
negative/missing tokens and numeric overflow force mandatory review and remove
the total even when another page had a valid positive amount. Explicit zero is
retained as an actual declared value. Payroll learning is outside this change.

## Integration contract for parent / #888

- Call `queryFinancialHistory` only after host authentication and authorization. `identity` must come from the trusted session/binding, never request text/body. This helper is not an authentication mechanism.
- Load records from owner-scoped trusted persistence. Validate document provenance and settlement evidence in the producer. An arbitrary client-provided evidence string is not proof of a payment.
- UI, export and CrewCierge should consume the same result and `financialStatusLabel`; deny visitors before retrieving data and revalidate owner/binding before sending. No transport changes are included here.
- Forecast records require a rule version, source and timezone; they must come from the existing canonical engine only after sufficient inputs and approved rules. No homologation flag is inferred here.
- Select full competence periods explicitly. `no_data` has no fabricated zero totals or alerts. Cross-currency totals remain separate. Advances are not subtracted implicitly.
- `history` retains previous revisions, including periods corrected outside the current query. Conflicting same-revision records are excluded and counted for review.
- Use `state`/`publishable` before rendering any aggregate. `no_data` and
  `incomplete` are distinct; the latter has rejection diagnostics and no numeric
  total suitable for UI/export/chat. Do not replace it with older history.

## Blocking gaps / next gates

No authenticated ingestion, persistence, history UI, export, chart, or live CrewCierge financial integration was implemented. A source of actual company statements/settlements and ownership must be established first. No migrations, production writes, new rates or ACT changes were made.

The Library resolved the reference filename, but its current official materialization transfer returned HTTP 403, so no PDF bytes or pixels were inspected locally. Visual adaptation is blocked; parent observations are context only. No private document or financial data is included in this repository. Tests use synthetic 2032 data.

Company homologation requires versioned official rules/tariffs with effective dates and rounding policy; samples covering overnight journeys, competence boundaries, breakfast/meal eligibility, reserve/standby activation, base/external stays, multiple currencies, corrections, advances and missing fields. Compare canonical item/day/week output to official records with explicit differences. A single matching sample cannot establish accuracy across these cases.

Independent review must verify trusted identity/provenance at future wiring, revision semantics, exact-money aggregation and no private data in the diff. Mobile/desktop visual QA is blocked by missing wiring and the unreadable reference transfer. No merge/deploy authorized by this draft.

## Validation commands

```
node scripts/regression-financial-read-model.mjs
node scripts/regression-financial-statement-totals.mjs
node --test scripts/regression-financial-review-negative.mjs
npm run check
npm run build
```

CI and independent review of the final SHA remain required before integration.

Local result: canonical preparation completed; both synthetic regressions passed
after preparation; TypeScript passed; Vite production build passed (existing
large-chunk warning). Local dependencies were reused read-only from the existing
checkout and may differ from the lockfile; CI `npm ci` remains the exact dependency
gate. Vite used `--configLoader runner` to avoid writing into shared dependencies.
No mobile/desktop feature QA or independent approval is claimed.
