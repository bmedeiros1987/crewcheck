# Operational arrival boundary (disconnected)

This local prototype consumes no API, cache, credentials or user data. It does
not enable Cirium, FlightAware or a source subscription. The existing Cirium
adapter now preserves the source contract and an explicit bridge creates the
`regulation-operational-arrival-v1` envelope. Home does not yet supply admitted
data to the new optional component entrypoint.

## Why current radar arrival cannot be consumed

`server.mjs:normalizeFlightAwareFlight` collapses `estimated_in`, `actual_in`,
`scheduled_in` and `filed_arrival_time` into one `arrival`. This loses whether the
instant is estimated, actual or scheduled. `RADAR_PROVENANCE_FIELDS` contains no
arrival field or field-specific observation. The #1143 sequential branch does
not repair that contract. Retrieval time cannot prove source observation time.
The generic Cirium displayed arrival remains unsuitable. No provider is duplicated:
`normalizeCiriumFlightStatus` now adds `arrivalMilestones`, keeping scheduled,
estimated and actual gate arrival (SGA/EGA/AGA) separate from scheduled, estimated
and actual runway arrival (SRA/ERA/ARA). Every field has its own `at`, `kind`,
`milestone`, `sourceField` and `observedAt` (null without specific proof).

The locally supplied official OpenAPI FlightStatus schema specifies
`flightStatusUpdates[].updatedAt.dateUtc` and
`updatedDateFields[{field,newDateUtc}]`. The latest delta for that code must match
the current operationalTimes value. Later deletion, a changed value, contradictory
equal-time updates or an invalid observation invalidate proof. Later unrelated
status/equipment updates do not refresh arrival. Only explicit-offset UTC fields
are read. `includeDeltas` is required by the source schema; enabling that transport
option remains with the #1143 owner and is not done here.

## Proposed admitted producer contract

The pure reader requires schema, authenticated host owner scope and revision,
and exact final operated occurrence (`flight`, origin departure civil date,
origin, destination, explicit-offset scheduled departure instant). Host admission
is a prerequisite supplied independently; matching strings are not proof of
authentication. Revocation, account change or roster revision must revoke that
admission. This module neither reads auth nor grants it.

`field` must separately carry `kind: estimated|actual`,
`milestone: engine_stop|landing`, explicit-offset `at`, and its own source
provider, source field name, observation/receipt/expiry instants. Expiry is
bounded by 15 minutes from observation. Observation is never synthesized from
receipt. Gate-in and generic arrival are rejected; mapping them to engine stop
requires a producer contract and review, not a UI guess. Landing requires
explicit taxi minutes. Actual instants cannot follow source observation.

The expected occurrence must be the journey's final operated activity; earlier
flights and subsequent PS do not prove the final duty endpoint. Post-flight
minimum and additional tasks (including explicit zero) remain inputs. A valid
estimate yields estimated engine stop/duty end; actual engine stop still yields
a *projected* duty end after post-flight/tasks, not confirmed release.
Past estimates and arrivals beyond 24 hours after scheduled departure are rejected.
The latter is source plausibility, not a new legal rule. Source status C/D/NO/R/U
or unknown is rejected rather than treating a diverted/original route as current.

## Integration boundary

`readRegulationOperationalArrival` still rejects generic RadarSnapshot.arrival.
`ciriumRegulationArrivalEvidence` bridges only separately proved ERA/ARA fields,
preserving estimate/actual semantics; no gate arrival becomes engine stop.
`regulationOperationalProjection` provides an explicit alternative projection
compatible with the existing `regulationDeadlineSummary` reader. It replaces a
manual projection only when the future UI explicitly selects operational mode;
it never adds departure delay or the manual delay input. Manual mode must remain
available. No normal limit, extension allowance, composition or acclimatization
is changed. Existing reviewed-limit gates still apply.

`RegulationScenarioView` and its existing ManualRegulationView wrapper accept an
optional `operationalArrival` prop: candidate, captured auth session, host owner
scope/revision, receipt instant and host `isCurrent` admission callback. Source
and continuity fences are checked before/after the read and each second for
expiry/revocation. Capture alone does not prove login. The UI defaults to manual;
operational choice is disabled unless accepted, manual values remain preserved,
and expiry/revocation visibly returns to manual projection. Operational mode
disables the manual delay controls so that delay cannot be added twice.

## Precise pending Home handoff (proposal, not applied)

Home owns private `readRadarSnapshot(event)` and `validatedRadarForEvent(event,
snapshot)`. Its owner must select the *final operated event of regulationJourney*,
not the card's current/next leg, and read that event through those existing
readers. A current received snapshot may then be passed through the wrapper:

```tsx
<ManualRegulationView
  compliance={compliance} scheduleDay={regulationDay}
  program={regulationEvent?.canonical}
  operationalArrival={admittedArrivalOrNull}
/>
```

`admittedArrivalOrNull` must hold the validated snapshot (including arrivalMilestones,
source statusCode, own departureDate/route/scheduledDepartureUtc), the auth session
captured when that admitted response was received, concrete owner/roster revision,
and original receipt time. Its callback must prove existing authenticated host
admission plus current owner/session/roster revision and final-event identity.
Never capture a new session around an old cached payload or fabricate `true` from
a token/nonempty user record. Current private readers validate occurrence but do
not expose this full authenticated admission envelope; that is the exact remaining
handoff. No automatic fetch, polling of providers, new getMe call, cache migration
or Home change is part of this patch. Tests inject only synthetic host admission.

Provider clean/projection hunks in this shared clone preserve the new normalized
fields; the transport is still OFF and real includeDeltas coverage is unverified.

Offline verification: `node scripts/regression-regulation-operational-arrival.mjs`.
Also run `regression-cirium-arrival-milestones.mjs`,
`regression-regulation-arrival-provider-projection.mjs` and the isolated component
`regression-regulation-operational-arrival-browser.mjs` (zero external requests).
