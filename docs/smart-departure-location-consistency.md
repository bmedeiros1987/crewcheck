# Smart Departure location consistency

Base: main 50e6b73b. Synthetic fixtures only; no actual location or account data used.

Verified code causes: native device time discarded by client persistence, so a stale Android fallback was stamped as current; manual/hotel text could inherit unrelated reverse-geocode coordinates; map used component origin while positioning used storage origin; parent fresh GPS capture did not notify the map; map origin survived journey/account changes; cached fix remained usable for 30 minutes.

Correction: preserve and validate native/browser observation time (75 seconds, matching existing native freshness intent) and precision (existing 180m native contract), scope cache to account, reject reverse observations, share origin with route observation, invalidate origin on context/resume/expiry, notify location consumers, scope positioning cache to account/journey/origin. Explicit refresh overrides manual origin; background observation preserves manual origin. No location means no internal route query and departure time remains unconfirmed. Existing >250km contract preserved. No HSB eligibility changes or layout/theme changes.

Validation: clean preparation from main, TypeScript, synthetic helper regression, existing route state regression. Build result recorded in PR. Physical Android verification and independent review/CI remain gates. Android bridge already supplies time, so no native changes/new APK required for this client fix on remotely hosted wrapper; a bundled/offline client needs rebuilt APK to receive updated client assets.

Library references libfile_81f7df8aaa948191aab9fe4cc8bb0868, libfile_545c36c984ac8191a36441c09ef27bae, libfile_77d9f7a752fc8191900a481de44832b0: materialization denied HTTP403 for all three; no local JPEG or pixel inspection, no bypass.

Potential conflicts: scripts/v139/apply.mjs registration and generated client/src/pages/Home.tsx. PR commits only authored patch/test/docs plus chain registration; legacy generated preparation artifacts excluded. No blocked PR publication or deployment attempted.

## Independent review follow-up

The reviewer reproduced a legacy global positioning record crossing account/origin and an async search writing its terminal status into the new context. Removed global reads/writes, required context provenance on records, captured account/event/time/origin cache identity before awaiting providers, revalidated at every terminal path and event publication, and cleared only the original request's own checking entry on cancellation. Exact prepared helper tests reproduce account/origin changes, component disposal and rejection during the pending request; no new-context negative cache or event is produced.

CI failure on ff8a3cef was an obsolete cache-key marker in regression-v14-3-34-positioning-radar-cache. Updated legacy key, distance and TTL contracts while adding executable current-helper coverage. Updated route-effects, terminal, transit and iPad-location harness dependencies; stale route evidence remains visible but does not establish a fresh flight requirement. The original Library review ZIP remains immutable at ff8a3cef; a new package is required for the follow-up SHA.

Browser follow-up: remote Web/TypeScript/server CI succeeded on 12f84687; Maps job's remaining failure was its old stale-route assertion (expected previous-day flight from an observation now explicitly stale). Updated both full-app browser fixtures to assert preserved stale distance/state without a fresh flight decision, scope manual origin to the fixture account, and stamp confirmed positioning records with captured context. Both offline full-app browser tests passed locally, including terminal error cache expiry, pending/none/found, confirmed flight and nearby route. External network was blocked throughout.
