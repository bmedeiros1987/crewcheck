# Operational arrival boundary (disconnected)

This local prototype consumes no API, cache, credentials or user data. It does
not enable Cirium, FlightAware or a UI subscription. No current producer emits
the proposed `regulation-operational-arrival-v1` envelope.

## Why current radar arrival cannot be consumed

`server.mjs:normalizeFlightAwareFlight` collapses `estimated_in`, `actual_in`,
`scheduled_in` and `filed_arrival_time` into one `arrival`. This loses whether the
instant is estimated, actual or scheduled. `RADAR_PROVENANCE_FIELDS` contains no
arrival field or field-specific observation. The #1143 sequential branch does
not repair that contract. Retrieval time cannot prove source observation time.
The Cirium candidate likewise exposes a generic displayed arrival, and its
provenance builder has the same arrival gap. No provider code is duplicated here.

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

## Integration boundary

`readRegulationOperationalArrival` returns unavailable for today's RadarSnapshot.
`regulationOperationalProjection` provides an explicit alternative projection
compatible with the existing `regulationDeadlineSummary` reader. It replaces a
manual projection only when the future UI explicitly selects operational mode;
it never adds departure delay or the manual delay input. Manual mode must remain
available. No normal limit, extension allowance, composition or acclimatization
is changed. Existing reviewed-limit gates still apply.

UI wiring is deliberately pending a real authenticated, field-specific producer,
revocation/refresh lifecycle and exact final-activity linkage. No fields are added
to Home or its radar snapshot; no current source is advertised as supported.

Offline verification: `node scripts/regression-regulation-operational-arrival.mjs`.
