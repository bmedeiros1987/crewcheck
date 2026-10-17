# Wake status UX

Adds an account-wide, observational Wake summary to the existing Wake screen. Saved preferences remain separate from explicit activation; server pending, processing, provider acceptance without confirmed delivery, and failure states are distinct. Unknown, offline, failed reads, and old-account responses never imply scheduling or delivery. The summary explicitly does not confirm the alarm for the currently selected roster event.

The existing authenticated diagnostic adds one SELECT aggregate scoped to wakeup: jobs, the current owner, and records created after account creation. It reuses existing scheduler history without creating a cron, producer, channel, schema or service. No provider is contacted. No zero incremental resource-cost claim is made: a diagnostic read uses existing application/database resources.

No ownership overlap with PR872 or PR1058 paths. Integration changes only the existing bids-default finalizer; Android and weather are untouched.

Validation: Node22 synthetic status matrix and actual component effect account/offline/request/unmount tests; existing observational diagnostic regression; canonical preparation and single-insertion check; TypeScript noEmit; Vite production build. Independent review PASS with no blockers. No live tests, sends or scheduling.
