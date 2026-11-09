# Hotel APZ date inference

Cause: the editor initialized APZ date from the stay's start day and never reconciled it when a clock was entered. Calendar-only canonical stays also end at 23:59; this is not a proven hotel departure.

The editor now suggests the next valid occurrence of the entered clock in the hotel zone. It must lie within the selected stay. Only the exact canonical calendar-day sentinel, without published report/debrief or continuity bounds, can use the immediately following unique flight from the same airport as its upper bound (maximum next 24 hours). No destination-based APZ clock is inferred. Exact bounds, historical stays, invalid/repeated DST times, conflicts and missing onward evidence do not acquire an invented future date.

Explicitly edited dates and all saved dates remain pinned. Draft switching preserves that distinction. A zone change recalculates only an unpinned suggestion. Confirmation is cleared on edits. The same occurrence-bound calculation is used by the local operational projection and the existing wakeup consumer; existing pending jobs are not edited or replaced. Past alarms remain ineligible.

Validation: new pure date/ambiguity tests; actual editor create/change zone/save/reload/manual past date in three device zones; existing operational projection, persistence and wakeup propagation tests; native fake-engine timing/revocation tests; prepared TypeScript and production build. Independent review found and prompted tests for non-calendar end extension, equivalent-offset ambiguity and dependent-source invalidation; all corrected.

No live scheduling, notifications, calls, permissions, transports, account data edits or Watch distribution. This is a draft correction, not proof of physical delivery.
