# PR1023 canonical review follow-up

Preserves Claude commits9bc32dd/3ce06d6 and composes current main510555c53d9ee2abd3151ad06dbc82a2ab99fecb. Same PR/remote branch; no parallel implementation.

Confirmed failures in original prepared app: the real canonical constructor publishes DD/MM/YYYY, but the manual-key parser accepted only ISO; switching BRT to UTC/Auckland changed the saved gate identity. Card date used the device zone while departure retained the operational clock. Radar-to-weather accepted only cockpit context and discarded home-roster identity. saveRadarSnapshot emitted a gate-change notice from another leg even when the card resolver rejected that source.

The existing rosterDisplayDate adapter now provides the confirmed published civil date and explicit operational BRT fallback when no civil date is supplied. Invalid supplied dates fail closed. Manual identity, card label and both Radar cache consumers use the same civil date; cache records stamped with an incompatible old device date are rejected, not silently migrated. TTL remains6h cache,30min Radar freshness,3 days manual retention; manual cleanup uses explicit BRT. No date/time calculator or canonical parser changes.

Radar-to-weather forwards the same explicit home-roster/cockpit context; a removed program remains unavailable rather than switching to global flight. Gate notices use the same resolver as phone/watch and suppress rejected source identities/positions. Accepted real changes and unchanged-source dedupe remain intact. The existing watch producer, listeners and cadence are unchanged; no #870/#882/#824 branch imported.

Validation uses buildCanonicalRosterEvents on synthetic published11/10/2032,23:50BRT, three OS timezones, persisted manual gate and cache across timezone changes, phone/watch parity, invalid civil date, actual prepared card formatter, handoff and Home event selection with missing-event fail-closed. The actual save function is tested with stub notices for wrong flight/leg/day/not-ok/position and accepted changes/manual divergence/dedupe. Original code fails negative reproductions; corrected code passes. Typecheck and compiled build passed. Compiled mobile proofs cover320/390,light/dark,UTC/Auckland, manual save and weather handoff; no external request, provider, real notification or watch device used.

Independent final review and exact-HEAD CI required before merge. Physical-watch acceptance remains pending. Financial #1018 preserved. Global visual proportionality/alignment is a separate requested proposal, not part of this correction.

## Baseline AIMS check compatibility

CI triggered the existing AIMS app browser workflow. Its decorative-tagline assertion failed at200% on both this branch and clean main510555c5 (same line23/column222). The approved #1020 header intentionally omits this decorative subtitle at enlarged mobile font while retaining the core logo. The expectation now checks visible subtitle at100%, omitted at200%; logo, canvas clearance, exact-event detail, zoom/pan, focus and accessibility checks remain. No AIMS component or runtime changes.
