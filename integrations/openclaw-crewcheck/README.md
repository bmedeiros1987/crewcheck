# CrewCheck Concierge · OpenClaw adapter (beta)

This directory is intentionally **Concierge-owned** and does not change parser/APZ/journey/compliance/finance, native shell, Wear/TV or shared mobile UI.

## Purpose

OpenClaw is a channel/conversation layer only. CrewCheck remains the source of truth.

```
Telegram (beta first) / WhatsApp (later)
        ↓
OpenClaw
        ↓ trusted requesterSenderId
this adapter
        ↓
POST /api/telegram/concierge/ask
        ↓
existing CrewCheck Concierge
```

The model cannot supply a CrewCheck email, user ID, workspace ID or credential. The adapter maps the **trusted OpenClaw sender identity** to a server-side credential.

## Beta configuration

On the OpenClaw Gateway host:

```bash
CREWCHECK_API_BASE_URL=https://<crewcheck-host>
CREWCHECK_OPENCLAW_BINDINGS_JSON='{
  "<trusted-requesterSenderId>": {
    "bearerToken": "<CrewCheck-authenticated bearer token>"
  }
}'
```

Do not commit real values.

For this beta, install from a trusted checkout:

```bash
openclaw plugins install ./integrations/openclaw-crewcheck
```

## Important limitation

The beta reuses the current authenticated CrewCheck Concierge endpoint. Long-lived production operation should replace session-style bearer credentials with a **CrewCheck-issued, read-only, revocable agent credential** bound to one account/channel. That future backend contract belongs to the appropriate CrewCheck owner and is not implemented here.

## Tool

- `crewcheck_concierge_read(question)`
  - read-only adapter to the existing Concierge facade;
  - identity comes from OpenClaw runtime context;
  - fail-closed when the sender is not linked;
  - no roster writes, alarm writes, parser calls or database access.

## Rollout

1. Telegram + one internal linked account.
2. Validate cross-account isolation and source-cited regulatory answers.
3. Add product-issued read-only agent credentials.
4. Only then evaluate WhatsApp and broader rollout.

Do not treat plugin tests as Mobile/production homologation.
