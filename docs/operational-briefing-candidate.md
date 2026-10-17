# Operational next-duty briefing candidate

Base: main `5ea80bdec55ab95c592139869dc9c08cfa0efb17`.

This is a disconnected server preview and event-candidate planner. It is not a live notification service. There is no startup import, timer, route, database write, queue, provider call, new permission, credential or activation. `submissionAllowed` is always false, including eligible candidates.

## Implemented slice

`server/concierge/operational-briefing.mjs` consumes the existing canonical roster engine and journey projection. The existing build bridge additionally compiles the unmodified publication-review engine; no second journey or roster-change classifier is maintained.

- The caller supplies an authenticated active-roster envelope from the primary platform DB: owner scope, id, roster_key, fingerprint, server revision and time of the current read. A read older than one minute, a future/older revision or a mismatched raw/canonical period blocks the preview. Complete parser-normalized DD/MM/YYYY dates and valid published flight clocks are required; unknown formats/missing clocks cannot borrow fallback day/hour. Equal revisions with different fingerprints and equal fingerprints with different publication-comparison content also block. Request-body metadata and the Concierge mirror are not authoritative.
- The next flight journey retains all canonical legs across midnight. Presentation equal to departure is unconfirmed. The existing projection determines whether the final endpoint is published debrief or only planned arrival. An earlier nonflight duty is explicitly unsupported in this first slice rather than silently skipped.
- Publication differences use the existing `rosterPublicationReview.ts`: IDs/order do not define changes, multiplicity is retained, ambiguous matches stay unconfirmed, and additions/removals need trusted complete-date metadata. A first observation, new owner or new month establishes a silent baseline. “Removed from this complete publication” is not a claim of flight cancellation. The current comparison engine omits dutyDebrief: a debrief-only update appears in the preview endpoint but is not classified as a publication change. `unsupportedChanges` makes this gap explicit; covering it requires a separately reviewed engine/state-version change. The future authority adapter must bind the entire roster payload to its stored fingerprint; the preview consistency gate does not independently verify raw DB payload hashes.
- Weather uses the existing official provider/station/observation-time gate from #905/#906. The adapter must supply the existing airport-to-ICAO mapping. Missing mappings, old reports, future reports and equal-time conflicting reports are unavailable. No missing data is filled in. Radar, pickup, NOTAM and operational clearances are not implemented in this slice.
- A preview expires at the earliest active-roster read deadline or supplied observation expiry. The 90-minute lead is a candidate policy default, not an activated user setting; callers may preview 15–180 minutes.
- A candidate requires separate explicit `operational-next-duty` consent, current binding/revision, consent before the window opened, the exact current roster reference and a readable durable delivery ledger. Missing consent, weather-only consent, expired previews, backfill and previously recorded event IDs are rejected. Semantically identical reimports keep the same duty/event key. No candidate is claimed or sent here.

API state: pass the preceding result's `publication` as `previousPublication`. Persisting this state, accepting it from an HTTP request, or treating `eligible` as permission to send would require integration work that is not present here. The future repository must validate durable state and atomically claim candidates, then recheck scope, binding, consent, revision and expiry immediately before transport. A failed read must never become an empty ledger.

## Existing ownership

- #906 is merged: weather consent and its held-connection lease are a reference for safety invariants, not consent for operational briefings.
- #896 is closed without merge. Its chat-specific prototype is not a production dependency or a second queue to revive implicitly.
- #872 owns Wake and pre-trip packing. Its `nextTripBriefing`/`CrewTripBriefingCard` are a different feature, and their inferred trip grouping is not copied. A future Wake consumer can use this planner's publication/event references. Do not reapply its old portal or `scripts/wake-v1/apply.mjs`.
- #907 exclusively owns MyCrewCare v2 and remains unmerged/disabled. This candidate has no dependency on it.
- #891–#894 share the chat integrator's `server/platform.mjs` surface. This candidate does not edit that file, Home, Pulse, service worker, Android, or the scheduler.

## Next implementation steps

1. Review this pure preview with raw and canonically prepared sources, including the existing journey regression. Add a strict server adapter that reads the authenticated owner's current active platform roster, not the mirrored Concierge snapshot. Multiple active rows or failed reads must block.
2. Reconcile the existing notification scheduler before connecting any operational intent. Today `scheduleJob` can rearm a sent duplicate, delivery uses a captured chat id, and claim/send do not recheck active roster/consent/link/expiry. Its phone/Infobip paths must not be inherited by this feature. Keep one scheduler/integrator; do not create a parallel queue.
3. Implement a separate operational opt-in/revocation lifecycle and durable claim/expiry/deduplication using real isolated SQL tests, current binding checks and restart/failure cases. Reuse the safety lessons from #906; weather permission does not grant this subscription. Persisted publication review needs bounded retention, account-deletion cleanup and explicit projection-version migration when canonical/comparison engines change.
4. Implement and verify the actual server-to-device delivery adapter and registration after confirming whether the user's installation is APK or PWA. Device/subscription lifecycle, account binding, token rotation, logout and revocation are required; foreground Pulse/native scheduling is not proof of background push. An existing private Telegram canary can be tested separately when its exact account/chat, content and activation are approved; it does not prove app push.
5. Verify physical delivery with explicit consent: background/locked/closed app, network recovery, logout/account switch, duplicates, revocation and expired messages. Android force-stop is not a delivery promise. Until those tests pass, this is operational assistance, not a dependable critical-flight alert channel.

No merge, deployment or real delivery is performed by this candidate. The existing server and app notification settings are untouched.

## Local verification

39 synthetic tests pass in UTC, America/Sao_Paulo and Pacific/Honolulu, after compiling the exact current canonical sources. The existing canonical Concierge journey regression also passes. Independent review found no remaining blocker in this disconnected slice. No real account, provider or database was used.

The five intended changed paths are this document, the new operational briefing module/test/workflow, and one line in the existing build bridge. Other locally materialized sources are unchanged validation dependencies and must not be added as changes. Full canonical preparation and remote exact-head CI have not run for this local candidate; the workflow describes those required gates. Prepared-source and exact-head CI remain required before integration; this candidate is not a live delivery feature.
