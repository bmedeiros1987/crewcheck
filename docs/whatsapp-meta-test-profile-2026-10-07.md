# Existing Meta test number — repository preparation only

User supplied nonsecret test identities: Phone ID 1259259633936048, WABA 1374607321298577, number +15556583890. These are recorded, not independently verified or linked. The exposed token must never be used. No service/env/credential/webhook change was performed.

## Safe mock acceptance command

```sh
node scripts/whatsapp-meta-test-profile.mjs
```

Uses existing canonical preparation and sender/menu/dedup/PDF/query fixtures. Each child receives an allowlisted environment with no inherited application credentials; preload blocks fetch, HTTP(S) and socket connections. It never starts server.mjs, mysql2 or AI smoke. Logs show fixture script and PASS/FAIL only. `--live` always fails closed with exit 2. Configuration remains mock by default; allowedRecipients and database attestation are empty placeholders. The manifest is not read by the production server and is not a runtime allowlist.

## Build command for a future isolated checkout

```sh
npm ci --ignore-scripts --no-audit --no-fund && node --import ./scripts/whatsapp-test-network-block.mjs scripts/v139/apply.mjs && node --import ./scripts/whatsapp-test-network-block.mjs scripts/p1-concierge-journey/compile.mjs && node --import ./scripts/whatsapp-test-network-block.mjs node_modules/vite/bin/vite.js build
```

Dependency install accesses the package registry, but no application paid-provider generation is invoked. Preparation/compile/Vite have the test network blocker. Command deliberately bypasses branch-specific npm build hooks and scripts/ai-provider-smoke.mjs. Full dependency build is not validated by the mock runner; run only on the reviewed exact commit in an isolated checkout. Do not apply this command to Render now.

Read-only comparison of old deployment commit d212a543 confirmed ai-provider-smoke generates with every enabled provider and exits 2 when none enabled. Do not retain that smoke in a Meta test build. Existing production render.yaml is unchanged; no parallel service was created.

## Live test remains blocked

There is no reliable live isolated-DB attestation/transport guard in this delivery. A boolean env assertion or a database name alone does not prove separation from production. Do not start npm start with this manifest or production env groups. Later live preparation requires: exact-code CI and independent review; dedicated already authorized disposable DB proven distinct from production; guards before all existing DB initialization; one sender matching this test Phone ID/WABA; transport allowlist rejecting every destination except the two securely entered verified testers; signed inbound receiver checks; redacted logs; no AI/maps/calls/templates/background scheduler calls; appropriate verified Meta test recipient and free conversation window. Every guard must be executable and tested before a live sender becomes available.

Secure entries later, only in the authorized secret UI: fresh test-scoped WHATSAPP_ACCESS_TOKEN, META_APP_SECRET, WHATSAPP_VERIFY_TOKEN, test-only encryption/audit secrets and isolated DB credentials. No value is requested in chat, provisioned here or reused from the exposed token. Recipient is entered there by the user; do not persist their phone in the committed manifest. Test acceptance: wrong recipient/receiver/DB rejected before side effects; signed own inbound message can receive at most one explicitly authorized reply; no uncertain resend; PDF/query fixtures remain green; zero unrelated provider calls. These live acceptance checks are PENDING, not green.

## Corrected scope: Bruno authenticated, Marina visitor

Bruno is the existing real account user; only Marina is a visitor. Her number has not been supplied and is not guessed. The user will register/verify both recipients in Meta personally; allowedRecipients remains empty. The guest fixture permits one fictional visitor and rejects a distinct authenticated-account actor before menu dispatch. No real recipient is persisted in Git.

The database-free visitor acceptance test injects fictional context into the existing menu, blocks location/media/account linking/SOS and limits topics. It uses in-memory transport only, with no account/database/provider import. Production authentication is unchanged. This proves synthetic guest menu isolation, not a deployed WhatsApp endpoint.

Bruno's real account cannot work through this stateless guest fixture. The smallest real-account path is the existing authenticated, consented account-link flow, with the test sender explicitly scoped and a signed sender/recipient guard. Sharing the production database or adding a service grant is not authorized by the visitor correction. A future narrowly scoped authenticated API bridge would need review of exact permitted read operations (roster/preferences), write operations (PDF import if explicitly included), identity proof, token storage, expiry/revocation and recipient binding before granting access. There is no existing proven bridge here; do not invent an auth bypass or copy real roster data into guest fixtures.

For a live guest demo, a reviewed signed-webhook adapter can use fictional static context without any production database. For Bruno's real account, retain the existing linked account engine only after the exact authenticated path and data/access impact are presented for approval. No persistent grant, credential, service or live adapter was created in this delivery. Mock acceptance is runnable now; both live paths remain pending secure setup and review.
