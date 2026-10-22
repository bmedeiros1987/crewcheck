# MyCrewCare: isolated real-Profile session laboratory (OFF)

Status: synthetic test implementation, **not an enabled login integration**. Base reviewed on
2026-10-22: `342951ffa96771cb94988caf07e426d3f8b7ead9` (original base). Before the
instrumentation-job addition, main `8ed931d1899d84b03276fc0b09c7913abd209523` was
rechecked: its 12 weather paths do not overlap this lab. Continue existing draft #1196,
not a competing branch or the historical debug work. No production code, route
allowlist, bridge, session grant, credential, CrewCheck app manifest or release flag changes.
The historical #1027/#1035 branches remain untouched.

## What changed and why

The old `RedirectInstrumentation.java` created a plain WebView and used the global
CookieManager. That could test a browser redirect but could not establish the real
CrewCheck profile's isolation, retention or asynchronous cleanup.

The isolated Gradle project in `scripts/fixtures/mycrewcare-sso-contract` now compiles
**the original** `android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckMyCrewCareProfile.java`
through a narrowly enumerated source set. There is no copied/forked Profile implementation.
Its build-time SHA-256 is pinned and verified before compilation:

`312dafaa37429c5b509d5098e83ac331d2333530e6199f618fca9e3d01894ec6`

The source is unchanged from main `abe11a0c` and current base `342951ff`, blob
`cce6de87e5c733be87d7dfacfd9f8f1dac83d04b`. The existing fixture was derived from
main's blob `51c822446d6fb03fca3745cdb6a06e1a9b5899be`, not from the old debug PR.
The inactive sanitized SSO classifier/patch remain unmodified and are not compiled in the lab.

The lab reuses existing AGP 8.11.1, Android SDK 36, Java 17 and AndroidX WebKit 1.17.1.
Its application ID is `lab.mcc.syntheticprofile`; only its non-exported LabActivity,
instrumentation, two lab helpers and original Profile enter the build. It is not part
of `android-wrapper/settings.gradle`, has no launcher/deep link and disables the release
variant. It has no store/signing/publishing configuration.

## Instrumentation assertions (implemented; execution still required)

The server binds `127.0.0.1` on an ephemeral port. Inputs are fixed synthetic literals,
including account A/B and cookie `fixture=A/B`; there is no provider URL, token, user
account or real login. Cookie evidence comes from actual HTTP requests, never from
exporting/injecting CookieManager state.

1. `profiles.create(activity, A)` performs GET -> HTML form POST -> HTTP 302 -> GET.
   The server checks the exact synthetic POST body and an empty redirected GET body.
2. Destroy/recreate the WebView with A; the next HTTP request must retain A's cookie.
3. Create B; its first request must not carry A. Seed B through HTTP and observe B's own cookie.
4. Browser-owned 307 and 308 redirects must retain POST and its body. `loadUrl` is used
   only for the initial GET of each scenario, never to replay callbacks or POSTs.
5. Destroy A; invoke **real** `profiles.clear(activity, A, callback)` and await success.
   Recreate A and observe no cookie; recreate B and observe B intact.
6. The initial view has a synthetic sessionStorage marker. Recreated A and independent B
   must not inherit it. Nothing copies sessionStorage or assumes cookie persistence implies it.
7. Real delayed WebView completion and real Profile cleanup callbacks arrive after the
   lab result latch is cancelled/timed out. They must not publish success.
8. All views are destroyed and both real cleanup callbacks finish before PASS. Cleanup
   attempts every view/profile even after another cleanup fails. Errors, extra requests,
   incomplete exchanges or late server failures prevent PASS. Unsupported multi-profile
   WebView features fail, never silently skip as PASS.

`LabTerminalGate` is a **laboratory result latch**, not the production login controller.
These negatives do not establish cancellation/timeout correctness of the production MCC UI.
They establish that this lab cannot report successful evidence after its own cancellation,
timeout or failed cleanup.

## Checks available now versus missing evidence

Run the host checks:

```sh
node --test scripts/regression-mycrewcare-session-lab.mjs
```

This compiles/runs the actual HTTP peer/result latch with Java and performs 25 assertions.
Two mutation controls prove the harness rejects premature success without cleanup and
removal of the HTTP cookie comparison. Static build-boundary checks pin the original
source and source-set contents. **None of these are Android/WebView/Profile execution.**

The existing MCC workflow now also runs these tests before/after canonical preparation
and compiles the isolated lab with:

