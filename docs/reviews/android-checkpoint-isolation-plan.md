# Android checkpoint isolation: proposed QA configuration

Status: design plus an unbuilt opt-in QA overlay and local source/contract tests. No APK exists from it, and passing these checks does not establish runtime isolation. Production wrapper, signing configuration, installed apps and accounts remain unchanged. Current checkpoint runtime candidate: #1347 `69f933754609a0b957959af9a0ea990a4aaa38bb` (newer documentation/scripts must retain a recorded source SHA/tree).

## Observed blockers

- The prepared production MainActivity loads `https://crewcheck.online?app=1` on entry and recovery. It also exposes native iFlight, Health, Billing and other bridges and initializes update/watch/alarm integrations. Replacing only Capacitor configuration or bundling a QA dist does not isolate these paths.
- Existing `debug` uses `.mcctest`. Its `src/debug/AndroidManifest.xml` explicitly removes MainActivity/notification/watch entrypoints and launches the MyCrewCare harness. Do not present `assembleDebug` as a complete CrewCheck/checkpoint APK.
- Checkpoint uses `requestBlobDownload`: a browser anchor pointing to a Blob URL. The production wrapper's observed download listeners belong to the iFlight portal; JSON file delivery in the main WebView is not verified. A requested download is not a saved/reopened file.
- This executor has `java` but no available ADB, Gradle or Android SDK/build tools. No install, credentials, downloads of tooling or denied CI dispatch will be used to fill that gap.

## Proposed artifact contract

| Field | Proposed value / gate |
| --- | --- |
| Artifact | `CrewCheck-checkpoint-<sourceSHA>-isolated-debug.apk`; not generated |
| Package | `com.crewcheck.app.qacheckpoint`; verify it is unused before installing |
| Variant | dedicated `checkpointQa`, implemented as opt-in source, still to compile/review; avoid inheriting the MCC source-set manifest |
| UI | exact reviewed source with `VITE_CREWCHECK_QA_CHECKPOINT=1` and recorded build identity |
| Destination | canonical `http://127.0.0.1:17347` via ADB reverse to a host server bound to loopback only |
| Entry/recovery | same local origin; failure stays offline, no production fallback |
| APIs | local synthetic responses only; `/api/*` returns controlled 503 fixtures, never forwards upstream |
| Native integrations | checkpoint file transport only; Billing, Health, location, Watch, alarms, push registration, external intents, portal/popups and update checks disabled/blocked in the QA-only overlay |
| Signing | existing debug signer only; no release secrets or newly created credentials; stop if absent |
| Permission/manifest | no new permissions; review merged manifest and disable background/native components outside checkpoint scope |
| Network | deny external navigation/resources/redirects/popups and external intents; fixture server never redirects; do not bypass TLS errors |
| HTTP exception | if needed, limited to QA loopback configuration; never enable global production cleartext or install trust roots |

This is a scoped checkpoint test host, not validation of the excluded native features. The QA-only variant/source overlay must be reviewed before build: do not patch/rewrite the production wrapper in place. The Gradle source-set and native interception implementation must still be compiled and validated on the existing SDK-capable builder. `matchingFallbacks` is dependency variant selection, not proof that the correct manifest or entrypoint was merged.

The executable design contract is `scripts/android-qa/isolation-contract.mjs`. Its local regression checks canonical origin/port, rejected public/credential-bearing/noncanonical URLs, distinct package and a separate same-origin Blob-download capability. It does not implement Android networking, the local fixture server or a native file saver. No check authorizes installation by itself.

## Builder and emulator handoff

