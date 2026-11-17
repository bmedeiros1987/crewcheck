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

## Native file transport candidate (uncompiled)

The QA-only Activity now provides an origin-scoped AndroidX WebMessage listener (main frame only), bounded JSON/base64 payload, ACTION_CREATE_DOCUMENT for explicit user-selected output and ACTION_OPEN_DOCUMENT for JSON file selection. No release bridge, storage permission, automatic destination or persisted URI grant is added. Cancellation releases pending buffers/callbacks. CSP permits Blob fetch for this bounded download conversion while still excluding WebSocket.

This implementation is pending independent review and SDK compilation. In particular, `allowContentAccess=false` remains conservative and may prevent WebView from reading a selected document URI; no reopen success is claimed. Verify cancellation, repeated taps, rotation/process death, write failure, malicious origin/frame, oversized/invalid JSON and actual app checkpoint save/reopen on the approved emulator. File I/O currently occurs on the Activity thread and must be assessed before release. No APK/install is approved by source tests. Earlier “no file transport” statements describe the previous checkpoint; source now exists, native behavior is unproven.

On the existing approved SDK builder: record checkout SHA/tree, ensure existing debug signer, run wrapper Gradle with `-I ../scripts/android-qa/checkpoint.init.gradle :app:processCheckpointQaMainManifest :app:compileCheckpointQaJavaWithJavac :app:assembleCheckpointQa` only after source review. Inspect merged manifest for exact `.qacheckpoint` package, testOnly/debuggable, only QA launcher, Internet-only permissions and no inherited receivers/services/providers. Stop on signer creation, unexpected components or production URL. This executor still has no SDK/Gradle/javac; these commands have not run here.

Review follow-up: opening captures a page generation; navigation invalidates pending callbacks/buffers, and returning a document checks the same generation and local origin. Native navigation/recreation tests remain required. CI of prior ccdce2ad has failures (P0 and Android share import), not yet diagnosed; do not attribute them to infrastructure or consider gates passed.

## CI diagnosis and local compiler evidence

For ccdce2ad: P0 runs 43950729408/43950729296 stopped at committed whitespace guard on fixture-server regression line30; reproduced locally and corrected without changing assertions. Android share run43950729774/job133592188125 stopped before receiver tests: Maven framework download returned HTTP429 four times. It is an acquisition failure, not demonstrated Android product regression or test success. Added exact-version/hash cache; SHA256 and receiver regression remain mandatory, with bounded delayed retries on cache miss. Cache is not an alternate provider or permission bypass.

Although no javac executable/SDK is installed, local Java21 includes `jdk.compiler`: `java com.sun.tools.javac.Main` successfully compiled the extracted actual URL policy using source/target17 and exercised14 cases. `--release17` is unsupported in this runtime, so this is not a Java17 API compatibility assertion. Full Activity/AndroidX/manifest/Gradle remains uncompiled. The existing GitHub share workflow has configured JDK17, Gradle8.13 and SDK36 (confirmed run logs); no dispatch was attempted and this does not authorize extra billable runs. Use an already approved SDK builder only after unresolved native gates are reviewed.

## SDK compilation preparation gate

Review of58711449 found no new static blocker to preparing compilation, not runtime clearance. The QA manifest now removes all inherited activities and aliases before declaring its own launcher, so dependency activities must not silently remain. `verify-merged-manifest.py <plain-XML-manifest>` checks package/testOnly/debuggable/backup, Internet-only permissions, exactly one QA launcher and no receiver/service/provider/alias/deep links. Its synthetic positive plus8 negative tests pass; no actual Android merged manifest has been checked.

Before any Gradle invocation, confirm the existing debug keystore file is present without reading/logging private material. Then run manifest processing and the checker before assemble; missing signer or unexpected manifest is a stop, never permission to generate a signer. Record actual Gradle task list, SDK/JDK versions and final SHA/tree. The init-script task guard is an additional check, not a replacement for this preflight.

No native compile step or dispatch has been added to the existing workflow in this checkpoint: the current absence of SDK here and unconfirmed additional Actions resource/cost budget preclude claiming a no-cost compilation. The existing share-import job is an identified SDK-capable route, not an already executed QA build. Preserve its tests, production wrapper and existing signer. Runtime HOLD still covers content URI reopen, file errors/cancel/repeat/navigation/recreation and isolation network observations.

