# CrewCheck notification delivery — review candidate, 2026-10-08

Base/main verified through GitHub: `1f8e9efee877837605a086bc11c3887167ba4918`.
Isolated checkout/branch: task-4/crewcheck-local, `fix/push-readiness`.
No AGENTS.md or checkout SKILL.md was present; no other checkout was edited.
No provider calls, production DB reads, device permissions, secrets, paid services,
store publication, release build or deployment were used.

## What actually exists

| Surface | Existing path | Actual boundary |
| --- | --- | --- |
| Android wrapper | MainActivity JavascriptInterface → NotificationManager / AlarmManager → CrewCheckNotificationReceiver | Local device notification/alarm. Not FCM or remote push. Bridge success queues UI-thread work, not an OS delivery receipt. |
| Web/PWA | crewcheckPremiumRuntime, Pulse, `new Notification`, page timer | Requires executing page and granted browser permission; page timer disappears on close/reload. Mobile browser constructors may reject. Installing the PWA does not add background push. |
| Service worker | client/public/sw.js | Cache/fetch worker; no push listener or subscription flow. |
| External server jobs | server/telegram-fast-ack.mjs | Persistent SQL jobs, claims/retries, scheduler heartbeat; Telegram and optional paid call channels. Paid channels remain untouched/unactivated. |
| BIDS | server/v139/bidsNotify.mjs | Telegram account lookup and delivery, authenticated scheduler-secret endpoint. Separate from general job loop. No automatic invocation of this BIDS endpoint found in checked-in deployment/workflows. Production invocation/configuration is unverified. |
| In-app banners | Pulse/toasts/BidsWindowsView | Visibility inside an executing application is not proof of an external delivery. |

No Firebase/FCM SDK/service, token registration/replacement/revocation, server token
registry, Web Push VAPID/PushManager subscription or push delivery receipt exists
in these checked-in paths. A stale token cannot be tested against a nonexistent
transport; no new credentials/provider are proposed. The Android manifest has
POST_NOTIFICATIONS, but granting it alone cannot produce remote push.

## Proven defects and this patch

- BIDS acknowledged `*_notified_at` irrespective of sendTelegram result. Now only
  provider acceptance records a marker. Failed/offline/unlinked attempts stay pending.
  The Telegram helper requires an explicit `ok:true`, rejecting malformed success bodies.
  Returned status is `accepted`, delivered is unknown; old markers are historical
  and cannot prove acceptance or delivery. They are not cleared/replayed automatically.
- GET and save of BIDS sent external messages. Now those operations only return
  windows; sending remains behind the existing authorized scheduler endpoint.
  This intentionally means an unconfigured BIDS scheduler cannot silently rely on
  page opening to deliver. Its actual invocation is an activation/review gate.
- Last-day eligibility used UTC civil day and could run before opening. It now
  uses the existing Brazil policy (America/Sao_Paulo), requires an open, valid,
  unexpired window and respects per-window switches.
- Repeated save reset acknowledged markers. Identical dates retain them; changed
  dates reset them. Edits now retain ID+owner even if title/month changes; missing
  IDs on the item endpoint return 404 instead of creating another window. Server
  switches require boolean true; omitted/null/numeric/string values remain off.
  New creation uses an owner-bound creation request key (legacy callers use
  owner/month/title), with atomic primary-key no-op on duplicate and payload
  conflict checks; concurrent retries cannot overwrite a renamed original. Legacy rows are not cleaned up.
- ICS last-day reminder incorrectly used DTSTART minus one day. It now uses
  RELATED=END and honors each switch. Export is a file snapshot, not a managed
  calendar subscription: removing/updating the DB does not cancel old imported
  copies. Stable UID is retained; no managed-calendar promise is made.
- Browser/native past reminders became immediate notices. Expired timestamps are
  rejected. Native scheduling no longer converts parse/AlarmManager failures into
  immediate notices or requests permission from scheduling.
- Native notifications now request PRIVATE lock-screen visibility. OS/user lock
  screen policy can override this; future briefing external content is generic.

## Remaining delivery gates

