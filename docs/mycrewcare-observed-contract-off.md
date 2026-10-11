# Observed MyCrewCare DOM decoder, OFF

Pure observation component beside the existing v3 modules. No native acquisition, navigation, provider calls, runtime wiring, mount, feature activation or operational persistence. `MYCREWCARE_OBSERVED_RELEASE_ENABLED=false` and every parsed reservation has `operationalImportAllowed=false`. Existing v3 gates are unchanged.

Input evidence: sanitized observed contract dated 2026-10-11, Library `libfile_a0d10576bf0c81919e266afde82b853f`. All five content files match its SHA256SUMS. ZIP transfer failed; the provided texts were materialized without attributing the original ZIP hash to a reconstruction. All identity/reservation values in fixtures are invented.

The module extracts only demonstrated selectors. Reservation link IDs join one card to one detail. Hotel name, airport and both flight pairings must agree. Direct section labels distinguish the two transportation directions. Missing/duplicate/partial DOM or zero cards fails with a stable error and cannot clear existing data. Feedback query strings, welcome names, hidden fields and transport row order are not sources of identity/date/direction.

PLANNED/Planned displays Planejada, CANCELLED displays Cancelada; unknown confirmation values stay unknown and preserved. Cancelled is a behavioral translation, not evidence of a verified cancelled provider template. This component does not render a mounted panel or rewrite existing published/changed/cancelled facts. A subsequent explicitly reviewed mapping is required before planned observations can populate the existing stay surface.

Profile IDs remain strings. Before/after observations must match the bound employeeId/username and the same caller-held account/session/request IDs with an explicit fresh flag. This check prevents accidental stale/cross-account joins; these caller-provided metadata are not authentication proof. A trusted native same-session coordinator, immutable binding lifecycle, tenant scope, freshness source and account-switch validation remain unimplemented/unproven. Display name alone is rejected. No hardcoded production identity or canonical providerSubject is derived from these fields.

Hotel datetimes stay wall strings; pickups stay HH:mm with explicitPickupDate=null. TimeZone=null. No browser/cloud timezone, main-card date, check-in/out equality, transit calculation or APZ inference fills these gaps. Flight dates are not used as automatic anchors. More provider evidence or a reviewed ambiguity policy is required before conversion/import.

Run synthetic DOM tests with jsdom available via `WAKEUP_JSDOM_PACKAGE`, then existing 65 v3 tests in UTC, America/Sao_Paulo and Pacific/Auckland before/after canonical preparation. The ownership fence adds only the exact nine new decoder/test/doc/fixture paths; no existing forbidden writer is allowed.

## Prepared same-session coordinator

`createMyCrewCareObservedCoordinator` accepts an injected trusted acquisition boundary only; no default provider/native/browser implementation exists. A binding copies account/session/profile identifiers into immutable memory. Each read creates one unique request/generation and AbortSignal, acquires fresh profile-before, cards, every linked detail, then profile-after. Every page must return matching account/session/request metadata. The coordinator clones each DOM on arrival so later caller mutations cannot rewrite captured observations. Only after all joins and both identities pass can one immutable, non-importable observation be published.

Bind, cancel, disconnect and a newer read invalidate the generation and abort pending work. Late completion cannot publish or clear the new generation. Account switch tests cover all four acquisition stages. Identifiers are not persisted or logged. Global/tenant uniqueness and immutable real identity, authenticity of injected metadata, native same-session acquisition and a bounded real acquisition timeout remain unproven/unimplemented. This component prepares lifecycle mechanics only; it does not grant authentication or activation. Both release constants remain false.

CI now filters observed decoder/coordinator, fixtures and suites; jsdom22.1.0 is isolated under RUNNER_TEMP, with scripts disabled. Both observed suites execute in each of the three zones before/after preparation. Empty required values fail; nonempty unknown confirmation is preserved. The ownership allowlist adds only the two exact coordinator paths beyond the previously reviewed decoder slice.
