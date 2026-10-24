# Restricted operational pilot — code preparation, no activation

Bruno authorized up to three operational replies to his already verified WhatsApp, for at most 15 minutes and US$0.05 total, without AI or voice. Approval message: `Sentinel_366aa9592b448191bea5d2f60bebb46a` (24 Oct 2026 18:03:28 UTC). This is a separate approval from the consumed neutral connectivity test. No environment, credentials, recipient, provider profile, consent or real quota is changed by this PR.

## Published caller, preserved guards

The existing prepared bootstrap keeps its restricted caller import and HTTP listener/lifecycle. The caller accepts the existing `single-neutral-reply-v1` policy unchanged, or a new `operational-pilot-v1` policy. Missing or invalid policy stays OFF before credentials/SQL. The original approval and its durable limit 1 remain untouched; a changed ID cannot be used as a reset for either mode.

The new mode pins its own approval, the SHA256 of the one approved normalized recipient (phone itself not embedded), a required immutable `admission.ownerSha256` (SHA256 of the approved account public_id), maxAttempts exactly 3, maxCostUsd exactly `0.05`, and a validity interval at most 900000 ms. It requires `singleMessageTest:false`, `operationalPilot:true`, `canonicalLinkHandshake:false`, `canonicalLinkHandshakeOnly:false`. It cannot create links, accept proof codes or produce link-confirmation replies. Existing raw-body HMAC before parse/SQL, Render host/path/service binding, sealing, canonical link/account/consent checks, TTL, durable claim, no-retry marker, bounded transport, revocation and shutdown remain unchanged.

The store checks that owner digest at every canonical lookup, before claiming/enqueue, reserving, invoking the engine and sending. The engine and proposal stamp are checked again against the same captured digest. Reassigning the phone to a different consenting account cannot transfer this approval; missing owner pin fails closed. The digest must be confirmed for Bruno’s canonical account at activation without exposing identity.

The non-secret canonical link-status reader uses the same restricted policy validator as the caller so an existing verified link is not falsely hidden when the pilot mode is selected. Linking destination/start remains unavailable because both pilot handshake flags are false. Expired pilot windows do not erase the existing canonical link proof or allow a new paid reply.

Only these text requests are admitted (trimmed, NFC, case-insensitive):

1. `menu` → existing canonical `/menu`, one complete menu text.
2. `qual minha próxima jornada?` → existing canonical `/proximo` and saved account snapshot/journey selector.
3. `q hrs a van me pega no hotel?` → existing canonical logistics guard, preserving absence/clarification when hotel pickup is not confirmed.

This is deliberately not a release of every menu action. Other numbers, commands, injected suffixes, weather, nearby searches, preference mutations, linking codes, old neutral trigger, arbitrary free text, AI and voice are not admitted. The configured canonical binding still supplies `location:null`/TEXT. The next-program path may persist its existing conversation context; an invocation-local AsyncLocalStorage guard filters the real async snapshot persistence before memory/DB changes, allowing only the existing conversation-context patch. Other metadata and roster/onboarding/humor preference patches are discarded. Identity onboarding is bypassed only in this explicit read-only invocation scope; the general engine retains its behavior. The scope stays attached through actual handler settlement and does not leak to other invocations. Missing data must not become an invented pickup or hotel. A response containing a clarification still consumes the pilot category/attempt.

## Durable reservations

Each category has one durable used slot in the existing state table, in namespace `crewcheck-infobip-pilot-v1:`. The key includes sender, fixed approval, recipient and canonical category digest; the payload is only version/kind/used. No message content, phone, account name or secret is stored in this payload. A new inbound message ID, restart or mode change cannot retry an occupied category. Slots are not automatically refunded or expired; three finite metadata rows preserve the no-repeat bound.