BIDS has no atomic multi-worker claim, provider idempotency key or unknown-outcome
ledger. Timeout after provider acceptance / crash before DB acknowledgement can
duplicate on retry; deletion/edit can race an already selected send. This candidate
does not claim exactly-once or activate BIDS scheduling. The general queue now
rechecks the current account incarnation and Telegram recipient, rejects client
recipient overrides, refreshes claimed rows, blocks old triggers after 120 seconds,
and uses a dispatching CAS as the cancellation cutoff. Cancellation after that cutoff
returns 409/inFlight, not success. Identical requests preserve terminal states;
changes to claimed/terminal jobs return conflict rather than reactivating them.
Stale claims and unknown outcomes are held as uncertain rather than retried;
partially accepted combinations are held as partial. Explicit known rejection can
retry at most three attempts. SQL epoch conversions avoid host-zone parsing of
unqualified MySQL DATETIME values. Telegram requests have a 10-second deadline.
No new provider, queue, migration or paid-channel activation is introduced.
These are fake-DB/provider tests, not actual MySQL/physical acceptance. Binding
revocation after dispatch starts cannot retract an in-flight provider request.
`sent` means provider accepted, not device delivered/read. No delivery telemetry for Bruno's device was accessed,
so the actual individual blocker (permission, channel, battery, build, account link)
cannot be inferred from code alone.

Android local alarms remain approximate (`setAndAllowWhileIdle`), not guaranteed
exact wakeups; no reboot restoration or account-bound cancellation was found in
this baseline path. Existing bridge methods return before the queued operation
finishes. Full Android build/physical validation remains required, including denied
permission, blocked channel, reboot, logout/account switch and cancellation.

## BIDS and year-end leave: source pending

No events were created. `pbsWindows.ts` contains recurring month/day suggestions
without verified year/source URI, effective period or official time zone. These
must not be treated as the promised official announcement; year-end leave has no
verified source in this investigation. New forms start with empty opening/closing fields. The reference button may
apply explicitly unverified 00:00/23:59 conventions, never confirmed official hours.

Before an authorized plan, collect: source document/link + verification time,
event type, effective year, source revision/hash, exact opening/closing instants,
IANA zone, action URL, cancellation state and owner opt-in. Prepare opening,
closing-soon and closing notices from those instants; present date/time/zone/link
objectively. Use existing queue only after current-owner binding, atomic dedupe,
revision revalidation and cancellation/expiry are proven. Do not activate or backfill
expired events. The current schema lacks source provenance and an explicit closing
topic; this patch does not invent either from monthly suggestions.

## Operational briefing handoff — reuse existing work

Open PRs verified before edits: #909 canonical disconnected preview, #910 authenticated
read-only adapter, #872 Wake/packing forecast and #907 disabled MyCrewCare candidate;
#891/#892 own chat/Pulse reception. #929 owns mobile release provenance. No branch
or files owned by these candidates were overwritten. #910 reports an inherited
second-preparation lifecycle failure; no merge/deployment readiness is assumed.

`server/concierge/briefing-preferences.mjs` is a disconnected extension consuming
the #909/#910 preview shape, not another roster classifier or delivery architecture.
It is not imported on startup, mounted in UI, persisted or scheduled. It always
returns `submissionAllowed:false`. It prepares:

- existing active alarm only if the authenticated adapter binds it to current
  account scope and duty; otherwise default APZ minus 90 minutes. It creates or
  changes no alarm. Lead/custom zoned instants and disable are supported; expired
  plans are blocked. Confirmed canonical APZ is required; unactivated HSB/reserve
  cannot be interpreted as an airport departure alert;
- two labels for the future preference UI: **Bem-humorado** (`humorous`, absent
  preference default) / **Profissional** (`professional`). Explicit saved choices
  are preserved. The defined alarm/APZ−90 timing default is preserved; future configuration may
  offer lead/custom time or disable without another timing question;
- generic external text with authoritative details in the authenticated in-app
  preview. Same factual content in both tones; arrival is labelled planned rather
  than inventing a confirmed end. No financial/roster details on the lock screen;
- small factual templates, no LLM/provider cost. Humor needs explicitly confirmed
  suitable context and an owner-bound recent-template ledger supplied by the adapter.
  Fatigue and explicitly known sensitive circumstances suppress humor; insufficient
  context is neutral. Only opaque phrase IDs need persistence, not grief/health
  details. Recent variants are skipped; if all are recent, no joke is emitted.

