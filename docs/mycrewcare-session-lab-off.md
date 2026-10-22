# MyCrewCare: isolated real-Profile session laboratory (OFF)

Status: synthetic test implementation, **not an enabled login integration**. Base reviewed on
2026-10-22: `342951ffa96771cb94988caf07e426d3f8b7ead9` (main). No production code, route
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

Local executor inventory on 2026-10-22: Java/Node present; no Android SDK, adb, emulator,
Gradle executable or `/dev/kvm`. All existing main workflow sources were searched; no
emulator/connectedAndroidTest instrumentation executor is configured. Do not bypass the
unavailable/blocked device environment by changing its filesystem/network permissions.

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
