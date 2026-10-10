# Personal operational notifications — draft scope

Base: main 500fb1c33370689b6c05a49c1d594a0df0b5bb35. No production endpoints, real alerts, calls, location sharing, credentials, permissions or store release were exercised.

## Implemented

- Device readiness reads existing native POST_NOTIFICATIONS permission separately from app-wide notification blocking and the `crewcheck_alerts` channel. A missing channel or older installed bridge is unknown, not ready. The read does not create a channel. Only a user tap requests the existing notification permission; a queued request is never treated as a grant. Wear permission/channel remain separate.
- Hotel presentation editor no longer pre-fills a stay's roster presentation/check-in as a hotel APZ. Previously saved explicit hotel presentation remains available. This editor change does not publish a new hotel APZ or pickup to Wear and does not establish provenance of previously saved values.

## Existing ownership and delivery

Wear's `CrewCheckDataLayerService` stores phone snapshots and invokes `WatchNotificationCenter` locally through channel `crewcheck_watch_ops`; this is distinct from phone local notifications, browser page timers and Telegram. In current main, `watchContext.ts` emits empty `hotelPickup` and `boardingTime`. A BOARDING state is derived from roster time, not evidence of airport boarding. Gate provenance is already owned by draft PRs 882/870; gate change consumption by 852 and Wear layout/freshness by 836. This draft does not duplicate or merge them. Physical Watch4 and installed Android version compatibility remain unverified.

The reference PNG could not be materialized using the Library helper (`download failed`). No private screenshot is included, and no claim of personally reproduced clipping is made. Parent's independent pixel review reported a watchface with missing gate/pickup, not a clipped boarding notification. Visual changes remain pending.

## Emergency integration: blocked before transport

The user requests two deliberate Wear actions: **Emergência médica** and **Me acompanhe**, sending to the emergency contact already registered on the same account. It is not a dialer shortcut or continuous monitoring.

`server/v1391/emergency.mjs` has an existing Telegram transport, but `savedContactRecipients` combines non-revoked Compartilhar visitors and accepted connections; preferences default to also notifying shared-hotel colleagues. This is not a verified single emergency-contact selection. The Guardian phone contact is in an unscoped local form cache and is not an authoritative CrewCierge Telegram recipient. No replacement contact registration is created here.

Current payload: emergency category, profile display name, São Paulo timestamp, optional location URL and details; medical profile can be included when both preference and consent allow it. Recipient markup includes “Vou ajudar” and optional contact/location links. Telegram confirmation names the generic group “contatos habilitados”, not an exact reviewed recipient set. Authenticated `/api/platform/emergency/send` itself lacks a confirmation token check. `sendAlert` sends before persisting an alert and its rate limit is a prior SELECT, not a transactional idempotency claim: simultaneous taps, lost response or failed INSERT can lead to ambiguous retry or duplicate delivery. No Wear consumer should invoke it directly.

`result.ok` is transport acceptance only. “Vou ajudar” is an explicit recipient response with membership checking, not delivery evidence or guaranteed medical assistance. Active-alert response currently omits these response records. “Me acompanhe” has no dedicated kind or session semantics in this catalog; do not silently map it to security/other or start tracking.

Required safe integration boundary, before enabling any send:

1. Resolve the existing account's explicitly selected emergency contact; if no unique verified selection or reverse transport link exists, block with a precise reason. Do not include connections or hotel colleagues by default.
2. Authenticated phone creates an expiring account/session-bound draft carrying exact action, masked/name recipient preview and exact data categories. Wear shows confirmation and cancellation; stale snapshot, switched account and disconnected phone invalidate confirmation. Location and medical data require explicit preview/consent and must not be inferred from a hotel check-in.
3. Persist an owner-bound unique action key and claim before any transport call; concurrent confirmation reuses the result. Lost acknowledgement becomes unknown and cannot automatically replay. Cancellation before the claim sends nothing; cancellation after acceptance cannot recall a message and must say so.
4. Show separate states: pending locally, phone unavailable, accepted by transport, outcome unknown, failed, and recipient explicitly responded. Never label accepted as received. Reuse existing Telegram configuration only after recipient/link checks; no paid channel, new credentials, implicit permissions or live test messages.

Remaining prerequisite: locate the authoritative emergency-contact selection in CrewCierge/Compartilhar and establish its intended ownership. No real Wear emergency sending is implemented or enabled by this draft.
