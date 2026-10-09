# Saved Radar review draft

This change reads existing account-scoped saved Radar data only. It does not call providers, send messages, write roster fields, start follows or request GPS. Owner app JWT and linked private Telegram identity are required. Visitor follow lists are denied regardless of radar permission; the existing visitor shared-roster path is unchanged.

The proposed draft changes owner Concierge Radar requests from external lookup/roster mutation to saved-data lookup. It does not change the app Radar endpoint itself. This behavior change requires review and is not deployed. It is a preparatory subset of the requested any-flight lookup, not proof of an active universal live service.

The existing Radar races configured external providers (potentially billed), and its Concierge reply writes data back to roster snapshots. No cost-free live lookup was proven. This draft intercepts original Radar text before the semantic rewrite, preserving an explicit flight/date and never guessing LATAM from a bare number. Missing/ambiguous dates or airlines prompt clarification. Saved responses show source/update metadata when supplied, supplied fields only, and explicitly warn that they do not confirm live conditions.

`crewcheck_platform_flight_follows` already exists in the schema with owner/flight/date identity and last snapshot/check timestamp. Repository inspection found no existing writer/UI follow workflow. This draft can read rows already present but does not claim that the app currently saves follows. Missing data/DB returns a truthful response without provider fallback. Lookup by flight/date is scoped in SQL, not limited to the first page of followed flights. Listing is bounded to 20 records.

An existing account-owned `lastRadar` snapshot is accepted only with explicit matching operationalDate and flight identity. Legacy snapshots without occurrence dates are not treated as a match. No universal coverage is claimed.

Remaining blockers: approved cost conditions for live queries; proving provider occurrence identity consistently (currently only FlightAware gets published departure in the prepared adapter); an approved existing producer for app flight follows. No new provider/key/plan/transport or WhatsApp activation is included. Coordination leaves semantic/menu files to the bus/van task; only one append-only registration in scripts/v139/apply.mjs is shared.
