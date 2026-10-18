# CrewWatch temporal context and cache redraw

Base reviewed: ba11d921a75c1f5a91f66d290684899309b03163. Original checkout untouched; isolated branch fix/watch-temporal-sync-20261018.

Confirmed defects: watchContext interpreted published APZ with device setHours and formatted canonical instants without a zone; APZ arrival alone produced BOARDING. Wear observed neither secure-cache changes nor expiry while foreground/AOD; schedule rows continued displaying stale gates.

The existing canonicalRoster.dateAt contract is published BRT (UTC−03), including international legs. This patch preserves that clock, explicitly labels BRT and dates, rejects zone-less canonical instants, and never treats airport-local or device time as the published clock. It does not revise the roster import contract. APZ dates are resolved relative to canonical STD, including the preceding date at midnight. Airport mapping is used only to prove a conservative domestic subset, not to reinterpret canonical clocks.

Proposed highlight window: three hours before published APZ, or canonical STD if APZ absent. This is a UI window, not an operational rule. A canonical rest interval currently in force retains Folga until its end, even when tomorrow's APZ enters this window. Outside the window show dated future programming; absence of programming alone does not prove Folga. Missing APZ never becomes STD. Schedule end, focus boundary, rest end and route-cache expiry bound snapshot validity.

Bruno's domestic reference: estimated boarding = scheduled departure minus40 minutes, never APZ minus40. Emit only for distinct airports both resolved by the existing reviewed Brazilian airport map, with a published departure clock. Label Embarque previsto. International/unknown airport: no boardingTime estimate. Neither APZ, estimated boarding nor STD alone proves BOARDING or IN_FLIGHT. No international60-minute rule was adopted. Base APZ remains the published roster value; no hotel APZ/pickup is derived or populated. MyCrewCare OFF/missing data remains missing.

Existing Radar/manual gate decision and TTL remain in nextFlightWatch; no new API, polling or paid requests. Gate enrichment preserves future date/zone and does not promote future flights to currentFlight. No validated estimated/actual departure is transported by the current snapshot adapter; it stays scheduled. Adding that requires a separate source-matched contract, not interpreting a status string as proof.

Composition: reviewed1044 HEAD351ef0d949d806c073f22fe0615d72a90e2e8df0 MainActivity layout plus WatchViewport and its tests; selective836 HEAD09daf49d462c4304c0d0dd226d5b1373036c84c6 secure-cache listener and foreground/AOD expiry redraw. No historical merge/cherry-pick. No836 background requests, syncCrewLife or health changes. No Face work. Robolectric dependency/test resource flag are the1044 test slice. Existing tests preserved; stale schedule and reporting date/boarding tests added.

Independent read-only review found and revalidated fixes for folga at midnight, lost next-flight date, REPORTING hiding temporal detail and stale schedule rows. No further blocker on re-review. No physical-layout claim.

Offline evidence: actual producer temporal regression passes UTC, America/Sao_Paulo and Pacific/Auckland; covers midnight, tomorrow, active folga, missing APZ, unknown instant zone, international/unknown route, expired event, next leg, route departure. Existing next-flight-gate regression passes all three zones, including delayed-flight selection and Radar/manual TTL negatives. Actual Home publisher cadence regression passes; consolidated contracts pass; tsc --noEmit and Vite build pass (existing chunk-size warning).

Local Wear Gradle build/lint/unit suite remain UNVERIFIED: attempts with existing JDK17/Gradle8.13/SDK, offline, produced no output; even isolated Gradle --version timed out after15seconds. Attempts terminated. No signing certificate touched, app installed/deleted, new permission, Play publication, location or real health data. PR CI must establish Android evidence. Physical Galaxy Watch4 pairing, gate push while open/AOD, expiry while offline, scroll/font layout and release-package pairing remain pending. Debug phone.mcctest and Wear debug do not prove release pairing.

HealthSync: inventory only, no collection, activation or Companion edits. Phone/Wear package com.crewcheck.app; Face com.crewcheck.watch.app (com.crewcheck.face is namespace).
