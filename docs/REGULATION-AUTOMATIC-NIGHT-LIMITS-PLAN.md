# Automatic night limits — isolated implementation checkpoint

Base: dd20aefa0ac3402e4ece75d601f54a52cde3e730. Sole preparer: existing CrewCheck Work. Branch: fix/regulation-automatic-night-limits. This checkpoint changes no runtime and does not change the night-summary cards, reset characterization, cloud/native authentication, providers or production.

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

## Gates still to implement/run

Runtime implementation and green regression; second/third/fourth/fifth, PS/base/earlier OP, 168h/reset, incomplete/raw-normalized-serialized history, month boundary, 3 process timezones, different contractual/acclimatized zones, 30/45min postflight and tasks, operational replacement, A→B/revision/navigation; raw/prepared actual app paths and materializer idempotence; relevant engine regressions, TypeScript/build; independent exact-HEAD review, browser/Inter where officially available, CI. No merge/deploy authorization is inferred from this checkpoint.

Primary references: Law 13.475 art35§4 and art42 (current Chamber of Deputies consolidated text); existing ACT Comissários clause3.3.14, Git blob def0784b6e169b143110dc31c8e5571018ab80d2. Parent verified official RBAC117 EMD01 HTML; this executor's web read returned inaccessible, so it did not acquire or substitute a draft regulation. Sources and applicability must remain visible in final evidence.
