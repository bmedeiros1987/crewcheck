# Planned roster owner isolation

Base: be292f81a7945c9a038d0cac95b53b8a8b421463. Independent from PR967 and the forthcoming unknown ASB/HSB salary change.

A preexisting global planned snapshot could be loaded by another account using the same browser and roster period. This is a demonstrated synthetic isolation defect; no real account incident is asserted.

The v2 snapshot key is scoped by authenticated owner using the existing financial owner/session guard. Snapshot metadata includes version, owner, period, capture time and roster fingerprint; the reader validates these before returning a baseline. Unowned v1 records are ignored without automatic migration or deletion. Visitors, signed-out/expired sessions, forged metadata and stale-session save/clear handlers cannot load or modify a reference. Clearing removes only the current owner's key; the same authenticated owner can later resume their own saved reference.

CompareRosterView resets stored reference on auth changes, expiry, planned updates and relevant cross-tab storage events. Render also rejects a stale owner/session before memoized comparisons or financeSnapshot receives the planned roster. Events reload validated storage; event detail is never trusted as a roster. No changes to auth permissions, canonical comparison rules, financial rates, APIs, transport or Home layout.

Verification: module regression uses synthetic local storage and actual clearSession/expireSession; tests owner A→B, identical periods, stale handlers, owner mismatch, corrupted schema/period/fingerprint/source/capture time, visitor and own-only clear. Real compiled app on mobile390 and desktop1440 changes synthetic accounts with the comparison component mounted: A reference and financial baseline disappear for B; forged A snapshot in B's key is rejected; B can save only its own reference; expiry clears display; returning A restores only A; clearing A preserves B. All APIs intercepted and external origins blocked. No real credentials or accounts.

Run after canonical preparation/build:
```
node scripts/regression-planned-roster-owner.mjs
node scripts/regression-planned-roster-owner-browser.cjs
```

Independent review of exact source/prepared tree and account-transition race cases is required before merge/deploy.

Independent review race correction: capture the import session and revision before parsing, fence the modal result before preserving/comparing, and require the explicit captured session in preservePlannedRosterBeforeImport. Missing session returns null. Concurrent older imports and auth/token changes invalidate the import; the existing guarded automatic reader passes its captured session. Actual Home/store AST regression covers the independent cross-owner counterproof plus parse, confirmation and concurrent-import windows.
