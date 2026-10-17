# Wake status UX

Adds an account-wide, observational Wake summary to the existing Wake screen. Saved preferences remain separate from explicit activation; server pending, processing, provider acceptance without confirmed delivery, and failure states are distinct. Unknown, offline, failed reads, and old-account responses never imply scheduling or delivery. The summary explicitly does not confirm the alarm for the currently selected roster event.

The existing authenticated diagnostic adds one SELECT aggregate scoped to wakeup: jobs, the current owner, and records created after account creation. It reuses existing scheduler history without creating a cron, producer, channel, schema or service. No provider is contacted. No zero incremental resource-cost claim is made: a diagnostic read uses existing application/database resources.

No ownership overlap with PR872 or PR1058 paths. Integration changes only the existing bids-default finalizer; Android and weather are untouched.

Validation: Node22 synthetic status matrix and actual component effect account/offline/request/unmount tests; existing observational diagnostic regression; canonical preparation and single-insertion check; TypeScript noEmit; Vite production build. Independent review PASS with no blockers. No live tests, sends or scheduling.

## Validation integrity correction

A previous workflow shell specified pipefail without errexit. This allowed an intermediate failing browser regression to be masked by a later successful command. The workflow default now uses `bash -e -o pipefail {0}` for every run block. The shell audit executes that configured shell with intermediate command/pipeline failures and verifies that subsequent commands never run; the former shell is retained as a negative control. Earlier green workflow conclusions are not evidence that every regression passed.

Base/candidate reproduction: notification-center conflict reload and obsolete BIDS time/fuso selectors failed on both main e99d86ee and this candidate. Prepared Wake host passed on main but failed on the candidate because its extracted-component bundle omitted WakeDiagnostic. The host now imports the real component and mocks only its read-only GET. The BIDS fixture uses current civil-time/fuso controls and expands all help before measuring zero text/control intersections; no controls or assertions are excluded. Conflict reload now remains busy/in conflict until the read completes, preserving edits and conflict on failure and retaining account guards.

All eight raw-source SOS fixtures passed locally after correction, including actual settings, session isolation, push OFF, and no implicit provider sends. All nine prepared SOS fixtures, TypeScript, Vite build, Wake diagnostic, observational diagnostic and shell audit also passed locally. Remote exact-head validation and affected-candidate composition validation remain required before integration.
