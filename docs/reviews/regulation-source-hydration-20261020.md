# Regulation source hydration recovery

Base: published main cc66f9aec1db8cd6f8e82853e01e2a9d852fc21f. Synthetic evidence only.

The scenario UI had used `getPublishedDutyLimitSummary`, a measured-usage reader. It returns null when release/other publication evidence is incomplete, so a missing endpoint also suppressed the independently available B.1 ceiling. The new read-only reference reader reuses the existing B.1 table and ACT restriction function; it does not change those rules or the measured summary's semantics. The strict published reader requires published presentation and actual sectors. The programmed simulation may separately use an explicitly estimated presentation (see follow-up below).

`regulationProgramDay` also returned an ISO date to consumers of the roster DD/MM/YYYY contract. It now preserves the correct contract and carries the original selected canonical journey into the UI. The UI reads independent published endpoints from that journey, preserving chronology across civil dates instead of reconstructing a flattened day.

The default programmed-duty projection compares the published release, or a clearly marked estimate of final scheduled block arrival plus the existing 30/45-minute post-flight reference, with the existing motor ceiling. Both airport endpoints must be recognized in the existing catalogue; an unknown airport does not become international or domestic by exclusion. No financial overrides, values or calculation are used. Estimated end responds to edited post-flight/tasks; an explicitly edited end wins. Unknown additional tasks are disclosed as excluded. Delay shifts the programmed end in this mode. The detailed takeoff/airborne/taxi method remains separately selectable and preserves its strict input requirements. Scheduled block arrival is never labelled landing or final engine stop.

B.1's simple/acclimatized applicability remains an explicit conditional hypothesis in the visible result. Neither `FlightLeg` nor `LegalProfileSummary` carries an authenticated regulatory composition/acclimatization producer. The legacy calculator's default `acclimatized` was not evidence. Aircraft size, crew count and a domestic route do not prove those states. A known incompatible composition/acclimatization suppresses the automatic B.1 comparison, even after checking review; a manually supplied reviewed limit remains possible. No new legal inference engine is introduced.

Manual field overrides survive source refresh but reset on selected-program/account/session transitions, including navigating away and back. Chronology, post-flight minima and midnight crossing remain checked. No localStorage/API simulation writer is added. No Home, financial, phone or server routing implementation is changed. HOLDs #1128/#1135 remain separate.

Tests exercise actual canonical builder, endpoints, compliance reference, geography catalogue and React component with synthetic data: missing/estimated/published release, three device zones, normal-end 13:10 for synthetic APZ04:10, reference independent of measured usage, unknown airport, international/domestic, manual overrides, post-flight/tasks recalculation, invalid chronology, midnight crossing, incompatible applicability, program return and auth reset. Compiled Home departure tests intercept route-preview locally and block every external origin; they never contact a route provider or bypass authentication.

Real-account observation established a blank normal-end and indeterminate result, but did not inspect the user's raw publication evidence. Therefore the exact missing release provenance in that account is not claimed as proved. No private roster is included in these fixtures or the PR. Operational applicability beyond the existing engine remains outside this UI recovery.

## Follow-up: legacy or estimated presentation

Public release54444744 restored estimated end and operation, but a read-only account check still showed an empty ceiling. The exact raw account provenance was not read. A new synthetic counterexample establishes a sufficient code path: a legacy/unknown presentation clock with no leg-level publication is discarded by the adapter and rejected by the strict reader.

The adapter now retains an available first-leg/day presentation clock as an estimate, with no promotion of canonical publication evidence and no borrowing from another journey. An existing canonical presentation estimate may be reused only for the first leg; no new offset/default formula is introduced. `getScheduledDutyLimitReference` reuses the existing B.1/ACT functions for that explicitly estimated clock. `getPublishedDutyLimitReference` retains its strict published-only contract, and the measured Summary/endpoints still reject missing proof. The UI exposes the presentation used and its estimated origin for review; it does not claim a verified legal limit. That source paragraph is owner/session gated and disappears at authentication boundaries.

Synthetic coverage includes estimated, unknown, absent and legacy-unspecified source, no leg presentation, unchanged strict-reader rejection and unchanged canonical endpoint uncertainty. Existing independent-journey tests ensure a later journey cannot inherit the day's presentation. No real roster values or identifiers are used in the fixture.

## Departure placeholder guard

The automatic inline review of #1139 identified a real transposed-parser boundary: when APZ is absent, that parser intentionally stores departure in dutyReport with estimated provenance. An equal, non-published day clock must not seed a duty ceiling. Both the adapter and the scheduled-reference reader now reject this placeholder; the existing separate canonical fallback is also required to differ from departure. A missing presentation remains pending for manual entry instead of creating usable pre-flight margin.

The regression invokes the actual parseTransposedFlightGroup on synthetic combined airport/clock visual items without a separate report token (both raw and materialized parser). It proves the parser emits departure/estimated, then verifies both reader and actual canonical/adapted UI path reject it. Browser coverage requires an indeterminate result and no seeded normal end for this case, while a distinct legacy report remains usable only as an identified estimate.

The guard compares normalized wall clocks, including unpadded hours and day-offset suffixes, so `05:00`, `5:00` and `05:00(+1)` cannot bypass it through formatting. Independent review supplied the unpadded counterexample before publication of this guard.

## Manual reference review guard

All inline reviews of #1138 and #1139 were read, including P2 requiring review of a manual normal-end limit. A non-engine limit cannot return a programmed comparison while `reviewed` is false. Editing the timezone or explicitly reapplying an engine reference also sets a review requirement; changing back to the original offset cannot silently restore a result. The existing checkbox releases that local comparison only after review, and source changes invalidate it again. Automatic canonical seed references remain explicitly conditional; this guard does not turn them into regulatory authorization.

Both pure and actual React/compiled UI tests cover manual limit editing while the checkbox is unchecked, a reviewed limit becoming usable, and timezone edits (including reverting the offset) invalidating the result until review. Owner/session, manual end overrides and the no-APZ parser guard remain required.
