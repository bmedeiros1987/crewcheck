# Field evidence — active roster sync and base-rest label

Observed 2026-08-09 around 04:46–04:51 BRT.

## Active roster divergence
A newer roster was imported through Telegram and the Concierge confirmed activation for 08/2026, including a next duty composed of LA3280 + LA3281 + LA3322 on 09/08. The already-open CrewCheck PWA/Web surface still displayed the previous active data (including LA3850 and the prior day/rest context).

Current Home.tsx hydration only calls `openActiveRoster()` when the in-memory/local bundle has no roster days. Once a device has a populated local bundle, a server-side active-roster revision activated by another channel is not automatically reconciled into the open client. This can leave Telegram/Concierge and PWA/Web on different active revisions until an explicit reload/open-active flow occurs.

Required behavior: active roster belongs to the account, not a device cache. Web/PWA/APK should compare the server active revision/fingerprint against the local revision on foreground/resume and at a conservative interval while open, then atomically replace the local bundle only when a newer/different active revision is proven. Avoid loops and do not touch the canonical parser.

## Base-rest presentation leak
The roster UI displayed the internal continuity marker `DESCANSO_BASE_CONTINUIDADE` to the user under `Descanso publicado`. Internal classification/reason codes must never be rendered as user-facing labels. The user-facing copy should be human, e.g. `Descanso na base` or `Descanso entre programações`, while retaining the internal reason only for diagnostics/tests.
