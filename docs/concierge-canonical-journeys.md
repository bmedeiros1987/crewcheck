# Concierge: complete canonical journeys

`Próxima programação` previously selected one `roster.days` entry. A flight
journey split over midnight therefore lost its continuation and ended at the
first fragment's arrival, even when the canonical client already retained both
flights under one `journeyId`. The reply formatter did not lose the second leg.

## Ownership

`client/src/lib/canonicalRoster.ts` remains the sole journey authority.
`rosterContinuity.ts`, parser, APZ rules, compliance and regulatory formulas are
unchanged. The build-time bridge compiles those exact prepared sources into disposable `server/concierge/generated/*.mjs`, recursively including relative runtime dependencies and recording source hashes. It prefers the repository's existing TypeScript compiler; minimal supported Node >=22.13.0 builds can use Node's built-in parser without a new package. General preparation-only workflows require no compiler. The existing build/start/serve scripts compile after canonical preparation. Production direct startup reads only generated JavaScript and performs no compilation or filesystem write. There is no new package or credential. Generated files must never be maintained by hand.

`server/concierge/journey-programs.mjs` groups existing canonical flight events
by `journeyId`. It does not classify new boundaries, join adjacent dates, mutate
input or save derived data. Source event IDs remain diagnostic references, never
saved stay IDs. Existing nonflight Concierge records remain independent.

The first canonical presentation is anchored to its existing departure instant.
The final debrief is used only when the group's last event owns the published
day's last leg; otherwise only final arrival is exposed and the unconfirmed
journey end is explicitly labeled. Arrival-equal fallback clocks and endpoints that cross the next canonical boundary are not accepted as proof. A debrief clock wrapping midnight requires the canonical rest/stay endpoint to prove that occurrence. No arrival +30 minute debrief is invented.

## Scope

Only next/summary schedule callsites and the Concierge regulation record input
use this projection. Existing radar, smart-departure, weather, location, hotel
and other `conciergeNextProgram` consumers are unchanged. Today/tomorrow schedule
views retain their pre-existing civil-day behavior. Regulation keeps an active overnight journey visible after the civil-date change; its labels now
separate the calculated maximum from the published program end. Its B.1 table,
assumptions and formula are unchanged; passing software tests does not validate
legal applicability or confirm the user's live active roster.

## Verification

The new regression uses synthetic identities/routes and the existing midnight
pattern: previous journey, presentation before midnight, two continuing flights
across two published dates, final debrief, and the ground interval. Controls cover
new presentation, real rest, disconnected route, two journeys in one day,
unknown debrief, independent nonflight duty, input immutability and no past
fallback. Prepared tests invoke the real schedule and regulation reply functions.
CI also compares the stripped bridge against the TypeScript test harness,
runs existing P0/Concierge regressions, full source preparation, idempotence,
TypeScript and Vite on the exact commit. No live account or operational action
is involved in these tests.
