# Android package update notice — review candidate

Base: PR1069 at deefc336f4e4c3eec8c7ea621543e717b3e7a3d2, retaining PR1068 at4c09cc4143a386a789e24169977effcf2cf683b4. Neither branch is rewritten. Mobile144157 remains the distributed notification-validation candidate; this change has no new AAB/versionCode or Play publication.

## Reused implementation

PR827 (merged8a8ada29) already added Google's app-update2.1.0 library and CrewCheckPlayUpdateCoordinator. Canonical preparation attaches it to foreground/page-ready lifecycle. It calls AppUpdateManager.getAppUpdateInfo(), emits available only for UPDATE_AVAILABLE, and caches/replays crewcheck:native-update-status. Its external Android notification remains unchanged. PR829 protects the separate PWA coordinator; neither PWA activation nor release.json determines Android package availability.

This change adds a small dismissible React notice using only that existing native result, requiring the native bridge and a valid versionCode/timestamp. It does not infer track eligibility from any public version. Availability therefore follows the Play query for the installation/account, including tester access and staged eligibility. Production users do not receive a hardcoded announcement of144157 or internal enrollment links.

“Atualizar” opens only https://play.google.com/store/apps/details?id=com.crewcheck.app through the existing external-navigation handler. It does not invoke an immediate update, auto install, completeUpdate, clear data or reload the web shell. “Mais tarde” and tapping Atualizar defer the same code for24h, including after a canceled store visit/reload. A different eligible code can show a new notice. Storage failure retains dismissal in memory. No account/token data is stored.

Signals expire after5min; invalid/current/unavailable/error/canceled/checking events, blur and offline hide the notice. Ordinary web/PWA and URL app-mode flags cannot enable it without the native bridge. The notice is not a modal and the app remains usable. Canonical preparation restores its import/mount after materialization.

## Official references

- https://developer.android.com/guide/playcore/in-app-updates/kotlin-java — official dependency and getAppUpdateInfo/UPDATE_AVAILABLE check.
- https://developer.android.com/reference/com/google/android/play/core/appupdate/AppUpdateManager — current-app availability query.
- https://developer.android.com/guide/playcore/in-app-updates/test — owning Play account, same application ID/signing key and higher versionCode required for real-device acceptance. No claim that a synthetic result proves store eligibility.

## Validation and delivery limits

Actual React browser fixture covers pre-mount native replay, available/current/unavailable/error/canceled/checking, malformed/stale/future signals, offline,5min expiry,24h deferral/reload, eligible newer code, canceling the simulated store visit, exact fixed store URL and web/PWA isolation. Layout checks at320/390/1024px include44px buttons and no horizontal overflow. All external requests are intercepted; no real Play/API/notification/purchase. Run raw and after canonical preparation. Existing native update contract, TypeScript, Vite and real Android SDK compilation also required. Independent review and exact-HEAD CI precede integration; no publication in this task.

144157 already contains the native availability provider and loads https://crewcheck.online?app=1 in its WebView. It can render this notice after the reviewed web interface is deployed and loaded, without requiring a new Android package for this frontend addition. It cannot show the new UI today before that deployment. Older installed versions need their native provider confirmed; a build lacking it first requires an official Play update. Bruno's exact currently installed code/device is not known, so do not promise it supports the signal. Installing144157 itself does not mean a newer Play package is available: no banner is expected until Play actually returns another eligible update.

Physical follow-up: on an existing authorized Play-installed account, confirm no banner when current; use an eligible higher package for a positive case; tap Mais tarde and reopen; tap Atualizar then cancel/back; confirm session/roster remain and no forced install. Test a production-only account does not announce an internal-only build. Do not publish an extra build solely to fabricate this test without review/authorization.
