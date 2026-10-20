# Optional aircraft notification sound

The existing Settings → Notificações e concierge section offers “Som dos avisos no app”. It defaults to “Sem som adicional”. Choosing “Interfone A320 · gravação CC0” saves only a local browser preference. Selection does not play audio. “Ouvir prévia” explicitly plays the clip; the same button becomes “Parar prévia”.

This is a foreground web enhancement to the existing Pulse notice pipeline. Playback requires a visible, focused page, opted-in sound and an accepted Pulse notice. It does not create an additional notification surface. Notices never interrupt a preview, duplicate notice keys stay quiet for five minutes, and different notices cannot create a burst within eight seconds. A six-second hard stop bounds each playback. Leaving the page, hiding it, losing focus, back/forward navigation, app navigation, dismissing/clearing Pulse or disabling sound cancels current playback. Leaving Settings cancels its preview, including a pending play promise. Muting in another tab also stops playback.

OS notification tones, device permissions, Telegram, native alarm channels and any existing assets remain unchanged. No new push transport, background audio, paid provider or store release is included. Browsers may block playback; failures stay contained and preview feedback explains how to retry. Preferences fail closed if storage is unavailable. This chime is not an operational warning; the UI cautions against using it during operations.

## Provenance

- Creator: Shamrock132; source: https://freesound.org/people/Shamrock132/sounds/245851/
- Source identifies the clip as an A320 interphone recording and notes the handset click at the end. That description is the uploader’s claim, not manufacturer authentication.
- Source license verified on 2026-10-04: CC0 1.0, https://creativecommons.org/publicdomain/zero/1.0/
- Distributed file is the unmodified HQ MP3 preview, 107,690 bytes, SHA-256 ae418dc21f3aa73ee49888601db666051a2f549fbc8394b1daef280d6761c2e6.
- No trimming, synthesis or re-encoding. Final click retained. Runtime volume is 0.35; this is not a sound-pressure calibration.
- MP3 decoded successfully, mono 44.1 kHz, encoded duration 4.571429 s (source WAV duration listed as 4.526 s), nonzero samples, no NaN/Inf. Human listening was unavailable in the implementation environment, so no listening assessment is claimed.
- Full machine-readable attribution is in client/public/assets/sounds/ATTRIBUTION.json and source/license links appear in Settings.

## Validation

Run the sound regression before and after canonical preparation, then existing Pulse regressions, TypeScript and Vite. The finalizer is narrow and idempotent and runs before the canonical manual sync. The browser regression mounts the actual sound-settings component and the actual Pulse runtime with synthetic notices; it checks default/select/preview/stop/mute/unmount/back/hidden/error/reload flows and captures mobile/tablet/desktop light/dark settings screenshots. This is focused component QA, not a claim of end-to-end live notification delivery.
