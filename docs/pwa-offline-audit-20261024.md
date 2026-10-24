# PWA offline audit and account fence — 24 October 2026

Base main `d7c43258c30320c40704d5ad72feccef8423df9b`. Mobile Core confirmed
this task as sole writer of offlineRuntime/offlineSync and specific offline tests.
No hunks in #1218/#1222, Home, SW, auth, database, financial or Concierge producers.
#1203 already tests CrewCierge offline and is preserved, not copied or superseded.

## Observed in the actual prepared application

Isolated Chromium, synthetic retained session and normalized saved roster only.
After online visit and actual stamped worker installation: disabled browser HTTP
cache, turned network offline, stopped loopback server, reloaded and opened a new
page with empty sessionStorage. All12 observed HTML/JS/CSS responses came from the
real worker with200; no application runtime errors. The own saved roster rendered.
A→B and logout/login reload showed no A roster. A new context without worker/cache
could not make its first visit offline, as expected. This is browser evidence with
retained storage, not installed iPhone/iPad/device acceptance or first-use offline.

## Confirmed account race and correction

Executing the actual bundled offlineSync functions with fake auth/database/storage
reproduced: A sync waits for saveRosterAnalysis, B signs in, then A's result writes
checksum/history/queue using B's dynamic keys, including A's roster in B history.
The correction captures raw identity+session and an in-memory auth invalidation
epoch before async work. It checks after checksum/API awaits, before retry/next
save and before local writes. Stale success AND failure abort. The old account's
queue remains for normal retry/deduplication; no B request or write is started.
A token renewal may stop the old operation conservatively and retry later.
No credential is newly persisted; existing parser/fingerprint/sorting behavior is
unchanged by this patch (canonical preparation still supplies its existing rules).
The20-case actual-source regression passes; the unmodified baseline fails with
Missing expected rejection, reproducing the missing account fence.

## Offline indication and provenance

Runtime now shows an accessible offline notice using ONLY the current authenticated
owner's existing explicit roster selection. It reads sourceFileName and a valid,
nonfuture updatedAt without restoring anything or writing a date. Missing/legacy
metadata says "data não registrada". Logout/owner change hides prior provenance.
Online removes the notice. No Home or canonical roster writer is changed.
Current main's saved selections often have no persistent date: this patch reports
that honestly; adding capture metadata to the actual writer needs the appropriate
owner/handoff, and must never timestamp an old cache on read.
Weather/status live updates, remote AI and outbound delivery require connection.
This does not disable any independently supported deterministic local Concierge
reader. It does not activate an online model or queue messages.

## Unresolved SW privacy gate — handoff #825 required

The actual SW caches a synthetic authenticated GET outside /api/ despite response
Cache-Control:no-store. The runtime cache retained BOTH the fake request's
Authorization header and PRIVATE_RUNTIME_CANARY response. After switching A→B
and going offline, B could fetch that cached canary. API/auth responses were not
cached. This proves the broad worker caching policy, not that a particular real
production endpoint has been exploited; no real credentials/data were accessed.

Mobile Core explicitly reserves client/public/sw.js to the existing #825 shared-PDF
writer. This patch DOES NOT edit SW, delete caches or introduce another worker.
Requested handoff: restrict cache admission/lookup to public build assets, refuse
credentialed/private responses, and handle unsafe legacy runtime entries without
wiping shared-PDF/push/roster state. Coordinate old-worker coexistence. Until that
fix is reviewed and accepted, global PWA privacy readiness remains HOLD.

## Reproduction and validation

- `node scripts/regression-pwa-offline-account-fence.mjs`:20 cases with actual
  bundled functions, fake API/storage; no real network or message.
- `node scripts/regression-p1-offline-history-identity-scope.mjs`:existing legacy
  ownerless/history-scope contract PASS.
- TypeScript raw/prepared and full canonical `npm run build` PASS locally. Sandbox
  DNS failed for OCR assets; authorized retry used the existing preparer and hash
  verification unchanged, not a Vite-only substitute.
- Candidate full-App browser offline reload/new-tab/account/logout and notice
  assertions PASS locally. SW canary leak remains RED as above.
- Optional standalone audit:
  `MENU_PLAYWRIGHT_PACKAGE=<existing-playwright-package.json> PWA_EXPECT_OFFLINE_STATUS=1 node scripts/audit-pwa-offline-cold-browser.mjs`
  after full build; optional PLAYWRIGHT_CHROMIUM_EXECUTABLE selects an existing
  runner binary. It uses only a disposable profile/loopback/synthetic accounts and
  produces JSON/screenshot evidence. It exits1 while the SW privacy canary leaks,
  rather than falsely passing privacy. It does not install a browser/dependency.

The existing P0 offline workflow is extended for the focused account/provenance
regression, using existing dependencies and contents:read. Browser audit is
separate and intentionally not advertised as a green privacy check. Exact-head CI
and independent review remain integration gates. No merge, deploy, production data,
account setting, credentials, permission, paid service, message or Store change.
