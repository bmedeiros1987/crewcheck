# Pending generic Web Push display

The main 0f8f89e1 shipping worker could acknowledge local cancellation while a generic showNotification call was still pending. The synthetic reproduction uses the real worker listeners, IndexedDB, Web Locks and MessageChannel in Chromium, with display and push arrival simulated. Cancellation-before-push and cancellation-after-display end with no visible mock notice. In the pending-display interleaving, cancellation acknowledges and revokes the binding, then releasing display creates one visible mock notice. This does not establish OS delivery, a private-body disclosure, a click-guard bypass or live production transport.

The generic shipping branch now holds the existing origin-wide crewcheck:gate-notice:v1 lock through display completion. Gate receive/sync already own that same non-reentrant lock and are not wrapped again. The generic branch never acquires the subscription lock; the established ordering remains subscription then notice. Without Web Locks, no new generic display is admitted. Existing local control cleanup remains best effort; the client already requires Web Locks for activation and confirmed cancellation. No channel or feature flag is enabled.

A successful begin revokes the old binding and closes its notices before acknowledgement. Rejected begin requests do not close another owner's notices. The internal, single-value candidate-ready-generation:v1 key is cleared by accepted begin/cancel/subscription-change transitions. Only a compare-and-set finish after successful cleanup marks readiness for that owner and generation. An exposed generation or queued bind cannot bypass pending/failed cleanup. The first accepted bind consumes readiness; an existing active binding only permits an idempotent repetition of owner, installation, consent revision and subscription hash, without rewriting metadata. Replacement uses the existing begin path. This is local finite phase metadata, not a new RPC, database migration, retention period or account authority.

Cleanup errors do not return a positive acknowledgement or restore a revoked binding. Retrying an explicit request re-evaluates current state; uncertain display claims are not removed or automatically resent. A committed readiness phase with a lost response does not undo completed cleanup. Late cancellation or subscription-change evidence for A must preserve B's current preparation/binding.

Regressions cover the shipping entry points with real IndexedDB/Web Locks, pending generic display and cancellation, account changes, idempotent and rejected replacement binds, failed/pending cleanup, missing or failing lock capability, display errors, queued expiry and subscription change. Existing gate, cancellation, lifecycle, reconciliation, duplicate, TTL and click tests remain. All content/accounts and display operations are synthetic; no real permission prompt, subscription/provider call, message, user data or OS notification is used. Raw/prepared tests, independent review and exact-head CI are integration gates. Android runtime, store and production activation remain separate.

The browser regression awaits each asynchronous RPC and native lock snapshot in
bounded Node-side polling. It verifies entry into the held display/close, the
exclusive lock still being held and the exact pending lock queue before releasing
the operation. Async waitForFunction predicates did not reliably provide that
barrier in the pinned Playwright 1.55.0: a Promise could be accepted as truthy
before resolving false. Final-state assertions remain, with observed barriers
included in the test summary. This follow-up changes the test and review record;
the shipping worker, channel defaults and feature flags are unchanged.
