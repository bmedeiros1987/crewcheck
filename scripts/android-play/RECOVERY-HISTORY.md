# Existing Play pipeline recovery — no publication enabled

## Verified history

The pipeline already published internal updates. On 2026-09-29, push/main run
[36633551440](https://github.com/bmedeiros1987/crewcheck/actions/runs/36633551440/job/109629577043)
recorded at 21:32:38 UTC:

- com.crewcheck.app: COMMITTED TO INTERNAL TESTING (deferred-review).
- com.crewcheck.watch.app: COMMITTED TO INTERNAL TESTING (automatic-review).
- Both records explicitly said Production untouched.

This proves API credentials worked then and commit requests succeeded; it does not
prove current credential validity, current lifecycle availability or production.
The mobile deferred-review record is not evidence that testers received the update.

[PR861](https://github.com/bmedeiros1987/crewcheck/pull/861), merged at 21:35 on
the same date, intentionally detached push/merge from all three internal publishers.
Its rationale cites that successful run as an unwanted external side effect of a
merge. Preserve the manual publication regression. PR881 subsequently restricted
live allocator execution to manual main dispatch because opening a new edit may
invalidate another edit. Neither change proves a credential regression.

[PR767](https://github.com/bmedeiros1987/crewcheck/pull/767) already fixed the
CI dependency cycle: the publisher must not wait for its downstream P0 gate.
It is merged; its fix is not reimplemented here.

A separate historical observation on 2026-09-29 reported mobile versionCode 144153
in production as NOT_SENT_FOR_REVIEW, in
[job 109498735069](https://github.com/bmedeiros1987/crewcheck/actions/runs/36595360512/job/109498735069).
This is historical reconciliation evidence, not present state or a successful rollout.

## Corrections reuse PR929

PR929 was still open at 34bafe6b. Its reviewed-source CI/APK work is composed with
current main e854ea90 and the later durable-journal, crash and read-only protections.
It is not duplicated in another feature PR. The mobile controller no longer pins
PR882; it requires the exact current-main merge SHA of a reviewed source PR and
matching successful main CI plus the PR bridge gate. Controller changes now trigger
that existing bridge CI, preventing a release-controller PR with no bridge evidence.

The default mobile workflow builds only phone APK/AAB without Play secrets or live
allocation. Manifest/signature/certificate/hash checks remain. Policy version codes
are build labels only: artifacts explicitly say Play submission is not allowed and
live version allocation was not performed. The publish opt-in is refused before
checkout, credentials, edits or builds until a reviewed durable backend and all-writer
coordination exist. The CLI allocate/publish guards also remain.
Build-only preparation has its own concurrency group so it cannot displace pending
live writers. Unallocated/missing-allocation artifact evidence is refused even when
a test injects a journal; no build-only artifact silently becomes publishable.

The preflight reports actual GITHUB_SHA as controller provenance (or null if unknown),
not a stale candidate SHA. GET-only bounded summaries remain insufficient for version
allocation, unfinished rollout detection and production eligibility.

## Exact prerequisites before automatic delivery can be enabled

1. Independent review and exact-source CI of this composition; no stale PR882 build.
2. Read-only verification with the existing credential, without exposing its value;
   credential validity, current releases/reviews and Console eligibility remain unknown.
3. Reconcile the old production/internal drafts and any pending or uncertain commits
   before opening any new edit. All mobile/Wear writers share com.crewcheck.app;
   their local workflow concurrency alone does not cover Console/outside writers.
4. Reuse an existing authorized durable store only if it supports atomic reservation,
   owned writes and readback before commit, with no new costs/credentials/grants.
   No such backend has been configured here; runner-local files and end-of-job
   artifacts alone cannot safely survive a crash after commit. Otherwise return for
   a concrete storage/permission decision before provisioning anything.
5. Under that package reservation, allocate above every package code, including Wear,
   preserve all other tracks and manifests/signing, verify approved artifact bytes,
   persist intent before commit and reconcile uncertain outcomes without retry.
6. Review an explicit mobile-only auto-delivery trigger independently; do not revert
   PR861 or enable the existing joint publisher as a shortcut. Production requires
   verified eligibility; internal QA is a fallback for store rules, never failed code
   or security gates. Deferred-review commit is not availability.

No workflow dispatch, secret access, Play edit/upload/commit or backend provisioning
was performed while preparing this patch. Upload signing continues to use existing
CI secrets only when a separately authorized build is run. APK upload signer does
not prove compatibility with Play-installed apps; App Signing certificate and
data-preserving update testing remain necessary.

Follow-up composition preserves main aa281eee (merged PR1002), without PR951 code.
The same PR now adds offline immutable artifact consumption and an inactive
existing-MySQL adapter/coordinator; prior c30eb8a9 approval does not cover this new
HEAD. See EXISTING-JOURNAL-OPTIONS.md. Its real SQL test reuses the existing web CI
QA socket/container and must pass before claiming InnoDB integration validation.
