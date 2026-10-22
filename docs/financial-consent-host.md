# Financial consent host — inactive continuation of #1151

Base: main 1737fcb7 (#1151 published). This change prepares consumers in the existing authenticated financial host. It does not migrate production, enable a financial channel, send messages or change Home/authentication. #1151's original preparation document describes its historical stage; the implementation below supersedes its statements about absent host consumers.

The existing financial capture POST accepts a strictly validated `channel_consent` command. Identity comes from the existing owner-authenticated route, never from command fields. Both the ledger gate and a new injected consent-host gate default OFF. `FinancialChannelConsent`, inside the existing progressive capture details, previews the persisted private binding and revision, requires categories, explicit confirmation and a bounded expiry (1 or 24 hours), and persists grants/revocations through the real SQL adapter. Revocation remains possible after unlink. Concurrent changes conflict on revision. Delayed responses are fenced by session, generation and conversation. No financial channel reader or sender is attached to Telegram.

The canonical capture route also consumes an injected original-source verifier, behind a separate default-OFF gate. A signed fixture protocol binds owner, fingerprint, canonical semantic capture digest and original publication timestamp. The digest uses the existing canonical producer; it excludes only storage id/revision counters and includes money, currency, period, rules, provenance and timing. It is not another financial calculator. Altering amounts while keeping a signed fingerprint does not certify freshness. Exact successful ledger receipts receive immutable proof tied to their revision; interrupted proof writes can be retried through canonical idempotency without duplicating money. Expired proof cannot become fresh through query or replay time.

**Real-source limitation:** no existing employer ingestion source currently proves a global original financial-publication timestamp. No production signing key, issuer or loader is configured. The signed protocol is a tested preparation contract, not a claim that the employer currently supplies signatures. Per-row UpdatedDate, PDF creation, SQL updated_at, import time and request time are not substituted. The default provider returns unavailable; unknown is never zero.

## Tables, impact and rollback

No new migration is introduced here. Previously prepared manual migration `20261020_021_financial_channel_preparation_mysql.sql` adds only:

| Table | Data | Writes after a separately authorized activation |
|---|---|---|
| crewcheck_financial_channel_consents | owner/conversation, revision, explicit scope/categories/expiry/binding/revocation JSON | owner-confirmed grant or revoke |
| crewcheck_financial_source_observations | owner/entry/revision/fingerprint, original/recorded timestamps, evidence digest | verified original-source proof for exact canonical capture receipts |

Existing profiles and bidirectional Telegram state are read/locked for authorization. Existing financial revisions retain their amounts, currencies, periods and history; capture uses the current producer/idempotency rules. No backfill or automatic DDL occurs. Existing account deletion removes optional-table owner rows under the same account lock. Missing schema fails closed.

Rollback: leave both injected host gates and ledger activation OFF; no bot wiring exists to remove. Revert this host/UI delta if necessary. Preserve canonical financial history. Prepared tables can remain inert. Dropping prepared tables requires a separate reviewed operational decision and must not remove canonical revisions. No production migration or rollback was executed.

## Activation prerequisites (not authorization)

After exact-head tests and independent review: an operator must first verify which prepared schema exists in the target database, approve the additive migration if absent, and select an existing authenticated host composition to inject the consent gate. The current platform composition intentionally leaves it false. Explicit per-conversation confirmation still does not itself enable delivery.

Original-source activation additionally requires an authoritative existing ingestion host capable of providing original publication evidence and a verified binding to the exact canonical payload. None is currently identified. Choose and review a bounded source-age policy; do not manufacture a publication timestamp or configure browser-provided evidence. Until then, freshness remains unavailable.

Any future Telegram financial read/send integration requires separate channel consent and operational authorization, current owner/private-link verification, revocation/TTL/freshness revalidation immediately before delivery, and review of the actual sender. This PR supplies neither sender nor activation flag. No real test message is necessary for this preparation.

Validation uses synthetic owners, disposable Ed25519 fixtures, a new tmpfs MySQL 8.4.6 instance with network disabled/private socket and loopback browser traffic only. No real financial information is sent to external models or channels.
