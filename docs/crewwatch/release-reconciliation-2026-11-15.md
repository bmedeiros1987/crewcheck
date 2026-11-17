# Android and Wear release reconciliation — 2026-11-15

This is a release checklist, not evidence of Play approval or physical-device validation. Security, roster integrity and financial correctness remain P0; Android/Wear delivery is P1. No new release pipeline or writer is introduced.

## Existing candidates and ownership

- Work #1336: `6aadc367737d7e70fb82c436e6443fe00941afdd`, main base `96ac7558cfb127dd1614ea1fd852dd927d183df7`. Dependency-chain fix; ready, not merged when checked.
- Signed test run `43494746397` passed on that exact SHA. Its mobile AAB code `144158` cannot be reused: it was already observed in internal testing. Build does not imply upload, approval or availability.
- Work #1335 owns confirmed hotel-departure projection and occurrence-bound gate display. Its departure/time/identity changes must survive composition.
- Existing #1184 (`0ba11884904dab060b465188d36ce557bf28174d`) contains compact-stay/navigation changes and the scroll indicator correction. Its old base has four textual conflicts against main/#1335. In particular, its `MODE_STAY = 4` collides with the current `MODE_GATE = 4`; do not copy the whole activity or resolve by dropping gate/navigation behavior.
- Only the independent three-line ScrollView setting is reused in #1335 here: enabled vertical indicator, inside overlay, fading. The rest of #1184 remains separate, unintegrated work. No cloud/FCM, account, provider, permission, snapshot or gate-validity behavior changes.

## Evidence required before version allocation

1. Read all live package/track version codes and all preexisting drafts using the existing authorized Play access. The current executor has no Play Console session or Play-specific connector. This step is pending, not an authorization denial.
2. Preserve internal/open/production drafts and their owners. Do not overwrite an unnamed draft, remove retained artifacts, or submit unrelated store/health/Wear changes to move one asset.
3. Historical coordinator observations (not reconfirmed live here): mobile internal `144158` active; open-testing draft uses `144159`; production pending `144153`, published `140319`; Wear internal `144155`, rejected production `144101`. At least `144159` was already used. A code above that observed floor is not automatically free.
4. Mobile and Wear share package `com.crewcheck.app`; reconcile the shared version-code namespace across all tracks/artifacts before choosing a fresh code. Watch-face package/track is separate. Do not silently enable the existing guarded shared-package allocator.
5. Freeze the exact composed SHA/tree/lock, versionName/code, package, artifact hash, signing-certificate match and destination track. AAB is the store bundle; an APK/debug build is separate test evidence.

## Policy and validation gates

- Integrate/review the exact security fix and all intended runtime corrections; old CI is historical after composition.
- Wear: scrollbar/scroll affordance, black background, readable round/square layout and large font, accurate tile/complication store description, accessible touch/navigation, stale/offline/account boundaries. ScrollView flags alone do not prove Play compliance.
- Health: reconcile actual features, all retained active versions, manifest/dependencies, declaration, data safety and privacy policy. Excluding Health Connect does not establish that the app has no health features. Do not add permissions or remove advertised features just to pass a declaration.
- Verify actual final artifact target API 36, signatures and packages through the existing validator. The previous passing artifact cannot certify a new version code or composed SHA.
- Run existing Wear Robolectric/layout tests and lint through the normal PR validation path; no workflow or gate weakening. Local Gradle/Android SDK/adb are unavailable in this executor; new native tests remain pending until CI succeeds.
- Physical validation on the intended phone/watch: install/update, scrolling on supported shapes/font scales, complication/tile navigation, confirmed van versus airport APZ, gate occurrence/expiry, foreground/background/offline/reconnection and account change. Do not present debug/Node/browser results as device evidence.
- Only after all gates and separate upload authorization are satisfied: use the existing track, verify processing/review status, then verify the version actually available. No publication is performed by this change.

## Preserved blockers

The coordinator last observed 14 mixed pending changes and seven policy issues; separation of that batch was not demonstrated. These are historical observations requiring Console reconfirmation. Do not retry the denied Actions dispatch, switch credentials, create services/costs, or submit the old batch as a shortcut. PDF #1340 remains under its own audit/HOLD.

## Reconciliation on 2026-11-17

Main `2162b6d0f166a0c5ae4f533e8299b6fb12dae874` already includes #1336 and the build-only version-code preparation in #1351. The #1335 composition merges this main without textual conflict; all nine original #1335 paths were unchanged on main since its historical base. It retains the hotel/occurrence/gate implementation and the three independent scrollbar settings rather than importing the conflicting #1184 mode/navigation changes.

The current policy proposes mobile `144160`, Wear `144161` and separate-package watch face `144112`, target API 36. These are not live allocations. Official main build `44080719233` passed, with combined artifact `14327012014` (ZIP SHA-256 `03a1e8674bdf01936a6a4a2b971f84628d21da8f1a93eff5104eb757945d3f1a`); Play client installation, allocation and publication were skipped. This artifact predates the #1335 composition and cannot certify its future release.

Existing Robolectric round-screen assertions remain. Added non-round 192×192, 227×227 and 192×240 dp cases at font scales 1/1.5/2 check the real TextViews, black ScrollView background, indicator settings, complete navigation labels and reachable final navigation row. Separate cases check the non-round ambient text budget and untruncated clock. They are pending execution in the existing native CI, not locally approved or physical-watch evidence; gesture, rotary and device ambient lifecycle still require runtime validation. No Android SDK, Gradle or adb is configured in this executor; no native result is inferred from Node checks.

Read-only source review finds that the principal Play variant excludes Health Connect and uses its manual bridge, while health-related features still exist. Old policy reports refer to package 140382 in open testing and Wear 144101; their resolution still requires reconciling retained tracks and the truthful health/store declarations. Companion automation claims also need specific availability/consent evidence. No health permission, feature, legal text or store field was removed or broadened here.

This executor currently has no authenticated Console/desktop capability. The fresh combined archive is available through the authorized GitHub connector but its file-download host is outside this executor's enforced allowlist; no unsupported transfer route was used. The Console's current upload certificate, complete code inventory and ownership/scope of the pending mixed changes remain unverified. Keep submission, real phone/watch validation and publication on HOLD until those gates are satisfied through existing authorized access.
