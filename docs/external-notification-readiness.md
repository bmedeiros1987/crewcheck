# External delivery follow-up — 2026-10-09

Isolated branch: `fix/external-notification-readiness`, based on main
`2e4b1f229c691093cc0af8ad49b19b68d2d6bf03` (main advanced while fetching).
No checkout AGENTS/SKILL files or ancestor AGENTS were present. No other checkout
was edited. No message/test call, scheduler trigger, device permission change,
credential, provider, paid activation, APK distribution or deployment was performed.

## Read-only production observation

At 06:24 UTC, GET `/api/notifications/runtime-health` reported:
- database available; interval 30 seconds;
- completed memory cycle 06:24:45.799–06:24:46.824Z;
- selected=0, sent=0, failed=0 for that cycle;
- webhook healthy, pending updates=0;
- persisted state `never_run`, all persisted timestamps/status null.

This proves the general job scheduler is executing, not that Bruno had a pending
job, a valid link, a delivery, or a healthy Android channel. `running:false` between
cycles is normal. Zero selected means no due job selected in that cycle, not an
empty global queue. Existing paid configuration was not changed or exercised.

## Verified code boundaries and fixes

Android MainActivity schedules local AlarmManager broadcasts and NotificationManager
notices. It has no FCM receiver/SDK, token enrollment/rotation/revocation or remote
sender registry. The PWA worker has no push listener/subscription/PushManager flow.
Granting Android notification permission does not create either missing transport.
A page timer and an in-app banner require a running page; installing the app does
not turn them into remote push. Local bridge `true` means queued UI-thread work,
not OS delivery. App/channel blocking, reboot, battery delay and installed APK
version remain physical unknowns. Legacy local alarm cancellation/account binding
remain unresolved; server cancellation does not cover Android/ICS copies.

The heartbeat writer binds ISO strings ending Z directly into MySQL DATETIME and
silently swallows errors. The patch uses numeric epoch parameters with
FROM_UNIXTIME, partial atomic updates, epoch read aliases and sanitized write-error
visibility. The disposable MySQL fixture reproduces the old strict-DATETIME error
and exercises the real corrected writer under +03:00. Local synthetic writer tests
pass; real MySQL result must be read from exact-head CI, not assumed.
Completed but old heartbeat is now `stale`, invalid time `unknown`, rather than
permanently healthy. No queue cadence/selection/send policy changed.

Wakeup UI checks `payload.telegramLinked` although the hardened scheduling response
has no such field; a valid registration can therefore say the user is unlinked.
The bounded canonical finalizer replaces this with the acknowledged server message
and adds a read-only current-owner readiness panel using existing `/api/alarm/scheduled`.
It clears on account change, uses current bearer, discards late responses and
refreshes on reconnection/queue changes. The API returns only boolean configuration
and canonical owner-binding readiness, not chat IDs/phone/token. Last 100 jobs are
summarized as pending, accepted, unknown, expired or cancelled. `sent` means provider
accepted, not delivered/read. No remote push or guaranteed delivery is claimed.
Saving a server job no longer implicitly requests browser notification permission.
New wakeup messages omit roster/airport/presentation details; historical pending
payloads are not rewritten. Existing paid choices and explicit test buttons are
unchanged and were not clicked. No new channel is automatically opted in.

BIDS remains separate from the 30-second queue loop. No automatic caller of the
existing BIDS scheduler endpoint is present in deployment/workflows. An external
production caller is unverified. Reading/saving BIDS intentionally does not send.
Year-end reserved cycle scheduling remains blocked until verified source instants;
`Já solicitei` continues to cancel linked pending server jobs and block their
future dispatch. No cycle reminders or invented official dates were created.

## Smallest path outside the app

For an existing opted-in, linked account, the available path is a Telegram MESSAGE
job explicitly registered in the existing server queue, current binding rechecked
at dispatch, generic concise content and expiry/dedup/cancellation controls. This
sends through Telegram, not as a CrewCheck Android push. First inspect Bruno's
current link/own pending records and installed APK/version + OS/channel status
without changing permissions. The production observations above do not identify
his individual blocker. If a link is absent, linking requires the user's own
explicit action; do not auto-link, choose a recipient or send a test.

A physical test must first coordinate recipient/content/channel with the parent.
Direct CrewCheck remote push would need a separately authorized Android receiver,
existing-or-approved sender configuration and account-bound token lifecycle; that
work is not activated under this task's credential/permission constraints.
Opening/closing BIDS additionally needs the promised official dates/timezone and
a reviewed authorized trigger. Reuse reviewed briefing work from #909/#910/#872;
no HSB/reserve, APZ, regulations or briefing defaults are changed here.

## Evidence

Synthetic actual React browser fixture: current bearer over stale cookie,
offline/reconnect, A→B isolation, late-response discard, logout, acceptance versus
delivery/unknown/expiry/cancel labels, no sends and no permission request.
Production writer fixture: zoned epoch conversion, partial updates, write failure
visible without sensitive error text. Private GET fixture: owner identity and
canonical binding, old/deleted incarnation and unauthenticated access denied.
Existing queue, BIDS and 23 browser-reminder safety cases remain passing locally.
CI runs disposable MySQL and browser/heartbeat tests before/after canonical prep.
