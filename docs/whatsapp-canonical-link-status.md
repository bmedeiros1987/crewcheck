# Canonical WhatsApp link status and handshake-only preparation

The legacy status endpoint read a row by authenticated account and displayed its
last four digits. That proves a saved record exists, not that the current
Infobip adapter can resolve the approved recipient through the current canonical
phone index. An older index/key, another number with the same last four digits,
or a missing canonical owner can make those two checks disagree. The mismatch
alone does not establish which of those explanations occurred.

`GET /api/whatsapp/link/status?provider=infobip` now distinguishes `recorded`
from `canonicalVerified` / `linked`. It uses only account-scoped SELECTs and the
same canonical phone HMAC used by the receiver, requires one canonical profile,
an active complete link and the exact recipient of the restricted policy. No
phone, hash, key, account identifier or message content is returned. The
provider-less legacy response remains compatible and is not a channel readiness
attestation. The UI treats old responses without the new proof as unconfirmed.

The response reports the temporary test window and challenge availability
separately. Even a compatible saved link does not prove public ingress, a real
provider signature, submission or delivery. Neither an expired window nor a
last-four match is authority to create a challenge or send a reply.

## Proposed personal reconciliation, not activated

After review and separate approval of a new short window, the existing policy
can explicitly set both `canonicalLinkHandshake: true` and
`canonicalLinkHandshakeOnly: true`. All sender, URL, HMAC, service, recipient,
expiry and original approval ID bindings remain required. The latter flag is
strictly boolean and is rejected unless the canonical handshake is enabled.
Missing policy remains OFF. No existing real policy is changed by this code.

In handshake-only mode, only a fresh six-digit user challenge from the one
approved recipient is admitted after raw-body HMAC verification. The exact paid
test trigger is ACK-ignored before SQL. Admission/reservation and the transport
also reject paid reply work, including held work from a previous process.
Canonical challenge completion remains transactional, expiring, account-scoped,
cross-account protected and durable across retry/restart. It sends no link
confirmation, invokes no Concierge and consumes no send quota.

When the actual receiver is verified ready within that approved window, the user
starts the existing authenticated `Vincular WhatsApp` action and sends its code
from their own WhatsApp to the explicit Infobip destination. Then they select
`Conferir vínculo WhatsApp`. Do not generate a code while challenge availability
is false, copy a code into a chat, manually change link rows, rotate a key to
force a match, or silently extend a window. A separate paid reply test requires
its own reviewed active window; never change the approval ID to reset quota.

A missing application ledger row does not prove that no HTTP callback arrived:
the receiver checks the link before claiming ordinary text. Provider HTTP trace
is still needed to distinguish routing, authentication/schema rejection and a
valid callback that was ACKed without authorization to reply.

All validation uses synthetic records and local HTTP fixtures. No real link,
credential, provider profile, environment, schema or message is changed here.

The host and InnoDB scenarios explicitly seed an older paid job in `held`,
recreate the host as handshake-only, and require cancellation with no engine,
provider request or quota reservation. The suite's six checks after an actual
MySQL engine restart cover shared durable invariants; they are not six separate
handshake-only restart scenarios.
