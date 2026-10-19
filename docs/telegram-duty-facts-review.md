# Telegram factual review candidate

Base: 502bb97c6a42a27cd5daceb25b2b7679e81d5e47 (initial inventory a360eccb; profile-name merge has no bridge/menu dependency overlap). No legal threshold or operational decision is changed.

## Source contract and boundaries

The owner-only roster readers `/api/platform/rosters/active`, `/api/rosters/active` and `/api/rosters/:id` expose stored roster data. They do not return a dedicated verified duty-facts DTO. This candidate does not add or call an endpoint, change authentication or assert that these records match the Concierge snapshot.

The existing `conciergeLoadSnapshot` supplies the authorized Telegram snapshot. Its content hash identifies the roster revision; `updatedAt` is explicitly the snapshot update, not roster import time (preferences also update it). Missing timestamps remain unconfirmed. The response always states that correspondence to the active roster is unproved. Source metadata is displayed only through a closed label map; no raw filename, owner identifier or private reference is rendered.

`canonicalRoster.ts` remains the sole journey authority. The existing bridge additionally compiles `canonicalDutyMeasurement.ts` with recorded source hashes, without another rule implementation. `buildDutyFacts` consumes that measurement and independent published endpoints. It rejects missing/estimated/unknown clocks, invalid dates and conflicting duplicate boundaries. It validates explicit day-offset markers against canonical instants; it never repairs a mismatch or reduces +2 to +1. A mismatched +2 is displayed literally in Fundamento and its duration remains pending.

Only adjacent canonical groups with proved endpoints, no intersecting other activity and no reserve/standby availability produce an interval. This is a measured interval between programs, not proof of legally adequate rest or rest actually taken. Ground within a journey is never classified as rest. Legal applicability, regime, crew composition and permissions remain indeterminate; no statute is cited or newly encoded.

## UI and identity

The existing Revisar escala button and `/conformidade` use the same injected factual consumer. Main menus are unchanged. The short result contains snapshot revision/update, complete civil dates, BRT reader reference, measured duration or essential pending reasons, and the normative indeterminacy. Three records per page keep messages bounded; Anterior/Próxima página retain the revision and Fundamento/Voltar retain the selected page. Fundamento shows original clock literals, each boundary's provenance, measurement method and missing applicability inputs; Voltar/Início reuse existing navigation.

One-use owner-bound menu tickets also bind Fundamento to the content and metadata signature. A changed snapshot refreshes the summary rather than showing stale details. Linked identity is revalidated after async snapshot loading and inside the real sender's markup; an in-flight account change suppresses delivery. A private internal Symbol is removed before transport. No owner field comes from callback data, prompt or query. Existing link and access predicates remain unchanged.

## Evidence and non-goals

Synthetic fixtures only. Unit tests exercise raw and prepared canonical sources: timezone independence, +2 mismatch and complete multi-day dates, missing/estimated boundaries, duplicate/conflicting sources, intermediate availability, stale snapshot, changed revisions, owner/chat isolation and bounded output. The prepared regression evaluates the actual `processTelegramUpdate`, runtime factory, existing access predicate, compliance producer and `sendTelegramMessage`; its fetch implementation accepts only `https://transport.invalid/sendMessage` and records payloads in memory. It verifies typed/button parity, Fundamento/Voltar, one-use replay, stale content/metadata, revoked binding, groups and relink during awaits and sender markup.

The workflow preserves the prepared server, compiled bridge, source manifest and hashes for exact-HEAD independent review. No actual Telegram messages, production DB/API access, webhook/config changes, alerts, legal engine/parser edits, financial work or deployment are part of this draft.

## Independent review correction: incompatible date formats

Review reproduced an ISO input `2032-10-10` being accepted by the adapter while the canonical parser fell back to October 1, with a falsely available400-minute result. The adapter now accepts only the complete published `DD/MM/YYYY` format, validates its actual calendar day and refuses conflicting optional dayNumber/month/year components. ISO, partial and alternate unproved formats are explicitly pending before canonical projection. Nothing is normalized or written back to the source. The parser is unchanged. New raw/prepared tests cover the exact ISO counterexample, official normalized format, invalid/leap dates, month/year rollover and original/numeric date conflicts; the actual prepared Telegram handler also refuses ISO without sending day-1 clocks or a duration.
