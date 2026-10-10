# Unknown reserve / standby salary intervals

Base at creation: be292f81a7945c9a038d0cac95b53b8a8b421463. Separate from PR967 (parser clock provenance), PR968 (planned owner isolation) and approved national-holiday classification work. Revalidate main before integration; preserve the approved holiday classifier unchanged.

Preexisting counterproof: AIMS HSB02:00–02:40 can be excluded by the current duration-token heuristic, leaving both raw boundaries null. Canonical normalization retains the activity using00:00–23:59. The old salary caller then multiplies23h59 by a standby metric. This PR preserves canonical normalization and parser behavior and stops those fallback instants from proving a salary interval.

The salary caller assesses every ASB/RES/HSB/HSBE activity before applying the existing hours/metric formula. Required raw published boundaries and origin are checked, including duplicate source records. Missing, invalid, estimated, unknown or unowned legacy origin keeps that category's hours/amount, gross/net and comparison totals unknown (NaN internally, “Não calculável” in UI). A zero metric does not mask missing timing. Genuine known zero amounts remain zero. Valid rows and known category subtotals remain available; duplicate activity identities are counted once. The existing reserve activation cutoff is preserved by invoking payableReserveHours after evidence validation. No rate, ACT, payroll competence, canonical rule, parser, holiday or timezone interpretation changes.

The details panel shows known subtotals alongside the number of pending intervals and their raw clocks/origins. The salary graph/summary/comparison remain pending; valid flight rows remain available. These are forecasts, not payment confirmations. Legacy origins are not automatically recovered. The producer fix in PR967 supplies source for future AIMS imports; old records still require verifiable source and must not be certified by the application update alone.

Synthetic validation: actual parser → canonical → Home buildLegs/calculateSalary reproduces23h59 before correction and blocks it after. ASB/HSB/HSBE missing/invalid/estimated/unknown/legacy clocks, mixed known subtotals, persistence, immutability, dedup, overnight, nominal competence, activating-flight credit and zero-metric cases run in UTC/Sao_Paulo/Tokyo. Actual compiled mobile/desktop salary summary/graph/details/comparison:12cases, missing ASB/HSB aggregate pending, known activity subtotal retained, valid flight row retained, no graph zero or false no-loss claim. All APIs intercepted, external origins blocked; only synthetic accounts and metrics.

Run after canonical preparation/build:
```
node scripts/regression-salary-activity-evidence.mjs
node scripts/regression-salary-activity-browser.cjs
```

Independent review of the exact source/prepared tree, confirmed-hour rules and mixed-state consumers is required before merge/deploy.

Independent review scope clarification: payableReserveHours is the published canonical rule from merged PR321 (26419a50e666184af8f2f22801ecef5303c60c6d), implemented in financialReserveCredits.ts and applied by scripts/v139/apply.mjs importing scripts/v14385/apply.mjs. The raw base Home has durationHours but the actual build replaces that reducer. PR970 preserves the prepared rule; it does not introduce the first-flight cut. A valid 04:10→10:10 reserve activated08:20 already credits4h10 in the prepared published base. The optional CREWCHECK_PREPARED_BASE_HOME regression compares gross, reserve, standby and hours for complete fixtures and activation, across3TZ. No ACT basis or new rate is claimed here; changing this existing rule is outside PR970.

Browser fixture now supports owner-v2 snapshots using the real rosterFingerprint and explicitly requires v2 when REQUIRE_PLANNED_OWNER_V2=1. Legacy v1 is seeded with another-source poison in that composition and ignored. Standalone PR970 on the pre968 base retains the existing v1 fixture only to exercise its current comparison contract.
