# Mobile reading and personal timezone review

Base: `72ca637642a5f7e6c1f40917bb21e1b2089f838f`.

The prepared header was fixed below the safe-area inset, leaving the top strip transparent. The fix starts the opaque header at zero and includes that inset in its padding. Its existing measured spacer still follows its actual height. The footer is measured too, so content reserve follows font size and inset rather than a fixed estimate. Menu identity, search, personalization and favorites use compact spacing with 44px targets. Favorite editing has its own row.

Agora/Próximo badges and timeline icons get explicit foreground/background pairs through the last stylesheet in the existing preparation chain. Presentation/stay/rest hues remain distinct in the light theme. No timeline identity, status, event time or calculation changes.

Notifications put BIDS controls before other preferences, collapse Auto/silence/channel explanations, and keep unconfirmed availability and no-send wording. Civil clock selectors save the same HH:mm values in 24h. Existing owner/revision/dirty/conflict guards and send state remain intact.

The folga comparison clarifies that two roster publications show a planning change, not proof of executed duty or payable compensation. File controls, date and explicit consent checkboxes stack; revoke remains a separate secondary action. No new consent, request, expiry, amount or delivery behavior.

Personal timezone selection uses the device's Intl result, the actual account base when recognized, or a searchable IANA list. Saved/manual values are preserved, including when search has no results and when switching back from the device source. Local current timezone resolution is **unavailable**: the UI explicitly uses the device fallback and never requests GPS or sends coordinates. Only the selected IANA value is saved using existing account APIs, on explicit save. A source mode is not persisted as an automatic follow-device policy. Unknown base falls back visibly. Canonical operational clocks and instants are untouched; presentation formatting uses IANA DST rules.

Pulse is present in the document notice slot and appears when its existing attention rules supply a message. Absence on a quiet screen is not proof that it was removed. Existing PR #936 already proposes the official brand asset; this PR does not duplicate that work or invent an image.

## Evidence and limits

- Nine supplied screenshots could not be materialized through the supported Library helper. Their pixels were not inspected by this author. Screen-specific findings came from the independent visual reviewer; new captures use synthetic fixtures only.
- Cold canonical preparation/build, TypeScript, notification account isolation and timezone switching, synthetic PDF consent/revoke (three TZs), and timezone/DST contracts were checked locally.
- Existing compiled-app header suite covers 320/360/390/412/430/1440, light/dark, 100/150/200%, safe-area simulation, wheel/keyboard/reduced viewport, escape/back recovery and import clearance. Menu suite also covers landscape/rotation. Pulse suite covers long notices outside the header.
- Simulated CSS insets and desktop Chromium are not a physical Android/WebView or native keyboard acceptance test. The nine original images and private user data are excluded from repository and evidence artifacts.
- Finance #1018 owns calculatePerDiem and tariff/eligibility changes; UI Home hunks are limited to PlatformPreferences and its imports. Preparation/cache #1017, Radar #1016, MCC Java, Play, providers, credentials and paid actions are outside this PR.

Draft/HOLD: independent review of the final HEAD and terminal CI are required before merge/publication. No deployment was triggered.
