# Automatic night limits — isolated implementation checkpoint

Base: dd20aefa0ac3402e4ece75d601f54a52cde3e730. Sole preparer: existing CrewCheck Work. Branch: fix/regulation-automatic-night-limits. The initial 0f5a64bd reproduction checkpoint changed no runtime. The later candidate described below implements a bounded comparison and does not change the night-summary cards, reset characterization, cloud/native authentication, providers or production.

## Reproduced defect

The actual regulationAutomaticAssessment ignores publication history. The synthetic real-module regression supplies two previous night duties and reproduces engine stop 01:23 BRT, duty end 01:53 and margin 148 minutes against a 23:25 projection. Expected restricted minute-resolution display: engine stop 23:29, duty end 23:59, margin 34. It intentionally fails before implementation. All people/flight identifiers are fictitious.

## Planned narrow change

1. Carry the authenticated current publication/history context through the existing Home → ManualRegulationView materialized wrapper → RegulationScenarioView → RegulationAutomaticView path. No history fetch, no new identity authority, no inferred days off. A missing adjoining month/day remains unknown. Include publication revision in scenario continuity invalidation.
2. Build evidence from canonical journey identity and proven full-duty endpoints, auditing original/retained publication evidence for dropped or malformed activities. Do not use period maxima or flight-only night intersections as current sequence. APZ, postflight, additional tasks and source release provenance remain distinct.
3. Evaluate the selected scenario's FULL duty interval, including postflight/tasks. Apply only a supported, explicit rule/profile/timezone basis. Retain the B.1 numeric reference separately from the effective restricted deadline; the B.1 hypothesis does not attest GRF approval. Missing history/applicability must not become green or zero.
4. Distinguish a second consecutive night, third OP, third exclusively PS returning to the confirmed contractual base and ending duty, earlier OP in that same duty, fourth in the 168h window (at limit), fifth (above limit). The PS exception is neither +1h nor an exception to the 168h maximum.
5. Keep Law/ACT and RBAC-B applicability separate. Law art42 uses contractual-base timezone; RBAC117 Appendix B uses acclimatized/last-acclimatized location. No guessed timezone, operator approval or local-night reset. B117.29(a)(1), 06–08 restriction and two-local-night reset need explicit supported applicability/evidence.
6. Re-evaluate the same constraint after an admitted operational arrival replaces the scheduled forecast. Do not change provider timestamps, arrival versus engine-stop semantics, or add the manual delay twice.
7. Midnight policy must be explicit: an exclusive midnight threshold is NOT a fabricated 30min tolerance. At minute-resolution, the latest representable end strictly before midnight is 23:59; subtract the parameterized postflight/tasks to obtain the display cut. Test exact midnight and seconds independently before finalizing this contract.

## Original gate checklist (current results recorded below)

Runtime implementation and green regression; second/third/fourth/fifth, PS/base/earlier OP, 168h/reset, incomplete/raw-normalized-serialized history, month boundary, 3 process timezones, different contractual/acclimatized zones, 30/45min postflight and tasks, operational replacement, A→B/revision/navigation; raw/prepared actual app paths and materializer idempotence; relevant engine regressions, TypeScript/build; independent exact-HEAD review, browser/Inter where officially available, CI. No merge/deploy authorization is inferred from this checkpoint.

Primary references: Law 13.475 art35§4 and art42 (current Chamber of Deputies consolidated text); existing ACT Comissários clause3.3.14, Git blob def0784b6e169b143110dc31c8e5571018ab80d2. Parent verified official RBAC117 EMD01 HTML; this executor's web read returned inaccessible, so it did not acquire or substitute a draft regulation. Sources and applicability must remain visible in final evidence.

## Implemented local comparison (candidate after 0f5a64bd)

The local delta now carries the account-owned publication into the automatic view and applies a separate full-duty Law/ACT comparison to the effective ceiling; the original B.1 reference remains visible and is not evidence of GRF applicability. It supports the existing LATAM cabin ACT/profile/file/validity contract only, with a reviewed contractual-base timezone. Unsupported profile/operator/timezone, publication loss and incomplete adjacent daily history remain unknown. Third exclusively PS/base return is evaluated as a night exception, but the existing unavailable PS daily-reference contract is preserved; this does not invent a daily PS limit.

Publication provenance prerequisite is reused verbatim from the already reviewed canonicalRoster.ts delta of night-summary checkpoint 5e15712a (not its card/UI). It preserves original inventories and explicit invalid evidence through repeated normalization. The original branch/cards remain intact. This shared prerequisite is necessary to avoid certifying only parser survivors.

Implemented tests include the supplied case, second/third/fourth/fifth, PS/base/earlier OP, no fifth-night PS exemption, exact midnight, source presentation as 168h anchor versus first midnight touch, 47h59/48h Law/ACT free gap, raw/normalized/repeated/serialized histories, missing day/release/profile/base, lost orphan leg, explicit invalid retained evidence, 30/45min postflight/tasks and replacement by an operational projection without adding manual delay. No source timestamp is changed.

Still NOT implemented/attested: operator GRF approval and Appendix-B applicability, Appendix-B acclimatized timezone, B117.29(a)(1) additional-duty restriction after four nights, B117.29(c) 06–08 presentation rule, and RBAC reset including two local nights. These cannot be inferred from a B.1 comparison/profile defaults. This is a bounded Law/ACT candidate for independent review, not completion of all regulatory regimes or clearance. Integration/publication remains on HOLD pending independent applicability review and the remaining app/browser/build/CI gates.

Local review of e4293005 found ACT validity using a fixed BRT date before resolving the base timezone. Corrected to the contractual-base local date; original counterproof preserved by independent reviewer. Final candidate requires a new exact-SHA review. The first full build caught an exact JSX materializer anchor; prop order is corrected while preserving the validator unchanged. A later build-stage Node fetch of an already pinned OCR model failed DNS; the builder will use its existing supported --model-dir with locally preserved, hash-verified model bytes. No source/font/network guard is removed.
