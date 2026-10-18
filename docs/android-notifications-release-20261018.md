# Android notifications / Play candidate — 18 October 2026

Isolated checkout; original dirty `/Users/marinamoura/fabric-work/crewcheck` preserved.
Base main `1d8df68cbe74044770823068e6347b1716ead7e6`, reuses #1068 HEAD
`4c09cc4143a386a789e24169977effcf2cf683b4` unchanged. No financial re-audit.
No AGENTS.md in checkout or its ancestor directories. Read engineering/release
instructions in scripts/android-play/README.md and existing Android notification,
restoration and external-delivery review documents. Open PRs were checked before edits;
#1068 is draft; legacy #1039/#1044 and mobile/watch work remain separate ownership.

## Confirmed defect and limited correction

The old JavaScript bridge returned true after queuing a UI runnable, even when
AlarmManager was unavailable or threw. The corrected bridge invokes the scheduling
method directly on its bridge thread (no View access) and returns false on missing
manager, invalid/past epoch, missing permission or OS exception; true only after
AlarmManager returns. True still means OS scheduling acceptance, never delivery.
Activity channel creation now uses HIGH, matching the receiver. Existing channel
importance and user choices remain controlled by Android; recreating it does not
upgrade an existing DEFAULT or blocked channel.

Actual Java method extraction reproduces the baseline failure at case 5 (OS failure
incorrectly accepted); candidate passes 10 cases with synthetic Android dependencies.
No real alarm or notification is produced. Prepared source retains the fix.
Raw/prepared RestoreBilling frontend and compiled Java regressions pass. Browser
reminder regression passes 23 cases. Canonical preparation, TypeScript, Vite and
real Android :app:compileDebugJavaWithJavac pass with existing Node/JDK/SDK/Gradle.
These checks precede the version-code-only policy edit; remote CI must validate
that final commit and signed bundle before any integration.

## Delivery boundaries and remaining blockers

- Local legacy receiver uses explicit PendingIntent/AlarmManager RTC_WAKEUP, so it
  can execute after ordinary process death/background/locked screen. This is an
  Android capability, not proof from Bruno's device. API33+ permission, app and
  channel must all allow notifications; lock-screen privacy remains PRIVATE.
- Inexact setAndAllowWhileIdle can arrive later than the receiver's 120-second
  validity window. The 12 fixed-clock receiver tests confirm rejection at 120001ms,
  10min and 1h. This policy was not broadened: delivery of stale operational advice
  needs event expiry, owner/cancellation semantics, not arbitrary TTL extension.
- No persistent legacy alarm inventory or reboot receiver restores these reminders.
  The separate authenticated stay-alarm prepared host remains OFF, intentionally;
  it does not establish resumable authority after process death/reboot.
- RTC epoch is an absolute instant; timezone display changes do not change that
  instant. Local civil-time generation/DST needs source-specific event authority.
  No scale, APZ, financial, timezone or canonical calculation changed.
- Ordinary app closure, Doze, OEM battery limits and force-stop are distinct.
  Force-stop stops app execution until user launches it; no bypass or new exact
  alarm/background permission is introduced. Battery exemptions were not changed.
- No Firebase Messaging SDK/service, native token enrollment/rotation/revocation,
  Android sender registry/config exists in the inspected source/workflows. Wear
  Data Layer is not a phone push transport. New push credentials/access are
  prohibited by this task; native remote push remains blocked on an existing
  authorized project/config and sender, or separate authorization to provision it.
- Browser Web Push has account/revision-bound subscriptions and worker/outbox,
  but live diagnostic reports gate disabled, config/installation/delivery not
  observed. It is not a WebView native push replacement. No token values read.
- Existing server scheduler reports completed; account history reports 26 sent,
  2 failed, no pending (28 total), deliveryConfirmed=false. Sent is provider
  accepted, not delivered. This read-only observation does not exercise a sender.
- ADB inventory is empty. No installed version, permission/channel, battery,
  locked-screen notification or physical receipt was observed. No test sent.

## Live Play Console read-only inspection

Package `com.crewcheck.app`, existing Mac Chrome session:
- Available production: 140319 /14.3.19, full rollout, last published 16 Aug 2026.
- Mobile pending production change:144153 /14.4.11; not described as published.
- Internal mobile:144154 /14.4.10, available for internal testers.
- Internal Wear:144155 /14.4.10-wear, separate Wear track.
- Open-test draft140384 contains historic Wear-labelled release.
- Publishing overview has 13 unsent changes, mixing production/Wear, listings,
  Health declaration and format changes. Managed publishing enabled.
- Policy page lists rejected Wear scrollbar/background/listing/watch-shape and
  Health Connect declarations, plus API36 requirement. Do not send all 13 changes
  as the phone notifications update.
- Upload SHA256 matches release policy:
  4B:5A:06:B5:B7:77:98:EE:1F:F5:68:19:52:A5:3D:A4:F1:BB:03:CD:C7:D0:7F:69:D7:E8:68:F6:2F:61:F4:54.
  App signing fingerprints differ from upload signing; no key changed.

Candidate mobile code144156 is greater than observed shared-package max144155.
Only app versionCode changes; Wear/face codes and artifacts are not uploaded or
promoted. KnownMaxVersionCode in the existing policy is a historical floor; live
allocation/validation must be repeated immediately before any upload. CI emits
separate signed artifacts using existing secrets and does not publish on PRs.
No store upload, submission, production rollout, credential, permission, price,
subscription, cron, paid service or mass send occurred.

