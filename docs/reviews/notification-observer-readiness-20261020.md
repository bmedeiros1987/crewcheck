# Notification diagnostic reader

Base: main `998507548389755f5a7487a63d0d6964c0964e8e`. No account, queue, service, environment, permission or provider was changed. Tests use fictional identities, local HTTP and fake native permissions.

The readiness panel previously read `/api/alarm/scheduled`, whose existing handler calls `ensureNotificationTable`, and omitted failed/held/processing/dispatching records from its summary. The panel now reads the existing observational GET `/api/notifications/diagnostic`. That observer uses SELECT only, binds history to the current account and account creation, and reports provider acceptance separately from receipt. All eleven normalized history states are displayed. Invalid or unavailable data remains unavailable rather than becoming an empty history.

No endpoint, scheduler, writer or delivery path was added. The existing Wake host still uses its own scheduling/listing contract; this change only replaces the diagnostic panel reader. Channel configuration/linkage is not returned by this observer and is therefore explicitly unobserved, rather than inferred as ready or disconnected. DeviceNotificationReadiness and WakeDiagnostic are unchanged.

## What each layer can establish

- Generation: the local gate producer requires a confirmed change; unknown gate alone does not establish an event. No flight-delay producer was established in this path.
- Local presentation: pulse preference, current account/review, device preference, background visibility, permission and cooldown can suppress presentation. A local pulse or native notify return does not establish receipt.
- Server queue: the observational history distinguishes pending, processing, dispatching, failed, expired, held, cancelled, partial, uncertain and accepted states. Its scope is account history, not proof of the selected flight's alert.
- Device readiness: the existing component reads native/browser permission, app and channel availability. It does not prove a queue item, send or display.
- Sending/receipt: scheduler health is global. Queue `sent` means provider accepted; observer receipt remains null and deliveryConfirmed false. Watch, CrewCierge and closed-app delivery remain unobserved here.

No authenticated history or device evidence for Bruno was consulted, so this correction does not attribute his missing alert or claim recovery. Next diagnosis requires the existing account-scoped observer result and device readiness, plus the specific expected event/time, without sending a test.

## Verification

Synthetic tests cover the complete status matrix, malformed payloads, exact owner/token continuity, will-change invalidation, offline/reconnect and unmount. Existing server observer and Wake diagnostics stay covered. Browser fixtures use only the observational GET for this panel, preserve native permission mocks, and assert no channel/receipt claims. Existing integrated Wake and settings fixtures were updated to the same observer contract without changing production scheduling behavior. The existing notification-settings workflow runs the new reader regression raw and prepared.
