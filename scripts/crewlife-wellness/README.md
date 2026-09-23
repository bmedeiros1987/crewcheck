# CrewLife Samsung / mobile / Wear

Read-only native adapter for Samsung Health Data SDK 1.1.0: latest completed sleep and sleep score, skin temperature, daily steps/exercise totals and Energy Score. Null stays absent. No derived clinical score, fever measurement, fitness-for-duty assessment or Samsung export to servers, AI, TV or Wear.

The mobile panel reads automatically on opening, on returning to the foreground and every five minutes while visible. User-selected categories persist per account until disconnect/revocation/account change. Background updates are separately opt-in: WorkManager requests a battery-conscious update every 30 minutes, subject to Android scheduling. Only that mode retains an AES-GCM summary in noBackupFilesDir using an Android Keystore key, with a 24-hour expiry. Failed permissions clear the cache. Generation checks block stale callbacks/writes after disconnect or scope changes. Logout, expired authentication and account changes revoke app consent and cancel work.

The native channel uses WebViewCompat with exact HTTPS first-party origins and main-frame validation; there is no health JavascriptInterface. Permission prompts occur only after an explicit user action. No Health Connect permissions or write permissions.

Wear uses readable vertically stacked wellness cards with source/age, no synthetic recovery score, explicit empty/expired states and existing separate manual sharing consent. Samsung values are not automatically mirrored by the old manual consent.

## Release gate

`SAMSUNG_WELLNESS_ENABLED` defaults to false. An explicit `-PcrewcheckSamsung=true :app:assembleDebug` compiles a device-validation build. Any requested Samsung-enabled release task is rejected until partnership approval and physical validation have been reviewed and the gate deliberately revised. Default signed store builds retain manual-only behavior. No production publication is performed by this feature.

The official AAR (downloaded from Samsung Developer) is vendored only as an app dependency under native/libs, alongside the supplied open-source notice. The SDK's official usage requirements continue to apply. Java 17, Android API 29+ and Samsung Health 6.30.2+ are needed for this integration; manual app support remains API 26+.

Before public activation: register com.crewcheck.app and the actual Play app-signing SHA-256 with Samsung, receive partnership approval, validate on physical Galaxy Watch + phone, review privacy/Play declarations, then allocate unused release version codes. Never direct public users to enable developer mode.

## Validation

- Fresh checkout: node scripts/v139/apply.mjs
- node scripts/crewlife-wellness/test.mjs
- node scripts/android-play/check-sources.mjs
- npx tsc --noEmit and npx vite build
- Android CI compiles explicit Samsung debug mode plus disabled signed release bundles.
- Physical test required: partial/denied/revoked permissions, unsupported metrics, watch sync delays, process restart, background scheduling, logout, account switch, offline/error recovery, expired data and accessible round-screen layout.

Official references:
https://developer.samsung.com/health/data/overview.html
https://developer.samsung.com/health/data/process.html
https://developer.samsung.com/health/data/guide/hello-sdk/permission-request.html
https://developer.samsung.com/health/data/guide/features/data-access.html
