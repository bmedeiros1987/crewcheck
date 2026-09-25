# CrewCheck Phone Drive Lab — Mobile Core ownership

This is the phone-only extraction from PR #834, not a production integration.
Only CrewCheck Mobile Core may change this directory, the provider, the lab variant,
private-cache access or refresh policy. Peripherals owns `android-wrapper/auto/**`
and consumes only the boundary below. It must not maintain a copy of this provider.

## Existing lab boundary (unchanged)

Package `com.crewcheck.app.drivelab`; URI
`content://com.crewcheck.app.drivelab.drive/v1/snapshot`; read-only query with one
`snapshotJson` column. Signature permission, exact caller package, reciprocal signature
checks, size limit, field allow-list and original timestamps remain unchanged.
No new account, credential, raw roster or health field is exposed.

The adapter's current private watch cache and refresh broadcast are **internal Mobile
implementation details**, not Auto API. The Auto consumer must not name or access them.
This experimental adapter does NOT establish a production session/logout contract.
No production adoption before Mobile supplies identity/session-bound invalidation,
logout/account-switch acceptance and structured destinations. No APZ recomputation.

## Build

Normal `:app` builds are unchanged. Explicit lab opt-in only:

    gradle -p android-wrapper -I "$PWD/android-wrapper/mobile-core/drive-lab/init.gradle" :app:assembleDriveLab

The Auto lab workflow pins a reviewed Mobile commit with sparse checkout and passes
`-PcrewcheckMobileDriveLabRoot=<absolute directory>` to this script. Build both lab
APKs in the same runner so their existing debug certificates match. Never weaken
signature checks, substitute the Play app or change signing keys to make them connect.
The Auto workflow does not own the phone source merely because it consumes the build.

## Acceptance still required

CI compile and normal/lab manifest separation are not a security penetration test.
Keep DRAFT: instrumented unauthorized-client rejection, logout/account switching,
DHU and parked physical head-unit acceptance remain open. No merge/deploy/store upload.
