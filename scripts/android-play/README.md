# Android store release

The terminal canonical preparation step applies `release-policy.json` after all legacy patches.
The web version is independent of Android store version codes. Increment all applicable codes
before each new upload; codes are unique across phone and Wear because they share a package.
Known floors are a conservative snapshot, not a substitute for live Play validation.

| Artifact | Package | Code | Track |
| --- | --- | --- | --- |
| Mobile | com.crewcheck.app | 144100 | qa (internal testing) |
| CrewWatch | com.crewcheck.app | 144101 | wear:qa |
| Watch face (WFF 1) | com.crewcheck.watch.app | 144102 | wear:qa |

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

Every eligible push to `main` now runs the guarded internal-release job automatically.
`PLAY_SERVICE_ACCOUNT_JSON` remains the required credential gate; if it is absent, publication
fails closed with no Play changes. The publisher waits for independent CI on the exact commit to
finish, fails closed if any workflow fails, validates live Play version codes, requires the
dedicated `qa` / `wear:qa` tracks, rejects unfinished test releases, uploads only verified
bundles, sets the internal release status to `completed`, validates the Play edit, and commits it.
There is no production-track code path in the publisher.

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