The category slot, the existing quantity reservation and the existing preparing marker commit in one dispatch transaction before engine/provider I/O. The separate quantity ledger enforces at most 3 attempts across categories. An uncertain result, lost ACK, cancellation, expiry or unavailable answer never restores quota or a slot. Existing sealed inbound content still expires under its current rules. Delivery reports and SEEN retain their existing correlation/dedup semantics; provider acceptance is not delivery.

## Tariff and the shared US$20 envelope

Configuration must include two explicit non-secret operator evidence objects. There are no live defaults:

* `operationalPilotPricing`: currency `USD`, category `service-text`, country `BR`, sender matching configuration, `unitUpperMicroUsd` positive integer with three times that amount at most 50000, bounded nonempty `sourceId`, integer `verifiedAt`/`validUntil` covering the pilot interval.
* `operationalPilotBudget`: currency `USD`, `monthlyLimitMicroUsd:20000000`, `allChannelsIncluded:true`, integer `remainingMicroUsd` between 50000 and 20000000, integer `verifiedAt`/`validUntil` covering the interval.

Admission and final send deny when either evidence snapshot is from the future, older than 15 minutes, expired or absent. Quantity plus the unit ceiling bounds the application's approved pilot reservation to US$0.05 under that verified price assumption. These fields are host/operator assertions, NOT independently verified provider prices, atomic accounting for other channels, or proof of a hard financial stop. They cannot certify the total Infobip invoice. Before activation an authorized operator must verify current tariff/category/session, account balance, existing charges, outstanding/unknown voice/message costs, fixed fees/taxes and other consumers; preserve the one shared US$20 envelope. Unknown spend or inability to bound exposure remains an activation blocker. This PR does not wire the separate credit/billing candidate, Asaas grants, a new budget service or a new paid API.

Preflight must also revalidate the canonical binding/consent for the approved account, unchanged sender/base URL and API capability, old test ledger consumed 1/1, and no prior new-pilot uncertain attempt. No approval ID is minted by runtime, deployment or tests. The 15-minute window is created only after reviewed code is LIVE and Bruno/operator are ready; no window is opened by this change.

## Test scope

Raw tests use synthetic accounts, phones, quotes, budget observations and transports. They cover exact input scope, HMAC rejection before SQL, four concurrent copies of one message, three distinct category replies, quantity/slots across application recreation, uncertain transport with a different-message-ID replay of the same category, expiry/revocation during engine work and approved-owner substitution before the first receipt, after enqueue and during the engine. InnoDB cases separately change the canonical public_id before receipt and after enqueue, proving zero engine/send/quota. Prepared cases also use pending/expired onboarding with comic preferences, actual async save implementation and a prohibited onboarding/humor patch, proving only conversation context persists. The real approved-recipient pin is tested negatively with a synthetic number; lower application/production layers are explicitly injected with that synthetic recipient so no private phone is committed to fixtures.

Prepared tests extract the actual materialized HTTP bootstrap and canonical binding/wrapper. Operational cases invoke the actual shared menu, canonical journey engine/formatter and logistics guard with synthetic snapshot storage; external capabilities fail if invoked, and only the existing conversation-context patch is allowed. The generated journey bridge is compiled by the same existing build helper before these cases. The neutral test and its original gate remain in the same regression.

The existing owned MySQL8.4 runner has no network/published ports. Added cases exercise independent-connection concurrent dispatch, category/quantity/preparing rollback, the original limit1 ledger alongside the new limit3 ledger, and an uncertain category retained across an actual MySQL and process restart. A different category may use remaining quota; the uncertain category cannot. No database/schema migration is introduced for live use. MySQL/restart results must be read from exact-HEAD CI before approval; local serialized fixtures are not evidence of MySQL isolation.

Remaining activation gates: independent review; exact raw/prepared/MySQL/restart and repository CI; current main composition; OFF publication and health; actual fresh tariff/shared-cost preflight; separately coordinated policy edit for this already authorized pilot. No general channel activation, Pulse announcement, new credentials, voice call, grant or charge is included.