Reviewer follow-up tightened the artifact checker: exact fully qualified QA Activity, exported launcher and expected network config are required. Checks use explicit exceptions, not Python assertions, and remain active under `python -O`. The updated synthetic suite rejects11 unsafe manifests. Actual merger output is still unavailable.

## Ephemeral QA signer handoff (current signing contract)

This section supersedes the earlier default-debug-signer instructions. The opt-in QA init script now requires `CREWCHECK_QA_EPHEMERAL_KEYSTORE`, a preexisting canonical JKS file under Java's OS temporary directory and outside the checkout. It accepts one `androiddebugkey` key entry using the standard public debug password, binds it only to `checkpointQaEphemeral`, and never generates a key or falls back to the default debug/release signer. No production signing variable is read by this init script; production Gradle files are untouched. Location/alias checks cannot prove a key's provenance: the coordinator must create a fresh QA-only key for this build, never copy a production key. No key has been created in this executor.

For the coordinator on the already-approved SDK PC, at a time that does not interrupt current use:

1. Use a disposable checkout of the reviewed HEAD, without production credentials in the build environment. Confirm installed JDK17/SDK36/build-tools35/Gradle8.13. Do not install tooling or dispatch CI to fill a missing prerequisite.
2. Create a fresh uniquely named directory under the **Java** OS temp root with owner-only access. If Windows user TEMP differs from Java `java.io.tmpdir`, use the latter. Generate the QA-only JKS there with the installed keytool (`-genkeypair -storetype JKS -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 2 -dname "CN=CrewCheck Isolated QA" -storepass android -keypass android -keystore <temporary-file>`). These are conventional debug passwords, not production credentials. Never overwrite an existing file or reuse another signer. Do not run this command until coordinating the approved build; it is documented, not executed here.
3. Set `CREWCHECK_QA_EPHEMERAL_KEYSTORE` only in that build process. From `android-wrapper`, use the opt-in init script to process the QA manifest, inspect its actual output with the checker, and only then compile/assemble. Record source/tree, SDK/JDK, APK hash/package and public signer fingerprint. Do not upload the JKS as an artifact, add it to Git, or point the release build at it.
4. No installation is authorized by successful compile. Keep HOLD until native file reopen and isolation gates are resolved. After the approved build session, unset the variable and delete only the newly created temporary signer/directory in a finally/cleanup step. This is removal of the disposable QA artifact, not a retention policy for user data. A later key will have another fingerprint; do not replace an installed test package or delete its data without separate coordination.

This executor has no operational access to the Windows SDK/emulator desktop, and no local Gradle/SDK/ADB. The handoff therefore requires the coordinator who owns that existing session. No new workflow/build cost, persistent credential or production change is introduced here. Local source checks pass; actual Gradle/JKS loading remains a native-build gate.

Independent source review found no new blocker for draft/HOLD preparation. Private-key retrieval with the debug password is now checked before configuring signing. The main Gradle project still evaluates its existing signing logic: the no-release-read claim applies only to the QA init script; the isolated build process must not receive production credential variables. Actual signer/variant/APK verification remains pending.

## Revised approved-PC prerequisites: isolated official downloads

This section supersedes the earlier prohibition on downloading missing tools. Bruno has authorized downloads for emulator tests; this is a coordinated local prerequisite installation plan, not a workflow dispatch or APK installation. Reported PC inventory: existing JDK17/SDK/ADB, missing Platform36/BuildTools35.0.0/Gradle8.13, 101GB free. These are coordinator observations, not measurements from this executor.

AGP8.11.x officially specifies Gradle8.13, BuildTools35.0.0 and JDK17. Install **only** `platforms;android-36` and `build-tools;35.0.0` into a fresh separate QA SDK root using the existing official sdkmanager with `--sdk_root`; do not run `--update` or install platform-tools/emulator/system-images/NDK/Studio/JDK again. Leave the existing emulator/ADB server, AVDs, Android Studio settings and shared SDK unchanged. No reboot, elevation, firewall/TLS changes, global PATH or permanent environment edits.

PowerShell handoff template (coordinator resolves the two existing tool paths and chooses a new unused QA directory; not executed here):