No user preference UI/storage or trusted contextual/history adapter is connected.
No activation is implied by the user's tone choice. Integration must revalidate
roster/alarm/owner/preferences/source and expire/cancel old jobs on edits, logout,
revisions and account changes, then claim/dedupe in the existing queue. Full trip,
overnight and destination/date forecasts must reuse canonical #909 and packing
#872 after review. #909 currently exposes observations, not forecasts. A verified
forecast adapter must provide destination, applicable dates, source, update time
and horizon; unavailable/out-of-horizon weather remains unavailable. No precise
weather guarantee, invented APZ, legal conformity, emotional diagnosis, family
message or location-as-SOS behavior is introduced.

## Evidence and smallest Android step

Local synthetic PASS: regression-bids-delivery, regression-browser-reminder-scheduling
(23 cases), regression-briefing-preferences and existing scheduler-heartbeat-health.
TypeScript `tsc --noEmit` PASS. All test delivery is fake; no real notification.
The signed-app Node first failed loading Rollup due to mismatched signing Team IDs.
This was resolved with a temporary official, checksum-verified Node 22.13.0 runtime.
Locked-dependency raw and canonically prepared Vite builds and TypeScript checks
passed, with existing CSS/chunk warnings. Source preparation and unchanged second
replay also passed. No signing/security setting was changed. Android compilation,
physical delivery, production scheduler/configuration, actual MySQL race tests and
source verification remain unproven. Do not deploy/merge on
these results alone.

Bruno confirmed the installed Android app; its version is still pending. Inspect
(without changing) the existing
notification permission/channel and account/Telegram link status. For closed-app
remote push, permission alone is insufficient: this baseline has no app transport.
After independent review, coordinate one recipient/content/channel with the parent
before any physical test. No request to disable battery protections or buy a service.

## Follow-up validation and delivery plan

The Vite runtime blocker was resolved without changing signatures/security settings:
the official Node 22.13.0 darwin-arm64 archive from nodejs.org was verified against
its official SHA256 (`bc1e374e7393e2f4b20e5bbc157d02e9b1fb2c634b2f992136b38fb8ca2023b7`)
and run temporarily under /tmp. Direct Vite build passed with existing CSS/chunk
warnings. The earlier signed-app Node/Rollup failure is historical, not a remaining
application build error. Locked-dependency canonical preparation/build is checked
separately; no ad-hoc signing or OS protection change is used.

Rechecked e3373d17: no workflow runs/status checks. Commits intentionally use skip-ci
because ordinary PR synchronization also triggers signed Android bundle workflows.
Absence of CI is not green CI. Independent review remains HOLD; no merge/deploy.
Source-preparation finalizer preserves the queue wrappers after legacy v1414
materialization. Fake regression suite now includes BIDS editing and queue races.

Minimum existing outside-app path: current user's already linked/authorized Telegram
channel, reviewed trigger and current binding, existing queue, generic concise message
with authenticated app detail. Do not activate BIDS/briefing until source and queue
gates are accepted. Local Android reminders can run after the app is closed only if
the OS alarm was actually scheduled; reboot/account cancellation remain unproven.
WebView loads crewcheck.online?app=1, so reviewed server/web changes can reach that
surface. Java receiver/bridge/permission fixes require a new reviewed APK; web
publication approval does not authorize APK/Play distribution.

Real Android remote push would require a native receiver/SDK, configured push project,
matching app identifier/config, existing-or-approved server sender credentials, token
registration/rotation/revocation bound to current account, preference/topic policy,
runtime notification permission and enabled channel, expiry/collapse policy and
delivery diagnostics. PWA additionally needs PushManager subscriptions, worker push
handling and VAPID/sender configuration. These are requirements only: no project,
credential, service, permission or cost was created/activated.

Briefing timing remains the defined alarm/APZ−90 default; users may later edit it in
configuration. Do not ask the timing question again. Tone/templates are a prepared
contract only; do not announce them as delivered until UI, persistence and sending
are integrated and independently reviewed.
