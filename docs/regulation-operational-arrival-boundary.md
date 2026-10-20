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

## Implemented Home boundary (isolated, not published or activated)

Home selects the final OP of regulationJourney and uses the existing private
readRadarSnapshot/validatedRadarForEvent readers. The optional operationalArrival
prop is memoized by original response object, exact canonical signature and roster
revision, so unrelated renders do not discard a selected operational mode.

Only the existing canonical getMe success can create a private browser read
capability: ok/authenticated are strictly true, the primitive confirmed identity
matches the captured owner, and session/generation remains current. No new getMe
call is added. Missing/incomplete success, identity upgrade, failure, account or
credential change cannot create admission. The existing server-verified session
expiry bounds the read horizon to at most five minutes, counted from the request
start with a monotonic clock; receipt/retry cannot renew it. This is browser read
continuity, never native/Watch authority or per-request Radar JWT attestation.
The legacy Radar route can still use Concierge fallback.

The existing fetch captures that capability and current owner/roster revision
before awaiting the response. Its existing exact occurrence, serial, auth and
source checks remain. saveRadarSnapshot registers only its original output object
before dispatching radar-updated, with the original network receipt time. A
private WeakMap binds the object and a bounded in-memory index retains it. Disk
copies can select that same original object only while exact serialized content,
capability, session and revision remain valid. Disk data, clones, fabricated
callbacks, mutated snapshots and reloads cannot mint or refresh admission.
No unscoped local roster is admitted: Home reuses alertRosterOwned.

The two normal deadlines keep the #1152 review gates. In operational mode the
exceptional hypothesis uses the same selected projection and validated reference,
never an old manual margin. Normal legal limits are not extended by delay.
The manual projection and its values remain available; there is no new fetch,
provider poll, cache migration, native authority or paid API activation.

## Hotel record wiring

Home first obtains the actual producer-selected context, then resolves that stay's
savedStayEditorEvent through the current account-scoped store and exact signature.
It requires the existing roster ownership check and current captured session,
passes the record into the unchanged optional producer argument, and observes
stay-editor-saved plus matching-account storage changes. Airport presentation,
departure and generic pickup remain ineligible as hotel APZ. Account changes
invalidate the publisher before any later saved record is read or emitted.

## Validation and remaining operational gates

regression-home-operational-admission-browser.mjs runs the actual auth, admission,
stay store, ownership, producer and View plus extracted Home fetch/save/read,
watch effect and memoized prop. Its offline browser fixtures cover forty-seven
checks including failed/incomplete getMe, forged capabilities, original receipt,
late results, auth/roster/serial fences, expiry, saved-record updates and unrelated
rerenders. Run the existing arrival/milestone/provider-projection/component and
Watch overnight/source-pipeline fixtures as well. No fixture proves native or
physical device end-to-end behavior.

Transport remains OFF. Real Sky FlightStatus entitlements, includeDeltas coverage,
current trial allowance/overage and existing server credential presence remain
unverified. No API call, credential change, Watch distribution, auth publication
or migration has occurred. The integrated candidate remains subject to independent
review and CI; #1147/#1150 security HOLD is unchanged.
