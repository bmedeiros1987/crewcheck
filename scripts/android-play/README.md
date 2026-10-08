# Android store release

Current correction release: **14.4.11** — P0 Roster Integrity Guard / midnight APZ continuity.

The terminal canonical preparation step applies `release-policy.json` after all legacy patches.
The web version is independent of Android store version codes. Increment all applicable codes
before each new upload; codes are unique across phone and Wear because they share a package.
Known floors are a conservative snapshot, not a substitute for live Play validation.

| Artifact | Package | Code | Track |
| --- | --- | --- | --- |
| Mobile | com.crewcheck.app | 144110 | qa (internal testing) |
| CrewWatch | com.crewcheck.app | 144111 | wear:qa |
| Watch face (WFF 1) | com.crewcheck.watch.app | 144112 | wear:qa |

All target API 36. Minimum APIs remain 26/30/33. The resource-only WFF 1 face requires
Wear OS 4; the companion remains compatible with Wear OS 3. The phone and companion
retain their existing shared application ID and signing key for Data Layer compatibility.

## CrewLife and policy rejection

The Android store build excludes the Health Connect implementation and SDK, and ships
a compatibility facade that cannot request permissions, read health records or open
the provider. Its final manifest contains no health permissions, provider query or
health permission rationale activity. Manual CrewLife remains optional and local;
watch mirroring requires separate consent. Legacy cached health summaries are ignored.
Manual inputs must not be represented as sensor measurements or medical conclusions.

Existing legacy patch sources remain for canonical source compatibility; the terminal
store policy and compiled-bundle checks are authoritative for store artifacts.

## Actions and credentials

`Android signed store bundles` builds and signs three distinct AABs, validates their
actual manifests with bundletool, verifies JAR signatures and the certificate against
the existing upload keystore, and exports manifests/checksums in the verified artifact.
PRs never publish. No workflow can publish production.

The optional `publish_internal_drafts` workflow-dispatch switch is retained for compatibility,
but now releases verified bundles directly to the INTERNAL TESTING tracks only. It requires
the existing `PLAY_SERVICE_ACCOUNT_JSON` with Android Publisher API access to both packages.
Existing `CREWCHECK_*` signing secrets are reused.

Pushes to `main` may build, sign and validate artifacts, but **never publish to Google Play by themselves**.
Internal Testing publication requires an explicit `workflow_dispatch` run on `main` with the
corresponding publish input deliberately enabled. All publish inputs default to `false`.
`PLAY_SERVICE_ACCOUNT_JSON` remains a credential gate after that operator decision. The publisher
then waits for independent CI on the exact commit to finish, fails closed if any workflow fails,
validates live Play version codes, requires the dedicated `qa` / `wear:qa` tracks, rejects
unfinished test releases, uploads only verified bundles, sets the internal release status to
`completed`, validates the Play edit, and commits it. There is no production-track code path in
the publisher.

## Console follow-up

1. Compare the exported upload certificate fingerprint with App integrity in each app.
2. Resolve the old mobile open-test draft containing Wear bundles 140384/140386.
3. Use only the mobile bundle in mobile testing; use the dedicated Wear testing track
   for CrewWatch and the separate `com.crewcheck.watch.app` app for the face.
4. Update Health apps declarations to remove Health Connect data access while truthfully
   retaining any applicable manual wellness functionality. Review Data safety and privacy
   descriptions; removing HC does not mean the app has no health-related features.
5. The existing mobile 140387 production review is a separate submission, untouched here.
   Do not promote a test artifact to production without explicit authorization.

References: https://developer.android.com/health-and-fitness/health-connect/publish
and https://developers.google.com/android-publisher/tracks.

## Mobile-only release preparation (operator decision pending)

`mobile-only-internal.yml` accepts a full reviewed merge SHA and its merged PR number.
The controller checks that it is current main and requires successful existing Android and web CI on that exact main SHA, plus the
PR-only phone/watch bridge gate on the exact merged PR head. Missing CI blocks dispatch; do not start or
repeat paid builds merely to satisfy this gate without operator authorization. The
controller itself must also receive independent review before it is merged or used.

The single Gradle invocation builds only `:app:assembleRelease :app:bundleRelease`.
Both actual manifests and signatures must match package, policy and existing upload
certificate; exported evidence records checksums, source PR/SHA and controller/run IDs.
An APK signed by the upload key is NOT established as compatible with an installation
from Play App Signing. Compare its signer with the public Play app-signing certificate,
and test an in-place update retaining login/local data before distributing it as an
update. If the certificates differ, use Play-delivered testing updates or an authorized
Play-signed APK download; do not rotate keys, clear app data or change package IDs.

Before any execution, confirm with Bruno: testing track versus production, approved
source SHA/controller, versionName, one build's cost, intended APK distribution and
certificate/update evidence. This controller supports internal testing only; production
requires a separately reviewed route and explicit approval. The versionCode must be
allocated later from ALL current tracks and bundles of `com.crewcheck.app` (phone and
Wear share that namespace), never from the stale 144110 policy or an earlier run.
Allocation opens/deletes a Play edit and can invalidate another operator's edit: coordinate
first; even a build-only dispatch is not a purely read-only Play action. No code is
reserved by this patch. The target code is rechecked before publication; a race blocks.

After authorization, run once with publish=false, retain both verified artifacts/evidence,
check tester access and data-preserving update, then obtain publication approval for those
exact bytes. The current combined workflow rebuilds on a later publish=true dispatch;
therefore do not use a second dispatch to publish the already-reviewed artifacts. A
separate artifact-consumer dispatch with run/hash provenance remains required before
that two-stage procedure is executable. Do not use android.yml's three-module publisher
for a phone-only release. Watch tracks and the watch-face package remain outside this path.