```sh
gradle -p scripts/fixtures/mycrewcare-sso-contract --no-daemon --console=plain \
  compileDebugJavaWithJavac processDebugManifest
```

That step generates no APK, does not install, and does not run instrumentation. Existing
CI permissions remain `contents: read`; no new service, runner class, secret, security grant
or paid device-test provider is introduced. A green compilation is not a login/session pass.

Evidence for the original head `0898d24a8c5ce7f3da5742b986e49ba2f69f77c3`:
[MCC CI run 39779389902](https://github.com/bmedeiros1987/crewcheck/actions/runs/39779389902)
compiled the hash-verified lab and CrewCheck debug/release successfully. That run did
**not** assemble/install an APK or execute instrumentation. It cannot approve a newer head.

Local executor inventory on 2026-10-22: Java/Node present; no Android SDK, adb, emulator,
Gradle executable or `/dev/kvm`. All existing main workflow sources were searched; no
emulator/connectedAndroidTest instrumentation executor was configured before this addition. Do not bypass the
unavailable/blocked device environment by changing its filesystem/network permissions.

## Disposable public-runner instrumentation job

The same workflow adds `synthetic-instrumentation`, dependent on the existing validation
job, for public-repository PRs only, on standard `ubuntu-24.04` (not a larger/self-hosted
runner). GitHub documents standard public-repository runner usage as free. There are no
new secrets/permissions, paid device services, cache uploads or artifact uploads. Checkout
does not persist credentials; Gradle's action cache is disabled for this job. Its output
is small text evidence, not an APK download or a release.

`run-instrumentation.sh` checks the already installed official Android SDK tools and
already accepted license inventory. It checks unprivileged user/network namespaces and
existing KVM access **before** dependency downloads. No sudo, device chmod/chown, host
firewall, AppArmor, sysctl or permission workaround is permitted. Any denial is terminal,
not a retry with stronger privileges and not a green skip.

The existing SDK manager requests stable `emulator` and
`system-images;android-36;google_apis;x86_64` with stdin at EOF. A new agreement is refused;
license files must be byte-identical before/after, and missing packages block execution.
No Play Store image, account, APK sideloaded WebView or separate provider is introduced.
The image's shipped WebView must actually support both required Profile features; an old
or incompatible WebView fails. It is not upgraded through a new account or service.
Gradle SDK auto-download is disabled. The image/downloads are setup only, not a login.

For the runtime, a **new process-local network namespace** has only loopback and no
IPv4/IPv6 egress routes. The emulator and its dedicated ADB server both start inside it.
The fixture's HTTP server is Android loopback; even platform/WebView background traffic
has no host egress path. No host security configuration is weakened. If the stock runner
cannot create this isolation with its existing rights, stop. This does not authorize a
retry around the separately denied local browser sandbox.

The AVD is fresh/wiped, no snapshots, no real account or device. Only
`lab.mcc.syntheticprofile` is installed, with a fixed emulator serial and an isolated ADB
socket. Standard debug signing/ADB material is ephemeral under the job's temporary home;
it gives no persistent account/real-device access and is never uploaded/cached. Traps
uninstall the lab, terminate the emulator/ADB and delete the AVD, temporary home, build
and Gradle files on success or failure. Abrupt runner teardown also discards the VM.

`verify-instrumentation.mjs` requires process success, exactly one successful
`INSTRUMENTATION_CODE: -1`, the exact Profile hash, WebView/API metadata, PASSED terminal,
and every metric PASS. Missing output, unsupported features, timeout, duplicate result,
partial cleanup or any FAIL/NOT_EXECUTED metric cannot become PASS. Only allowlisted small
result values are printed; raw browser/HTTP/ADB logs and temporary keys are not published.

**Execution status at source-review time: NOT_EXECUTED.** This job is a reviewed attempt
path, not proof it has run. Record the exact subsequent commit/run/job and terminal result
in the PR evidence before changing that status. A preflight refusal is an infrastructure
blocker with Android metrics NOT_EXECUTED, not a failed real login and not a session pass.

## Acceptance metrics: laboratory versus actual MyCrewCare

Each emitted lab metric starts NOT_EXECUTED, becomes FAIL when attempted, and PASS only
after its concrete assertion. No approximate score or a successful build substitutes it.

| Metric | Synthetic PASS criterion | Real MyCrewCare status |
| --- | --- | --- |
| `redirect302` | Actual browser form POST -> HTTP 302 -> GET, exact body only on POST | NOT_EXECUTED: no real SAML/MFA chain |
| `redirect307`, `redirect308` | Actual browser retains POST method/body, without `loadUrl` replay | NOT_EXECUTED: provider methods/redirect contract missing |
| `continuityA` | Destroy/recreate original Profile A WebView; HTTP observes A cookie | NOT_EXECUTED: no authenticated provider session |
| `isolationB` | Independent B starts without A and only observes its own synthetic cookie | NOT_EXECUTED: no real identity/account switching |
| `clearAOnly` | Real clear(A) callback succeeds; recreated A empty and B intact | NOT_EXECUTED: no real exit/logout/revocation proof |
| `viewStorage` | Initial marker exists; recreated A/B and cleared A do not inherit it | NOT_EXECUTED: no presumption provider state is cookie-only |
| `cancelLate`, `timeoutLate` | Delayed actual WebView/clear callbacks cannot publish through the lab latch | NOT_EXECUTED: production UI/controller not exercised |
| `finalCleanup` | Every view destroyed, both real profile callbacks succeed before result | NOT_EXECUTED: no retention/privacy guarantee for real provider data |

Bounds are lab failure deadlines, not an invented provider performance SLA: navigation
15 seconds, JavaScript callback 5 seconds, profile cleanup 10 seconds, suite 120 seconds;
CI boot 300 seconds and instrumentation process 180 seconds. Unsupported feature/timeouts
fail closed. Evidence preserves exact Android API/WebView version and source hash.

Actual-login acceptance additionally requires an approved exact SSO route/method contract,
user-completed login/MFA solely on the official provider page (never credentials in chat),
correct authenticated identity and arrival at reservations, safe cancellation/expiration,
and verified cleanup consistent with the user's no-user-data-retention requirement. No
new persistent grant/OAuth permission, route wildcard or production toggle is implied.
All actual-login/reservation acceptance remains **NOT_EXECUTED** by this lab. No import,
hotel/transport/APZ correctness or release-ready claim follows from a synthetic PASS.

## Reproducible device execution, only when an authorized executor exists

Required: a disposable Android executor already provisioned with no real accounts,
API 26+ (prefer 36), compatible multi-profile WebView and functional adb. Its network
must already be isolated to loopback for the test. The fixture emits only loopback HTTP,
but WebView/platform internals can have their own background traffic. The lab's
cleartext network-security-config and CSP are **not a universal HTTPS egress firewall**.
Do not relax an environment's security or provision paid infrastructure to run this test.

Once that executor is explicitly available and authorized, build only the lab:

```sh
gradle -p scripts/fixtures/mycrewcare-sso-contract --no-daemon assembleDebug
adb -s <disposable-executor> install -r scripts/fixtures/mycrewcare-sso-contract/build/outputs/apk/debug/mycrewcare-synthetic-profile-lab-debug.apk
adb -s <disposable-executor> shell am instrument -w lab.mcc.syntheticprofile/lab.mcc.RedirectInstrumentation
adb -s <disposable-executor> uninstall lab.mcc.syntheticprofile
```

Do not install into the user's real CrewCheck/device. Preserve only reviewed source SHA,
Android API, WebView version and the small instrumentation result bundle (PASS/FAIL,
stage, terminal state and assertion count). Both result text and instrumentation code
must indicate success; a process exit or build alone is insufficient. Uninstall the
synthetic package after evidence collection even if the test failed.

## Still outside the result

Even a future instrumented PASS establishes only synthetic browser/Profile mechanics
on that Android/WebView version. It does not establish SAML/MFA/provider support,
provider TLS/subresource policy, cross-process/reboot session retention, real identity,
acquisition/import, or correctness of hotel/transport occurrence/date/timezone mapping.
The provider's sanitized static tenant/partner/endpoints/methods contract remains missing.
No SSO route or operational import is enabled by this laboratory.

References: [AndroidX Profile](https://developer.android.com/reference/androidx/webkit/Profile),
[WebViewBuilder](https://developer.android.com/reference/androidx/webkit/WebViewBuilder),
[WebViewClient](https://developer.android.com/reference/android/webkit/WebViewClient).

Runner/setup references: [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions),
[Ubuntu 24.04 runner inventory](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md),
[Android sdkmanager](https://developer.android.com/tools/sdkmanager),
[Android avdmanager](https://developer.android.com/tools/avdmanager),
[Android Emulator command line](https://developer.android.com/studio/run/emulator-commandline),
[unshare manual](https://man7.org/linux/man-pages/man1/unshare.1.html).
