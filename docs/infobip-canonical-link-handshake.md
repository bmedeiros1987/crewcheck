# Canonical link in the restricted Infobip test

Code only; missing policy remains OFF. This change does not configure the policy,
start its window, create a challenge/link for a real account, send a message,
resolve new credentials or change the provider profile.

## User path

After reviewed code is published and the existing test policy is deliberately
enabled for the approved recipient/window, add the explicit boolean
`configuration.canonicalLinkHandshake: true`. All other single-test restrictions
remain unchanged. The window and durable approval ID must not be reset to regain
an already consumed attempt.

The authenticated user opens `/app?view=notifications` → Vínculos de canais →
Vincular WhatsApp. The app requests the existing canonical ten-minute challenge
with `consentConcierge: true` and `provider: infobip`. The server checks the policy
before creating a challenge. It derives the destination from the policy's
allowlisted sender/deployment binding; conflicting legacy business numbers fail
closed. Missing/expired handshake configuration returns 503 without a new code.

The user sends the generated code from their own WhatsApp. This inbound action
proves control of that channel and opens the applicable service conversation only
according to the provider's real rules. The agent does not send or manufacture it.
Raw HMAC must verify before parse/SQL. The receiver accepts codes only for the
configured recipient/window, applies the existing per-recipient attempt bound,
and consumes the actual unexpired canonical challenge transactionally. An active
phone belonging to another account cannot be stolen by a new challenge.

After sending the code, the user returns to Vínculos de canais and explicitly
chooses **Conferir vínculo WhatsApp**. This authenticated status request performs
only SELECT, returns a masked final-four/consent result, and never initializes
tables. Missing schema is unavailable, not silently migrated. Account changes
clear the visible result and discard stale status responses. Challenge creation
also discards an old-account response before opening/copying/displaying the code.

There is **no outgoing link-confirmation message** in this mode. Link update,
challenge consumption and inbound claim commit together; the claim contains no
reply content. A retry/restart is ACK-only. Alerts remain unconsented. Linking
neither enqueues a reply nor reserves the single paid test attempt.

After enrollment, the user sends exactly `Teste CrewCierge`. Only that event can
authorize the fixed `Teste de conexão CrewCierge.` reply, still subject to canonical
binding/consent, revocation fences, fresh timestamps and the same one-attempt
durable admission. Arbitrary text and codes outside the explicit mode cannot
invoke general Concierge tools. HMAC configuration alone is not signature proof,
and a provider receipt is not physical receipt by the phone.

## Navigation

Home previously reset its view and URL on every `auth-changed` event, including
same-account profile/session refresh. This discarded the Notifications deep link.
The handler now preserves the destination only for an identified, unchanged
account. `auth-will-change`, expiry, missing identity and a different account still
reset cockpit and financial navigation state. Existing protected-session remounts
and stale-response guards remain in place.

## Verification and limits

- Raw/prepared receiver tests cover HMAC before SQL, recipient/window restrictions,
  consumed/expired codes, cross-account conflict, rollback, concurrency and restart.
- The real prepared host performs the canonical handshake using synthetic SQL,
  makes no confirmation call or quota reservation, survives restart, then permits
  exactly the existing neutral test response via a fake transport.
- The disposable MySQL suite tests atomic canonical link + receipt + challenge
  consumption without a held reply. No real user database is used.
- The built application browser fixture tests the real Notifications menu/deep
  link, same-account refresh, different-account reset and explicit binding button.
  All API responses are fixtures, external origins are blocked, and no challenge
  is requested automatically.

This prepares the safe path; it does not prove live HMAC equality, API send scope,
service window, tariff, or recipient delivery. Bruno still needs to perform the
canonical user actions when ready. WhatsApp enrollment is not voice-call consent
and does not remove the alarm's verified-phone guard.
