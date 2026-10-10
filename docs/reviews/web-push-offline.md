# CrewCheck delivery outside the app: offline preparation

This is a separate, stacked draft on PR995. Nothing enables Web Push in production. The live contract is false, there is no live provider, API route, UI activation or import into the shipping sw.js. Existing CrewCheck remains the ordinary UI product label. Tests use only synthetic data and mocked display/transport; no permission is requested and no credential is generated/configured.

## Existing infrastructure and verified configuration presence

Existing Render Node web service srv-d8de30sm0tmc73drgvig declares https://crewcheck.onrender.com. Existing MySQL state/profile tables can store encrypted installation state; the root-scoped /sw.js registration is already present. No new service, paid channel or runner matrix is created.

Repository source/template has no VAPID/Web Push pipeline or configuration names. Executor presence checks for WEB_PUSH_ENABLED, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, WEB_PUSH_ENCRYPTION_KEY and WEB_PUSH_ORIGIN returned false, without printing values. Available Render tools cannot read environment-variable presence alone. Production key existence remains UNVERIFIED, not proven absent. No secrets were read or exposed.

## Implemented, isolated foundation

- Subscription validation restricts HTTPS to supported push-service domains and validates P-256/auth key encoding. AES-GCM protects subscription data, with authenticated account/installation/revision binding; fixture encryption bytes are synthetic and never configured. SQL mutations lock current canonical profile and endpoint row, compare revision, reject another owner/device and clear protected material on revoke. Revoke-by-installation works without a browser subscription. Account deletion includes this namespace.
- Transport accepts only an isolated mock provider. It validates source/audience/consent/expiry and current binding, then exercises transactional claim semantics. Acceptance and unknown outcomes never become received. Concurrent dispatch, uncertain/no replay and stale binding are tested. A persistent production outbox repository and real RFC-compatible provider adapter are STILL REQUIRED.
- Explicit activation/cancellation functions have no production callers. Disabled/unconfirmed paths do not request permission. Account changes discard activation; local binding is cleared before unsubscribe/revocation. Offline server revocation remains unconfirmed. A real-device public-key conversion/support adapter and authenticated HTTP integration are STILL REQUIRED.
- Worker logic includes persistent IndexedDB binding/claims, expiry, duplicate/revoked/account guards and safe /app click routing. Generic notifications contain no roster/account details. Resolved display API is not receipt/read proof. Shipping sw.js deliberately does not import/register these handlers. Real worker wiring, same-origin binding messages, authenticated receipt reconciliation, bounded claim cleanup and physical revocation-race tests are STILL REQUIRED.

## Next steps and authorization boundary

1. Independent review of PR995 and this stacked draft; merge base first and retarget this draft to main.
2. Confirm production variable PRESENCE ONLY via a supported secure configuration interface or owner confirmation. Never send values in chat/logs. Reuse existing VAPID/protection keys only after validating ownership and compatibility in a secure runtime; otherwise obtain explicit authorization before generating/configuring dedicated keys and contact subject. No generation/configuration is included here.
3. Implement authenticated HTTP registration/status/revocation and production transactional outbox, with current-account checks at every claim/send boundary and no observational write. Add expiration cleanup and endpoint 404/410 invalidation. Retain uncertain claims without blind retries.
4. Add a reviewed standard Web Push provider dependency/adapter and verified HTTPS origin/scope. Existing Render/MySQL may be reused; deployment does not itself authorize real transport activation.
5. Wire service-worker push/click and account-specific local binding, logout/account-deletion/consent revocation; add minimal authenticated receipt reconciliation. Keep provider acceptance, display API, device processing, explicit acknowledgement and actual read distinct.
6. Add a discreet, contextual device activation under CrewCheck preferences. Each device needs an explicit user gesture and permission; iOS/iPadOS additionally requires supported Home Screen installation. Selecting Todos is not permission or pairing. No grants are requested by this draft.
7. Validate offline/closed-app delivery, expiry, logout/switch, revocation races and receipt labels on actual supported devices before enabling. BIDS also requires official communiqué, timezone, target month, closing and eligibility; current campaign remains null. Relógio/CrewCierge need their own verified links/transports, not inferred from Web Push.

Primary protocol/platform references: [MDN PushManager.subscribe](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe), [WebKit Web Push for iOS/iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).
