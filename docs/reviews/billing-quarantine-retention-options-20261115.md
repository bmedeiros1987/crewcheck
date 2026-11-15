# Billing quarantine and retention — decision proposal, HOLD

Status: option C is a temporary operational HOLD only; no final retention policy selected, token vault, cleanup job, credentials, provider activation or production migration. See billing-assisted-restore-feasibility-20261115.md for the follow-up investigation. Dates below are engineering proposals for Bruno/privacy review, not legal deadlines. Existing journal hashes are pseudonymous, not anonymous. This proposal does not silently change their retention.

## Verified constraints

- Google recommends backend verification before access and unique purchase-token ownership: [billing security](https://developer.android.com/google/play/billing/security).
- RTDN is a change signal, not complete purchase state; deduplicate message IDs before redundant verification: [RTDN reference](https://developer.android.com/google/play/billing/rtdn-reference).
- `subscriptionsv2.get` requires the original token and authorized Android Publisher access. A SHA-256 digest cannot replace that token: [API contract](https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptionsv2/get).
- Pub/Sub defaults to seven-day unacknowledged retention, configurable from ten minutes to 31 days; acknowledged retention is separate. More than 24 hours of unacknowledged storage can incur charges. This is broker behavior, NOT the app's selected privacy policy or evidence of current project settings: [subscription properties](https://docs.cloud.google.com/pubsub/docs/subscription-properties), [pricing](https://cloud.google.com/pubsub/pricing).
- LGPD does not supply a universal retention period. Necessity/purpose and applicable permitted conservation need review: [official government explanation of articles 15–16](https://www.gov.br/mec/pt-br/acesso-a-informacao/perguntas-frequentes/privacidade-e-protecao-de-dados-pessoais/por-quanto-tempo-os-dados). The primary Planalto page was blocked by its reader challenge during this check; this does not establish a legal basis for either option.

## Minimum proposed quarantine record

Only after authenticating the notification source: provider, verified package/application, digest of message ID, digest of high-entropy purchase token if present, bounded reason enum, received/provider-event timestamps kept separate, first-seen timestamp, expiry timestamp, and reconciliation state. Bind an account pseudonym only AFTER ownership is verified; never guess from email or device. No raw token in option A, full payload, names, email, CPF, payment details, IP address, authorization header, device itinerary or provider response in logs. Hashing does not eliminate linkage/privacy risk.

Duplicate receipt must not extend first-seen expiry indefinitely. Same ID with different evidence is a conflict, not overwrite, account adoption or entitlement. Invalid-source requests must not populate quarantine; durable storage/rate limits/quotas must be reviewed before enabling a receiver. Acknowledging delivery is separate from acknowledging a purchase or granting access; durable acceptance and failure semantics must be tested first.

## Concrete alternatives to decide

| Choice | Proposed data and duration | Benefit | Loss/risk and prerequisites |
| --- | --- | --- | --- |
| A — metadata only | Minimum record above, seven days from first authenticated receipt; delete earlier when purpose ends | Less sensitive material retained; no new token vault | Unknown purchase cannot be rechecked automatically after request ends. User must restore/re-submit token through authenticated flow; no access until verified. Seven days is a proposal, not a guarantee of recovery or legal requirement. |
| B — recoverable token | Same metadata plus encrypted token, maximum seven days from first receipt; delete token immediately after verified reconciliation or earlier purpose end | Worker could re-query unknown receipt without waiting for app restore | Requires reviewed encryption/key ownership, tightly scoped service access, no plaintext logs/backups, deletion/backup policy, audit and verified cost limits. Nothing here demonstrates an existing suitable vault. No new keys/services authorized by choosing this document. |
| C — defer automatic unknown-receipt recovery | Do not activate unknown-receipt receiver until policy and operational controls approved | Avoid premature personal-data persistence and false entitlement | Reconciliation remains manual/authenticated restore; asynchronous completeness and automatic recovery remain unavailable. Existing known-owner processing must not be represented as covering unknown receipts. |

Recommendation to consider: A for a first minimal rollout ONLY if Bruno accepts user-assisted restoration and the privacy reviewer confirms necessity, legal basis and deletion mechanics. If unattended recovery is indispensable, B requires security/cost readiness first; it is not already implemented or approved. C remains the current operational HOLD.

No automatic seven-day extension, indefinite raw token storage or 30-day fallback is selected. A later longer period needs a separately justified purpose, impact and approval, not a broker default copied into application policy.

## Separate lifecycle safety records

Quarantine TTL is NOT the lifetime of a contract lock, purchase-ownership constraint, cancellation admission or unresolved external effect. Expiring a quarantined receipt must never reopen a pending/uncertain operation or permit a second purchase/cancellation. Current cancellation proposal intentionally occupies the same contract until verified lifecycle reconciliation; reactivation needs a verified contract generation policy before release. Retention/erasure of minimal ownership fences and transaction evidence needs its own purpose/duration, deletion behavior and legal assessment. Neither option chooses permanent retention or an arbitrary expiry for these records.

Deletion must distinguish account data, revocation of access, provider subscription cancellation and evidence legally retained for a documented purpose. No automatic account recreation or subscription cancellation follows deletion. Required future checks: immutable-owner isolation, source authentication, worker-only access, no analytics use, quota/size caps, purge/replay tests, crash recovery, expired receipt behavior, backup expiry and a visible recovery action without exposing other owners.

## Question for Bruno — not answered by this proposal

“Para recibos sem dono confirmado, prefere guardar só metadados por até sete dias e pedir restauração pelo app quando necessário (A), ou avaliar um cofre de token criptografado por até sete dias para recuperação automática (B)? Também podemos manter essa automação desligada até resolver privacidade e infraestrutura (C).”

Choosing A/B alone does not approve production activation, new costs, credentials, permissions, encryption services or a legal basis. Independent security/privacy review and tests remain gates. No choice has been presumed.

## Isolated authenticated cancellation integration

`billing-cancellation-admission.mjs` composes the durable journal using injected main-account authentication, transport and read-only probe mocks. Caller fields cannot select owner/provider reference. A committed admission precedes transport; uncertainty never releases it. Revocation after transport can retain known immutable evidence without local application. Only a positive contract-matching trusted probe can acknowledge an uncertain result, with current ownership checked before local application. Results expose only operation/state.

This is not a configured HTTP/native route or a validated real provider adapter. The principal resolver, freshness/revocation contract, external ACK/probe semantics, source authentication and distributed recovery/cost controls remain release dependencies. Tests use disposable MySQL and synthetic principals/providers, not a real account, charge, cancellation or migration.
