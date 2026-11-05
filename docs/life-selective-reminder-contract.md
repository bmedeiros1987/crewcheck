# Life selective local reminder contract — draft, not activated

Base: main `9630296ea5edb8ef4b23ba3ad158479f64c08000`. No client Life
generation is connected to these methods. Existing legacy alarms are unchanged.
No merge, APK distribution, Play operation, permission request, credential or
transport activation is part of this draft.

## Surface and ownership

The existing `AndroidCrewCheckNative` bridge exposes two additional methods:

- `lifeReminderState()` returns schema1, module `life`, availability, an opaque
  current `context`, and current Life IDs/revisions/phases/epochs. Availability
  means this contract has a usable local cancellation scope and boot marker,
  not notification permission or delivery readiness. This read never arms work.
- `updateLifeReminder(requestJson)` accepts schema1 `replace` or `cancel`, the
  exact context returned to that account session, an ID and a monotonic safe
  integer revision. `replace` also needs future epoch `at`, title (1–120 chars)
  and body (0–500 chars). Unknown fields are rejected without an accepted receipt.

IDs must be `hydration|movement|study:YYYY-MM-DD:slot`, with a real civil date and
a 1–24 character lowercase alphanumeric/underscore/hyphen slot. The module is
fixed natively; callers cannot supply a native job key or another module.
This ID identifies a logical slot. It is not a source-authority proof and does
not infer airport timezone or change wellness/roster eligibility rules.

The context hashes the existing local account cancellation scope, its random
generation and Android `BOOT_COUNT`. It is a cancellation fence, not a token,
server identity verification or a trusted lease. Missing scope, uncertain global
cancellation or unreadable boot count means unavailable. Old account/boot
contexts cannot read, cancel, replace or claim current records. No new Android
permission is required to read the boot marker. Remote account revocation while
the app never runs remains outside this local contract.

## State transitions and truthful receipts

The journal stores only context, logical IDs, revision, epoch, opaque native keys,
payload fingerprint and phases/cleanup keys. It stores no title, body, account ID,
JWT or raw health/roster. It shares the existing private preference transaction
and global cancellation lock. Only Life-prefixed mirror entries are rewritten;
all non-Life jobs, account scope and generation remain untouched. Global logout
still sees and cancels these opaque keys through the existing fence.

Replacement first persists `cancel_pending`, removing old receiver eligibility,
then cancels only recorded native Life keys and their own tray tags. Partial
cleanup returns `partial`, never arms the replacement and can resume cleanup
idempotently. New native keys are random per revision, so even the same epoch
with a changed body cannot let an old broadcast consume the new job.

Before arm, `arm_pending` is durable. Only a confirmed `armed` record may be
claimed by the actual receiver. Same revision and fingerprint never rearms an
accepted or uncertain OS operation. Conflicting/stale revisions fail closed.
The receiver persists a single `consumed` claim before displaying and retains
the existing120s timing boundary and PRIVATE lock-screen visibility.

Receipts include `ok`, `status`, ID/revision and `deliveryConfirmed:false`.
`ok:true` means `accepted` by the OS with a durable receipt, or `cancelled` after
target cleanup. It never proves physical display. `partial`, `uncertain`,
`failed`, `wrong_context`, `stale_revision`, `revision_conflict`, `not_found`,
`limit` and `rejected` are not success. If the armed receipt write fails after
the OS call, display may be uncertain; repeating that revision never repeats
the arm. A higher revision can invalidate/cancel that key before replacing it.
No background retry loop or automatic replay is added.

The journal is capped at64 logical slots and eight cleanup keys per revision.
The adapter also retains the existing256-job combined ledger limit without
removing or pruning another module's entries to make room.
Records without unresolved cleanup expire after their scheduled epoch plus the
existing120s window. Nonempty cleanup records remain bounded by the same slot/key
limits until selective OS cancellation is confirmed, even if a replacement's
scheduled time has expired. State reads and process recreation retain those keys.
Within retained records, a matching revision/fingerprint reconciles `armed` or
`consumed` to `accepted` before checking future time; it never rearms. A new
replacement revision still requires a future time. An expired `cancel_pending`
retry can finish old cleanup but returns `expired` without arming the past job.
Ordinary process recreation preserves a current eligible ticket. A changed or
unknown boot context refuses old tickets and never restores alarms. The prepared
StayAlarm host and overnight lease flags remain OFF.

## Legacy compatibility and later client work

Legacy title/body/epoch jobs have no trustworthy Life namespace. This draft does
not guess which old hashes belong to Life and does not globally clear them.
Future UI must distinguish new-contract jobs from pre-upgrade pending alarms.
Turning Life OFF will enumerate current Life IDs and cancel them individually,
retaining per-ID partial/uncertain status rather than reporting blanket success.
The existing Life generator is deliberately not wired in this draft.

## Coordination with held #1085/#1088

Held phone `b89dc0ef` and Wear `f9edef` are not edited or merged here. This draft
adds methods immediately before `setNotificationCancellationScope` in the main
bridge; it does not replace that method. When composing with #1085, preserve its
`invalidateCompanionOnAccountChange` calls and its Activity/ticket/attempt fences.
Keep both new methods as separate hunks. Never use a Life-specific account hint
to invoke global cancellation.

The optional future client hunks are main963 `lifeConcierge.ts`
`saveLifeAdaptivePreferences`256–265, `timeToday`604–609,
`periodReminderTime`611–616 and `scheduleLifeRemindersForToday`618–643. Their
held equivalents293–302/646–651/653–658/660–685 have identical method bytes.
`LifeConciergePanel` main save/schedule152–179 overlaps held161–190: retain the
held `healthSession.isCurrent()` guards. No client hunk is changed here.

Both fronts use Robolectric4.14.1 test-only dependencies and Android resource
test options. Deduplicate identical Gradle entries during a future composition,
while preserving #1085's optional exact-Wear test source set. No gate exception
or ownership allowlist change is proposed.

Future order: independent review of this exact draft and its tests; coordinate
an immutable composition baseline with #1085's owner; run both complete suites
on that tree and retain MCC HOLD unless its own policy gate approves it. A small
client planner/adapter can then be reviewed separately. A reviewed mobile build,
the existing publication lifecycle gates and physical acceptance must precede
availability on installed phones. A web-only deploy cannot add this bridge.

Physical acceptance, only after later authorization: identify device/package,
installed version, boot-marker availability and existing permission/channel/
battery status; use one generic synthetic reminder; observe replacement, OFF,
ordinary process removal, locked screen, denied permission, cancellation failure
feedback and boot behavior. Keep unrelated-module alarms intact. Do not use
force-stop as ordinary closure or declare physical delivery from CI.
