# Proven APZ in route failure and positioning responses

Base fcd27c12e7452b1cadf089c05ba6e523695e6b60, after #1123 was integrated. Follow-up to independent P1 discussion r4315345576. Complete isolated clone without alternates; original checkout preserved. Open PR inventory found no equivalent APZ fallback fix; #935/#938 transport reference work remains separate. Menu/hospitals work is paused.

A bound ASB can publish03:00 while the unchanged classifier startTime is08:00. The primary departure response uses publishedStart, but missing-route and distance-over250km paths still read the old presentation helper; the positioning heading also uses a classifier date label. An unexpected route exception exits without the qualified fallback.

Remove those stale presentation/date reads from the existing producer. Both fallback branches use its existing stamp(presentationDate), derived from the proven canonical epoch. A rejected route estimate follows the same unavailable-route response. No parser, classifier, source clock, published-endpoint reader, route calculation, status/owner gate or positioning policy is changed. No error details are exposed. The duplicate short APZ line in positioning is replaced by its single full date/time/origin/clock-basis line.

Synthetic baseline reproduces6failures/12cases in raw source and the real prepared server: null route, rejected route and long-distance route, each in ordinary and year-turn dates. Stale-location, past-APZ and outside-base controls already pass. The added matrix uses the actual legacy reader, canonical projection and producer; only the clock/location boundary and external route response are injected. It verifies03:00 rather than classifier08:00, full date/UTC−03, route call counts and no input mutation. The previous40cases remain.

No real route/provider query, Telegram message, paid call, data/credential/permission/service/store change, TTS work, merge or deploy. New draft requires independent review and exact-head CI. No physical Telegram or actual user's itinerary validation is claimed.