1. Use a fresh disposable checkout, preserve lockfile, record source/tree and every QA-only overlay diff/hash. Use already configured JDK17/Gradle8.13/SDK36/build-tools35 tooling; do not install or purchase anything. Confirm tasks and the dedicated variant exist before trying `:app:assembleCheckpointQa`.
2. Verify the merged QA manifest includes the full intended MainActivity/file-picker path, has the separate application ID, is debuggable/test-only, has no unapproved permissions/active background integrations, and is neither the MCC harness nor a release package. Verify entry, recovery, subresource/redirect and native-bridge policies. Stop if any path can reach production.
3. Start the synthetic static fixture server on host loopback. It must serve the identified QA build and deny all upstream forwarding and real write/payment/message flows. Seed only a clearly synthetic local identity and October/November fixtures (BSB/GRU/CGH); never copy tokens or an existing WebView profile.
4. On the explicitly identified emulator serial, use ADB reverse for the agreed port. Confirm the package is absent; do not use replacement installation or touch `com.crewcheck.app`/`.mcctest`. Install only the reviewed test APK using the existing debug signature. Record APK SHA256, package/version, signer certificate fingerprint and manifest—not private key contents.
5. Confirm build SHA/QA origin before interaction. Exercise normal startup, forced recovery, server unavailable and external URL/intent attempts; all must remain isolated. Capture local logs without payloads/tokens and independently verify there are no production/provider requests or native side effects.
6. Test checkpoint download/cancel/repeat and Android file chooser reopening. Compare owner, selected months, source and semantic fixture contents in disposable memory. Other-account sentinels and credentials must be absent; original test storage must remain unchanged. If a file cannot be saved and reopened, stop before replacing any roster.
7. Record emulator/device version and actual results. Do not label JVM/browser/static tests as Android file delivery, physical-device validation or a backup of the existing account. Keep release/Play, real Telegram and all production data untouched.

No endpoint, fixture server, build, signer or installation was created by this plan; the preparatory native overlay below is unbuilt. No retention/consent policy or monetary cost was selected. Next dependency is an existing SDK-capable builder plus a reviewed QA-only native overlay and file transport; an existing AAB/debug-converted production APK is not a substitute.

## Primary references

- Android WebView local server/ADB reverse: https://developer.android.com/develop/ui/views/layout/webapps/access-local-server
- Android build variants/source sets: https://developer.android.com/build/build-variants
- Android network security configuration: https://developer.android.com/privacy-and-security/security-config

The references support the mechanisms, not the safety or availability of this unbuilt candidate.

## Preparatory overlay (unbuilt)

An opt-in init script now defines `checkpointQa` without editing production Gradle or Activity files: `scripts/android-qa/checkpoint.init.gradle`. Its separate Activity does not inherit the production shell or register native bridges. The QA manifest removes main launch, receivers, services, providers and inherited permissions except Internet, and limits cleartext to loopback. The existing debug signer is required; none is created by this work. These are source-level intentions pending Android compilation and merged-manifest review.

The variant source exists but is not built or runtime validated. Still absent: synthetic fixture server/CSP and network auditing, native checkpoint save/reopen transport, artifact provenance verification, and emulator evidence. No install is safe based on static checks alone. XML parsing and `regression-android-qa-native-overlay.mjs` are source checks only. No SDK, Gradle, ADB or javac is available in this executor.

Independent source review identified remaining network gates: WebView interception alone does not prove redirect, Service Worker or WebSocket containment. Block or independently validate those surfaces, with fixture-server CSP and network evidence, before using this host. The current overlay is not an isolated APK approved for installation.

## Containment fixture validation

`fixture-server.mjs` now supplies a loopback-only static host, synthetic GET API503, denied writes/foreign Host/symlink escapes, no proxy/redirect and rejected socket upgrades. Its CSP disallows workers, frames, forms and WebSocket connections; script/style resources stay local. The Activity additionally blocks Service Worker network loads and denies worker requests. This is still not Android runtime isolation proof.

Local Chromium tested the actual fixture headers: WebSocket and Service Worker failed closed; a synthetic JSON Blob was downloaded and read back. HTTP regressions verified method, Host, symlink and redirect-target refusal. No production/provider endpoint was contacted. This browser fixture is not the real checkpoint UI or Android file chooser/save transport. CI runs HTTP checks; browser checks run only when the preinstalled Playwright package is explicitly supplied.

SDK handoff remains: fresh disposable checkout of the final reviewed SHA, existing debug signer, approved JDK17/SDK36/Gradle8.13, opt-in init script from the wrapper directory, inspect merged manifest/package/signature before any install. Validate the same CSP/SW/socket/redirect cases with network observation on the specified emulator. Do not install until native file save/reopen is implemented and reviewed and all external paths are shown blocked. The current Activity still has no file transport; this is a concrete implementation blocker, not a request to use production.

Review follow-up: worker fixture is actually served with HTTP200; browser assertions require `securitypolicyviolation` events for both `worker-src` and `connect-src`. Thus the CSP attribution no longer relies only on 404/socket refusal. Android remains unvalidated.
