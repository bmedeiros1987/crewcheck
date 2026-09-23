# CrewLife Galaxy Watch — draft integration

This draft adds a responsive wellness panel, source-labelled observations and conservative personal activity suggestions. It does not read Samsung Health yet. The UI stays explicitly unavailable unless the complete native bridge is present. No Health Connect permissions or old caches are re-enabled.

Samsung summaries must remain in memory for the visible CrewLife session. Only explicitly selected categories may be returned. Scope changes, disconnection and unmount clear native memory and invalidate pending request IDs. Read-only access; no background reads, account linking, server/AI/TV/watch export, or operational fitness/fatigue decisions. Existing manual watch sharing retains its separate consent.

## Before implementing or enabling the native adapter

- SDK 1.1.0 was obtained from Samsung Developer and is available locally for API inspection. No SDK archive is committed here. Partnership approval and physical-device validation remain outstanding.
- Use the actual SDK APIs, not assumed bridge methods. The TypeScript bridge in this draft is a proposed app-owned contract only.
- Register `com.crewcheck.app` and the **Play app signing certificate** SHA-256 in the Samsung partnership application (not automatically the upload key).
- Receive Samsung partnership approval before public distribution. Developer mode is for development devices only.
- Guard Android below API 29; retain manual mode for existing API 26–28 users. Samsung Health 6.30.2+ and Java 17 are required by current SDK documentation.
- Validate on a physical compatible Galaxy Watch + Android phone: denied/partial/revoked permissions, unavailable device metrics, sleep sessions, same-day totals, SDK errors, origin restrictions and lifecycle cleanup.
- Confirm whether the supported watch supplies sleep score, Energy Score and skin temperature. Never synthesize them or label skin temperature as core temperature.
- Review the Play health declaration and privacy policy against the implemented collection before another release. Increment already-used Android version codes before uploading a new bundle.

The initial recommendation engine uses fresh sleep and the user's own disposition and goal. Scores and skin temperature are context only; no clinical score thresholds, intense-training clearance or fitness-for-duty decisions.

## Validation

`node scripts/v139/apply.mjs`
`node scripts/crewlife-wellness/test.mjs`
`node scripts/android-play/check-sources.mjs`
`npx tsc --noEmit`

Official references:
- https://developer.samsung.com/health/data/overview.html
- https://developer.samsung.com/health/data/process.html
- https://developer.samsung.com/codelab/health/sleep-data.html
- https://support.google.com/googleplay/android-developer/answer/12991134
