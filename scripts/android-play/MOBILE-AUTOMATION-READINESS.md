# Mobile release candidate — automation remains inactive

Candidate main: `ba3723a426184aadf9f1b1bf8106129f0179c5bd` (merged PR974).
No PR975 or CrewLocker change is included.

Verified remotely on 2026-10-10: Android run 38054746297 succeeded with
`publish-internal-drafts` skipped; P0 run 38054898661 succeeded; web run
38054746249 succeeded. These are build gates, not Play publication receipts.
The local cloud environment has no Play credential, and its GitHub CLI token is
invalid. Existing GitHub repository access works through the connector. No
AGENTS.md or .agents/skills files were present in the selected workspace/repository.

The new preflight can use the existing PLAY_SERVICE_ACCOUNT_JSON secret only after
review and merge, through manual dispatch on main. PR execution runs offline tests
without secrets. The preflight uses only GET release-summary requests for the phone
package, including its known Wear aliases because the package shares version codes.
It never creates an edit (which could invalidate another edit), uploads or commits.
Failures are recorded without exception text or raw response bodies. A missing
alias is unverified, not proof of absence or production ineligibility.

This is the first blocked stage of the requested automation. Production eligibility,
Play review/declarations, custom tracks and current rollout details remain unknown.
The bounded summaries exclude obsolete releases and cannot allocate version codes.
Do not use a published lifecycle state as proof that a rollout is finished.

Before adapting or activating publication:

1. Obtain independent review of this draft and run the read-only preflight with the
   configured credential; inspect Console production access and publishing overview
   using an already authenticated session. Do not create credentials, accept terms,
   change declarations or permissions automatically.
2. Reconcile old drafts, pending review and any uncertain commit receipts with their
   owner. A security/code block cannot become an internal-testing fallback.
3. Adapt the mobile-only controller to the reviewed immutable main candidate and
   exact successful main CI, with a separate independent approval gate for the
   automation commit. Do not simply replace the PR882 SHA: its current check-ci
   contract explicitly depends on PR882 and PR-triggered CI.
4. Allocate live above every package code, including Wear, only after coordinating
   edits. Build only :app:bundleRelease and preserve actual manifest/certificate checks.
5. Before commit, persist intent durably off-runner and block subsequent runs until
   reconciliation. Existing runner-local receipt plus upload-artifact at job end is
   insufficient if the runner dies after commit. Verify all untouched tracks after
   acknowledgement; uncertain outcomes prohibit retries, new edits and cleanup.
6. Publish to production only if eligible and all gates pass; use existing internal
   QA only for a verified store eligibility limitation. Confirm actual lifecycle
   availability; changesNotSentForReview=true is not availability.

Existing joint and PR882 publishers are intentionally unchanged and not dispatched.
Publication and the complete controller adaptation remain blocked on these checks.

API reference: https://developers.google.com/android-publisher/api-ref/rest/v3/applications.tracks.releases/list