```powershell
$qaRoot = '<new-unused-QA-directory-outside-checkout>'
$qaSdkManager = '<existing-official-sdk>\cmdline-tools\<installed-version>\bin\sdkmanager.bat'
$qaSdk = Join-Path $qaRoot 'sdk'
$qaGradleHome = Join-Path $qaRoot 'gradle-cache'
# Use a separate shell/process, existing JDK17 and directories that do not already exist.
# Display/review required package licenses; do not pipe automatic yes or copy license hashes.
& $qaSdkManager --sdk_root="$qaSdk" --channel=0 "platforms;android-36" "build-tools;35.0.0"
if ($LASTEXITCODE -ne 0) { throw 'SDK prerequisites incomplete' }
& $qaSdkManager --sdk_root="$qaSdk" --list_installed
# The future Gradle process uses this root through a disposable checkout's local.properties
# (sdk.dir with forward slashes) or process-local Android SDK variables, never global settings.
```

SDK package installation requires the applicable Android SDK license. The responsible authorized operator must review/accept it or confirm valid prior acceptance; generic download authorization is not represented here as license acceptance. Preserve license notices and package.xml/source.properties within this separate root. sdkmanager obtains packages using official Google repository metadata over HTTPS; do not substitute mirrors, manually invent checksums or bypass repository verification. If missing command-line tools are discovered, stop: they were not one of the three reported missing components.

Download only the Gradle8.13 **binary** distribution from `https://services.gradle.org/distributions/gradle-8.13-bin.zip` into the QA tools directory; normal official HTTPS redirects are expected. Before extraction, require SHA256 `20f1b1176237254a6fc204d8434196fa11a4cfb387567519c61556e8710aed78`, independently listed in the official Gradle checksum reference. Use `Get-FileHash -Algorithm SHA256`; refuse mismatch. Extract into the fresh QA directory without changing the project wrapper or global PATH. Gradle Build Tool is Apache2.0; keep bundled license/NOTICE and third-party notices. No Develocity subscription, Build Scan, paid service, new account or CI minutes are required by this local plan. Local bandwidth/storage usage still exists; no statement of zero external network charge is implied.

Run the extracted `bin\gradle.bat --version` with the existing JDK17 and process-local `GRADLE_USER_HOME` pointing at the new QA cache. For build commands use `--no-daemon --max-workers=1 --console=plain`, no build scans or publishing tasks, to bound interference with the active session. Do not change the project toolchain versions. Dependencies may still require normal official Google/Maven/plugin downloads according to the existing checked-in repository configuration; package installation alone does not prove the dependency cache is complete. Stop on unexpected license, repository, proxy/certificate requirement, disk shortfall or visible resource contention. No security setting is to be weakened.

After prerequisites: fresh reviewed checkout → synthetic QA UI identity → temporary signer per prior section → process QA manifest → strict manifest checker → compile Activity/assemble. Preserve source/tree/hash and public signature evidence. No install, production connection, real account or real data is authorized until the isolation/runtime HOLD is cleared. SDK/native file transport tests remain pending; this executor still cannot operate the approved Windows desktop.

Sources checked for this revised plan:
- https://developer.android.com/tools/sdkmanager (`--sdk_root`, selected stable packages, license prompts)
- https://developer.android.com/studio/terms (SDK license/authority and royalty-free grant)
- https://developer.android.com/build/releases/agp-8-11-0-release-notes (tool version compatibility)
- https://gradle.org/release-checksums/ (8.13 binary checksum)
- https://services.gradle.org/distributions/ (official downloads)
- https://docs.gradle.org/current/userguide/licenses.md (Build Tool Apache2.0; preserve included notices)

## Review of coordinator build and deviations (17 Nov)

Coordinator reports a disposable Windows build of5726b8f9478eb8c01f3a0a815f6868d597aa96ef: manifest processing/checker, Java compilation and assemble succeeded; QA v2 signature verified; no install/runtime. Reported APK SHA256: BFDC22CB93A8F127141F8DADE9D49FA2DF885504553474EAD9E8AF9E2C70D71C. This executor has not independently opened that artifact or its manifest. The temporary key was reported deleted. These results apply only to that candidate and do not prove runtime isolation or validate later source changes.

Three deviations and current disposition:

1. AndroidX core1.15 reportedly contributed a signature-protected `com.crewcheck.app.qacheckpoint.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` definition, with no corresponding requested grant/receiver. Rather than silently allow arbitrary definitions, the QA overlay now removes all `permission`, `permission-group` and `permission-tree` definitions. The checker explicitly rejects any that survive, including this exact signature definition. Its synthetic suite now rejects15 unsafe manifests, including four definition cases. This does not modify production or AndroidX libraries. Rebuild and inspect actual merged XML; test library/runtime behavior before concluding removal is harmless. No claim of privilege escalation from the prior unused definition is made.
2. AGP reportedly auto-downloaded Platform-Tools into the separate QA SDK. Original SDK was untouched. All subsequent QA Gradle invocations, including tasks/manifest/compile, MUST include `"-Pandroid.builder.sdkDownload=false"` (quoted in PowerShell); the init script refuses app configuration without the exact false value before the Android plugin is applied. This supersedes command examples omitting that flag. It prevents the SDK auto-download option, not Maven/plugin/Gradle dependency access. Inventory the existing QA SDK and preserve it; do not delete components or change the original SDK. If another prerequisite is missing, stop and coordinate instead of enabling downloads.
3. The key directory reportedly inherited ACL entries for sandbox/local users/admins rather than the planned restricted access. Do not create another key there, alter inherited ACLs, change PC policy or move any production signer. The coordinator should inspect owner/effective access read-only (`Get-Acl`/approved equivalent) on a new, already-approved restricted directory; account for the build identity and inherited entries. Continue only when the required restriction is demonstrated. If none exists, report the directory/required access adjustment for explicit approval; do not run an ACL mutation command automatically. Key deletion was reported, but that alone proves neither prior confidentiality nor forensic erasure. No unauthorized access is established by the ACL observation.

Keep the existing APK uninstalled. A new build must use the final reviewed source, controlled temporary signer and manifest check, no production credential environment, and the download-disabled property. Afterwards record hashes/signature and remove only the disposable signer created for that session. Installation, network containment, redirects/SW/WebSocket, SAF save/reopen/cancel/error/recreation and recovery all remain HOLD. No workstation ACL, key, APK, real account, install, service or production state was changed by this review.

## Coordinator rebuild evidence: ac2d31a3

The Windows coordinator reports successful rebuild of ac2d31a3 after Bruno explicitly authorized ACL changes only on a newly created temporary directory. Reported ACL was protected with exactly one Allow entry for the compiler user's SID; no preexisting ACL was changed. The temporary signer and directory were removed and their absence checked afterwards. This executor did not operate that desktop or independently inspect the artifact/ACL.

The unquoted PowerShell property argument was initially parsed incorrectly; the init guard refused the build. Passing `"-Pandroid.builder.sdkDownload=false"` as a single quoted argument succeeded without weakening or changing the guard. Use the quoted form for every PowerShell Gradle invocation.

Reported evidence:
- Principal and final manifests passed the ac2d31a3 checker. Binary APK inspection found no permission definitions, receivers, services or providers, and only the QA Activity.
- Assemble succeeded; Java task reused valid outputs with unchanged source. This is not a fresh Java compilation claim.
- APK SHA256: `943680173A2A9C7B8A037AABE314A3F4445F442572EE14EC566915FF515E0DDB`.
- Public QA certificate SHA256: `3246e2a8f68748c0e07f5271e2997fae628d32b877a05854ad2fef3ddb92175f`. No private signing material is included.
- No automatic SDK download was observed. No install, app launch or production access was performed.

These observations improve build/manifest/signing evidence for **ac2d31a3 only**. They do not establish isolation during runtime or native save/reopen. HOLD remains for installation/runtime: verify reviewed synthetic UI identity and loopback server, network/fallback containment, SAF file delivery, cancellation/repetition/navigation/recreation and content-URI behavior on the approved emulator before considering broader QA. No merge or deployment is requested by this evidence record.

## Limited emulator runtime evidence reported by coordinator

After Bruno released the emulator for testing, coordinator reports running the previously validated **ac2d31a3** APK (SHA256 `943680173A2A9C7B8A037AABE314A3F4445F442572EE14EC566915FF515E0DDB`) on `emulator-5554`. Only the separate QA package was installed, after verifying it was absent. This executor did not operate that emulator or independently inspect the runtime capture. The tested page was a dedicated synthetic transport fixture, **not the complete CrewCheck application**, and used no real account or roster.

