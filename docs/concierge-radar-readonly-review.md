# Saved Radar review draft

This change reads existing account-scoped saved Radar data only. It does not call providers, send messages, write roster fields, start follows or request GPS. Owner app JWT and linked private Telegram identity are required. Visitor follow lists are denied regardless of radar permission; the existing visitor shared-roster path is unchanged.

The proposed draft changes owner Concierge Radar requests from external lookup/roster mutation to saved-data lookup. It does not change the app Radar endpoint itself. This behavior change requires review and is not deployed. It is a preparatory subset of the requested any-flight lookup, not proof of an active universal live service.

The existing Radar races configured external providers (potentially billed), and its Concierge reply writes data back to roster snapshots. No cost-free live lookup was proven. This draft intercepts original Radar text before the semantic rewrite, preserving an explicit flight/date and never guessing LATAM from a bare number. Missing/ambiguous dates or airlines prompt clarification. Saved responses show source/update metadata when supplied, supplied fields only, and explicitly warn that they do not confirm live conditions.

`crewcheck_platform_flight_follows` already exists in the schema with owner/flight/date identity and last snapshot/check timestamp. Repository inspection found no existing writer/UI follow workflow. This draft can read rows already present but does not claim that the app currently saves follows. Missing data/DB returns a truthful response without provider fallback. Lookup by flight/date is scoped in SQL, not limited to the first page of followed flights. Listing is bounded to 20 records.

An existing account-owned `lastRadar` snapshot is accepted only with explicit matching operationalDate and flight identity. Legacy snapshots without occurrence dates are not treated as a match. No universal coverage is claimed.

Remaining blockers: approved cost conditions for live queries; proving provider occurrence identity consistently (currently only FlightAware gets published departure in the prepared adapter); an approved existing producer for app flight follows. No new provider/key/plan/transport or WhatsApp activation is included. Coordination leaves semantic/menu files to the bus/van task; only one append-only registration in scripts/v139/apply.mjs is shared.

Review corrections: the authenticated app endpoint now handles saved Radar before normalizing supplied location or saving any preferences. The prepared client uses the same pure intent matcher and sends identity/text only, before reading cached GPS or gym preferences. Telegram Radar button aliases use exact labels so flight/date arguments survive the actual process entry. Corporate bus/van gate/terminal queries do not become flight queries.

Local composition with PR938 head `6920dbcb` runs the real saved-Radar and corporate transport adapters together. Radar integration, materialized Wellhub (18 cases) and humor (6 cases) pass. The transport-only VM fixture at that head requires injecting `radarReadIntent` and `radarReadReply` for the composed client/endpoint; its unmodified harness currently raises ReferenceError. This is a test-contract coordination blocker, not permission to merge either draft.

The transport VM contract was also tested with these two imports injected **only in the disposable composed checkout**: its full actual client/endpoint suite then passes. Alternating both finalizers preserves server/client content and one instance of each adapter. PR938 itself was not modified.

The subsequent LATAM/intersites review case is covered at the actual prepared app endpoint: corporate van/bus requests with gate B12 or terminal C3 bypass Radar before any flight-row read. The standalone draft leaves these requests to the existing wrapper; the disposable PR938 composition reaches its real transport adapter with no location effects. Explicit LATAM flight status still routes to Radar. This does not incorporate transport context commit 7c3116c or depend on PR935/938.