## Minimum physical acceptance before release

Bruno must identify installed package/version and test device; compare Play signing
before installing through internal testing. Use one generic local reminder such as
“CrewCheck — teste de lembrete”, with an agreed future time and no roster details.
Check foreground, background, ordinary process removal, locked screen, denied
permission/channel and controlled battery delay separately; record actual displayed
notification/time and stale rejection. Reboot and force-stop must explicitly show
the documented limitations, not be called supported. Remote push test is separate
and remains blocked on transport/config; identify device/content before any send.

References: https://developer.android.com/develop/background-work/services/alarms
and https://firebase.google.com/docs/cloud-messaging/android/receive-messages.

## Follow-up requested by coordinator — local delays, restart and stack

PR1069 now targets the existing PR1068 branch, making the dependency explicit;
1068 remains open/draft at4c09cc41. Its commits are ancestors, not copied patches.
The phone build includes both. Do not merge1069 independently ahead of1068, and
recheck base/main and exact CI when integrating. No billing product change added.

The existing final manifest already declares SCHEDULE_EXACT_ALARM. The local
legacy scheduler now uses setExactAndAllowWhileIdle only when special access is
already granted (or Android before API31); it never requests a grant or opens OS
settings. A revocation between check and call falls back to the previous inexact
method. Missing grant keeps the previous behavior and120s expiry; old/stale
operational notifications are not arbitrarily made valid for hours.

A separate reproduced bug replaces pending reminders with colliding Java hashes:
Aa and BB with identical suffixes have the same hash. A SHA256 length-framed opaque
URI now distinguishes PendingIntents without storing raw text in their identity;
repeating exactly the same reminder still replaces that same reminder. No new
persistent state is written. New actual-method Java fixture covers24 cases,
including grant/revocation, pre31, legacy API, collisions and framing.

Reboot was investigated beyond a missing manifest entry: StayAlarmReceiver already
listens for boot, package replacement and clock changes, but belongs to the
separate authenticated stay journal whose two host flags are OFF. Its receiver
correctly refuses owner authority after restart. The active generic bridge has
no durable owner/event revision/cancellation journal at all. Blindly persisting
and restoring its free-text intents would resurrect a prior account or edited
roster reminder after logout/reboot. This cannot be called a safe reboot fix.
A resumable server-verified owner lease plus event revision/expiry and durable
logout/edit cancellation must be composed and tested; no gate was bypassed and
no old account reminder restored. Exact grant use improves ordinary-process
background scheduling but is not a reboot or force-stop guarantee.

Existing AAB144156 from fe0bbc89 is retained as historical evidence only. New
source changes require a new signed build of144156 before any upload; no earlier
144156 has been uploaded to Play, so the code is not yet consumed.

## Privacy fence follow-up — candidate144157, not yet physically accepted

The preexisting explicit logout/account-switch cancellation gap is now addressed
in source. The app entrypoint imports a lifecycle listener before mounting the
application; authClient mutation functions remain unchanged. It clears the native cancellation scope synchronously on auth-will-change
and expiry, then binds a new cancellation hint after the account changes. A same
account token renewal preserves pending reminders. Storage/native-ready/focus and
pagehide reconcile late availability or direct clearing without cancelling normal
page closure for an unchanged account. The hint never authenticates an owner.

The native ledger stores only an opaque scope hash, random generation, opaque job
keys and expiry timestamps in a separate private preference file. Before OS arm,
the journal is committed/read back. On explicit cancellation, generation and job
eligibility are invalidated durably BEFORE OS cancellation. Receiver claim and
notification display serialize with cancellation; a consumed ticket cannot display
twice. Existing own tagged tray notifications are dismissed, without clearing
other CrewCheck notifications. Old intents without a ledger ticket fail closed,
so pending pre-upgrade reminders need reconfirmation; user settings/roster are not
cleared. No token/title/body is persisted by the ledger. An uncertain operation
returns false and blocks scheduling in the process rather than claiming cleanup.

Pure actual Java ledger fixtures pass303 assertions including process-death reads,
logout, A→B→A epochs, no-scope, duplicate claims, expiry, limits and disk/OS failures.
Actual JS lifecycle plus actual authClient mutation functions verify cancellation
BEFORE token replacement/removal, preserved same-account renewal, expired sessions,
late bridge, storage and uncertain feedback. Actual Android schedule methods24 and
receiver timing12 remain passing raw and canonically prepared. These are synthetic
checks and compilation evidence, not delivery on a physical device. Independent
review of this new privacy delta is pending because the CUA connection closed;
the earlier a082b844 approval does not approve this delta.

No boot restoration or server-revocation guarantee is introduced: the cancellation
hint is not a verified session lease, and journal records do not contain enough
source/revision authority to recreate an alarm safely after reboot. Keep the
prepared StayAlarm host flags OFF. Explicit local session changes are fenced;
remote account revocation while the app never runs still needs trusted authority.

A mobile-only internal draft was opened in the Play UI and an upload of the
unambiguously identified a082b844 AAB144156 was attempted. The file-chooser tool
blocked and later returned Transport closed with no receipt. Its outcome is
UNCERTAIN, not confirmed uploaded, rejected, distributed or published. Do not retry
or open a replacement edit until a read-only Console check resolves the draft.
The browser tool remains unavailable even for read-only state/reset. Candidate
144157 is rebuilt to avoid reuse of possibly consumed144156, but no new upload is
permitted while the prior edit is unresolved. Terms/passkey requests remain
pending; no new equivalent approval request was sent.
