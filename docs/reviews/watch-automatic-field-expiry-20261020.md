# Automatic field expiry in the existing Wear v1 projection

Base: `6e2b0f0d2742488ab70f79e9cdf8905626fd74c5`. Synthetic fixtures only; no device, provider, account or store changes.

The existing projection capped validity only when the displayed gate came from Radar. A manual gate plus automatic status therefore kept the canonical snapshot lifetime, even though the status observation expired sooner. A second gap used receipt + 30 minutes instead of source observation + 30 minutes.

The field reader now retains an internal expiry alongside each validated automatic value. The Watch projection caps its existing single expiry using every automatic value it displays: schedule/primary gate, primary status, and the automatic gate in a divergence note. Manual values and the serialized Wear v1 schema are unchanged. Missing internal expiry fails closed. Registration is not currently projected into the Watch snapshot, so it does not shorten unrelated displayed content.

The new regression fails against the base with a manual gate and a status observed 25 minutes before receipt. It passes with this change, including custom gate proof, divergence, manual-only lifetime, observation expiry, missing metadata, and schema/storage preservation.

## Read-only coordination findings

The Home publish effect listens for snapshot requests, native readiness, Radar updates and manual gate changes, but not authentication changes/expiry. Its dependencies do not include account identity. Other Home auth listeners reset navigation; that does not establish Watch cache invalidation.

`CrewCheckWatchPublisher` persists `last_snapshot` in device-global SharedPreferences. `republishLast` republishes that record without account context; `sanitize` validates ordering of generated/expiry timestamps but does not require validity at the current time. `CrewCheckWatchSyncService` republishes the cache before requesting fresh WebView data. No explicit auth-triggered cache-clear path was observed. A coordinated phone/session fix must address that lifecycle; these files were not edited here.

The decorative P originates in `ComplicationText.gate` and `WatchContextSnapshot.complicationShortText`, which prepend P to the raw gate. `gateRendering` separately labels the complication PORTÃO. The main Wear activity renders the raw gate under PORTÃO. Any presentation fix must preserve legitimate raw labels such as P22 and stay in a separate Wear change, outside PR1144.
