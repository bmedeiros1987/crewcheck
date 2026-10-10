# Free-day Telegram preparation: held only

Draft preparation after PR971. No merge, deployment, production API/SQL invocation, provider call, credential/permitted-channel change, new timer or automatic client producer is authorized by this change. Existing JWT/profile identity and existing notification/state tables are reused, with no migration or widened document access.

The explicit `/api/notifications/free-day-held` API reads readiness (GET) or processes grant/renew/revoke/reference/prepare actions (POST). This consent scope permits preparation only; `dispatchAllowed` is always false. Mutations require the exact persisted revision and a current profile public_id matching the verified JWT sub. Renewal/revocation cancel held/pending/processing free-day reservations and remove the reference. Preparation consent expires after30days. Account deletion removes the new scoped JSON state and jobs; a recreated account never inherits consent.

Reference action reads the owner's active stored roster under a row lock and captures only period, hashed crew/base identity, rest dates/clocks/offsets, source ID and server-computed version. Prepare rereads the owner's active snapshot, requires the same date to remain the sequence boundary in both versions before comparing clocks and creates an idempotent `held` reservation in the existing queue. Destination fields are null; the generic message excludes document names, crew names/IDs, clocks and indemnity. Account/profile locking serializes consent changes and reservations. Existing keys, including terminal states, are never reactivated. The link must have a server timestamp at or after current profile creation; its chat/timestamp/code binding is hashed. A changed owner/link/consent cannot promote a reservation. Manual alarm scheduling reserves the `free-day:` namespace, and dispatcher rejects even a forged `processing` free-day row. No activation path exists.

## Provenance boundary and prerequisites

Current sync clears rawText and overwrites the owner's monthly row. Stored `freeDayStartEvidence` is client-imported metadata: revalidation on the server proves only consistency of the stored snapshot, never the original company publication. All held results explicitly report `sourceVerified:false` and `possibleAmount:null`. The reference receipt must be captured before the monthly row is replaced; receipt capture is explicit and has no automatic caller.

Before actual outside-app delivery can be implemented/activated:

1. Define and independently review an owner-authorized source-ingestion path that preserves the two publication versions or their verified minimal evidence. This draft does not broaden raw-document persistence/access or treat rank/parser defaults as ACT proof.
2. Add an explicit UI flow and persist separate consent for real Telegram messages; preparation consent must not be silently upgraded. Verify the authenticated account's current link and server configuration through readiness, without asking for secrets in conversation.
3. Define an activation policy with server source/ACT verification, consent recheck, link/account recheck, source correction invalidation and idempotent receipt semantics before claim. Current dispatcher deliberately cannot send free-day jobs.
4. To detect revisions while the app is closed, add a separately reviewed server ingestion producer. Persisting held jobs alone does not detect new revisions or deliver them.
5. Independent review and terminal CI are required before any merge; this PR stays draft. No real settings, links, credentials, permissions or messages were tested/changed.

## Validation

Synthetic404min fixture; three device TZs; missing/invalid literal clocks/dates/timezone; expired/revoked/stale consent, renewal, process recreation and account recreation; forged body authority rejected; owner-only active source, period/identity mismatch; link ownership/rotation; concurrent preparation and revocation; rollback of queue insertion when receipt write fails; reserved namespace and zero dispatch. MySQL8.4 disposable container without network/published ports verifies real SQL locks,8concurrent requests yielding one held job, cancellation, account-scoped cleanup and forged processing rejection, before/after canonical preparation. Raw/prepared TypeScript and production build passed. No private document or production database was read.

Independent-review correction: a reference12–14Aug start01:46 compared with a revised sequence beginning11Aug and a12Aug clock08:30 now returns SEQUENCE_CORRESPONDENCE_PENDING with no reservation. Missing current boundary also stays pending; an unrelated nonconsecutive10Aug rest does not invalidate the12Aug boundary. Covered in synthetic3TZ and real SQL tests.