Observed in that bounded fixture:
- WebView refused an external fetch to `https://example.invalid`, Service Worker and WebSocket; reported CSP violation events identified `connect-src`/`worker-src`. Local API GET returned503 and POST405. These are selected requests, not a complete network audit.
- SAF saved `crewcheck-qa-roster-checkpoint.json` (212 bytes) containing only a synthetic October/November BSB/GRU/CGH fixture. Selecting it again reported `equal:true, synthetic:true` with `allowContentAccess=false` unchanged. This closes the simple synthetic read-back question for this artifact/scenario, not general checkpoint restoration or Android-version coverage.
- Cancelling the open picker then opening again worked.
- Removing the local server and restarting QA left a blank page within the QA package; no production UI was observed. A blank page alone does not prove absence of network/fallback attempts or good recovery UX.

Not exercised: rotation/process death during picker, write errors, redirects/external intents, full application startup/checkpoint semantics, broader network/fallback behavior, real accounts or physical devices. No safe-runtime-complete or backup/restoration claim is made. HOLD remains for that missing coverage and integration review; this report authorizes neither merge, deployment nor production testing.

Coordinator cleanup: stopped only the QA server and QA process, removed ADB reverse17347, left emulator at Home and Chrome intact. QA package and the synthetic JSON intentionally remain for reproduction. No real data was removed. Do not uninstall, clear data or overwrite those remaining artifacts without coordination. Earlier “no install/runtime” entries describe earlier checkpoints; they are superseded only for this specifically reported limited QA fixture run.

## Additional bounded runtime observations and next tests

Coordinator reports another synthetic-only run of the same QA host: activating `https://example.invalid/qa-navigation` left the fixture rendered with QA package focused; activating `intent://qa-probe/#Intent;scheme=qa;package=invalid.qa;end` also left QA focused without another app observed. CSP fetch/ServiceWorker/WebSocket refusals were repeated. These observations do not establish absence of every network packet, nor do they test an actual HTTP redirect chain.

The attempted lifecycle interruption is **inconclusive, not PASS**: after force-stop during ACTION_OPEN_DOCUMENT and am start, DocumentsUI remained and Android reported delivery to the current top-most instance. Clean recovery, callback invalidation and post-process-death state were not demonstrated. No real file was selected. Coordinator returned Home and stopped QA/server/reverse. UIAutomator sometimes reported an empty WebView while screenshots/logs showed the fixture; do not infer a blank screen solely from accessibility hierarchy.

Deterministic follow-up design (not implemented or executed by this documentation):

| Test | Minimal evidence | Required outcome |
| --- | --- | --- |
| Rotation while OPEN/SAVE picker is active | QA PID, Activity instance ID, page generation, request type and callback count | Old callback is cancelled at most once; no result reaches a new/stale page; fresh user action can retry |
| Process death while picker active | PID before/after, explicit task/Activity state, recreated pending state | No old buffer/result is silently delivered or written; recovery remains local and fresh action is required |
| Navigation while result returns | Generation before/after and accepted/rejected callback event | Old generation refused, no URI or payload logged |
| Synthetic provider open/write/close failures | QA-only injected provider mode and operation outcome | Truthful failure/cancellation, cleared pending state and repeat works; no real document is modified |
| HTTP redirect chain | Separate explicitly local redirect fixture and request ledger, including attempted target | Redirect to disallowed origin never produces an accepted remote response or external Activity; local recovery remains local |

Instrumentation must be QA-only, bounded metadata (event, generation, PID/instance, request kind, outcome), without URI, filename, JSON/base64, token, account or file contents. Logs are not an authorization to retain user data. A synthetic DocumentsProvider/test double must be scoped to a separate test artifact and reviewed manifest so it does not weaken the host's no-provider gate or become an exported production component. Deliberate throwing/closed streams can exercise I/O errors; never fill disk or change user-file permissions. A redirect test server must be a separate test-only fixture: preserve the ordinary fixture server's no-redirect contract.

These tests require coordinated SDK/emulator work and a reviewed new QA artifact if instrumentation/provider changes are made. They do not justify installing an unreviewed build, changing real account data, broadening permissions or treating the full app as tested. HOLD remains for lifecycle, I/O, redirects, broader network/recovery and full-application checkpoint semantics.
