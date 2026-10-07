# WhatsApp: revisão de integração em 7 outubro 2026

PR 888 permanece draft, sem merge, deploy, alteração de configuração, consulta de dados de usuários ou mensagens reais. Base revalidada: main 81ec0bcd858a0c9f91e7eccb07dada98350f28d8; head remoto inicial ec6ee1727ecbe5c1ae484978f2967d78cfe9bc44. PR890 já integra a main. Checkout independente.

## Mudanças revisáveis

- Integra main na branch existente, preservando preparação com cache/finalizador, fluxo SOS e proteções GPS comum.
- Menu default OFF inclui Amanhã, Escala e Diárias e delega ao motor existente; números continuam disponíveis às seleções POI.
- PDF recebe aviso explícito de indisponibilidade, sem download/importação ou falsa confirmação.
- Cada ID aceito é consumido uma vez no mesmo payload: mensagens repetidas não executam novamente o handler.
- Fixture Wellhub fornece a função real de gate no modo OFF; novo teste de duplicação usa apenas VM e mensagens sintéticas. CI WhatsApp inclui o teste.

## Equivalência e lacunas

| Capacidade | Estado verificável |
| --- | --- |
| Escala/hoje/amanhã/próximo | Adaptador compartilha o motor e snapshot de conta; menu usa comandos canônicos |
| Financeiro | Diárias operacionais (pernoites) pelo motor existente; sem valores monetários inventados; holerite/auditoria não implementados |
| PDF recebido | Integrado localmente atrás de gate independente default OFF; fila, validação, parser canônico e commit transacional testados com fixtures |
| Identidade | Remetente empresarial validado antes do vínculo; email/vínculo/consentimento rechecados antes de resposta privada |
| Isolamento | A/B, troca/revogação/novo vínculo, canal e remetente durante await cobertos por mocks |
| Deduplicação | Memória e INSERT IGNORE; corrigida repetição dentro do payload |
| Idempotência durável | PDF agora usa fila antes do ACK, lease/retry e recibo + snapshot na mesma transação; a dedup do texto mantém seu comportamento existente |
| SOS/GPS | Testes atuais de SOS e GPS voluntário comuns passam; funcionalidades SOS WhatsApp não são anunciadas |

## Evidência sintética e limitações

Preparação canônica executada sobre fontes limpas. Testes menu e sender cobrem OFF/ON, receiver incorreto/ausente, binding, mudança de configuração, callbacks e A/B sem APIs reais. Teste novo cobre payload duplicado e replay. Webhook oficial, diagnósticos 130497, SOS (incluindo encerramento exato) e farmácia/GPS passam. Wellhub materializado: 18/18; harness montado: 17/18, reproduzindo a mesma divergência de montagem na main isolada. Nenhuma regressão nova observada.

Node local v24.21.0; CI usa Node22.13.0. Resultado CI do novo patch precisa ser acompanhado após publicação. Não se presume que todas as suítes ou fluxos de produto estejam verdes.

## Plano atualizado antes de ativar as funções novas

1. Revisar o patch local e publicar na PR888 quando existir autenticação Git suportada, sem novas credenciais neste executor. A PR permanece draft no head remoto anterior.
2. Homologar a fila e as transações em MySQL isolado e revisar concorrência/retention. Os testes atuais usam banco simulado; parser e consultas são reais com fixtures fictícias.
3. Planejar rollout/rollback do modo durável de snapshots: preservar migração somente da própria conta e evitar retorno a cache antigo após novas importações. Gates de PDF/menu não foram alterados no ambiente real.
4. Manter Diárias como consulta operacional; ampliar valores/holerite somente reutilizando produtores financeiros canônicos existentes, sem fórmulas novas nesta fase.
5. A liberação Meta e o envio estão confirmados pelo relato do usuário (13:12 UTC), não são bloqueio. Não solicitar repetição dessa confirmação. Um teste de UMA mensagem foi autorizado posteriormente, mas não foi tentado por falta de caminho suportado com remetente e janela gratuita verificáveis neste executor.

Bloqueios restantes: publicação Git; homologação MySQL real isolada; rollout/rollback do cache; acesso suportado para o teste avulso autorizado. Sem merge, deploy, credenciais novas, mensagens reais ou ativação. Detalhes da implementação e testes: `whatsapp-pdf-design-2026-10-07.md`.
# CrewCierge WhatsApp — readiness review

Reviewed against main 81ec0bcd and local consolidation 6a3a6b22. Remote PR888 remains ec6ee172, draft. No activation, production data, message, token, environment or provider change.

| Capability | Evidence | Gate / remaining work |
|---|---|---|
| Text menus and canonical Hoje/Amanhã/Escala/Próxima/Diárias | Synthetic query parity and menu PASS | Menu gate OFF; exact final code still needs remote CI/review |
| PDF parser and signed webhook → durable queue → snapshot | Real parser on fictional PDF and mocked integration PASS | PDF gate OFF; real MySQL run pending |
| Account/receiver binding, consent, dedup, retry | A/B/relink/race/replay fixtures PASS | No live sender test |
| SOS cancellation and ordinary GPS | Existing regressions PASS | Preserve protections in subsequent review |
| Snapshot ordering and legacy cache reconciliation | Synthetic concurrent/newer/foreign-account cases PASS | MySQL lock/CAS semantics pending |
| Cache rollback after imports | Design warning exists | Do not switch OFF after imports until cache synchronization or durable-read retention has been designed and validated |
| Production Meta delivery | Parent reports Render error 130497 at 15:01–15:02 UTC | External resolution; no retry or exposed-token use |
| Independent review and exact-code remote CI | Not completed for this local consolidation | Required before claiming activation-ready |
| Nightlife during Floripa overnight | Acceptance scenario below | Scope recorded; no new provider or behavior claimed |

## Smallest permitted MySQL validation path

Use an already available disposable MySQL 8 on loopback. No installation, cloud resource, billing or production credentials required by this package. `mysql2` is already declared in package.json. A test-only account named `crewcheck_fixture` must be authorized to create/drop fixture databases; never grant this on production. The script does not read application database variables, always connects to 127.0.0.1, generates a unique database and drops only that database in finally.

```sh
CREWCHECK_TEST_MYSQL_ISOLATED=true CREWCHECK_TEST_MYSQL_PORT=3306 node scripts/regression-whatsapp-pdf-mysql.mjs
```

Only if the disposable instance uses a different test password, supply CREWCHECK_TEST_MYSQL_PASSWORD locally. Do not paste it in chat. Default password is a public fictional fixture value. Test coverage: real InnoDB concurrent receipt claim, receipt/snapshot rollback, delayed roster rejection, snapshot lock serialization, legacy account isolation and real JSON queue CAS with two workers. No outbound transport is used. Without explicit isolated flag the script exits 2; that is BLOCKED, not PASS. Syntax check passed locally; MySQL assertions remain UNEXECUTED because this executor has no MySQL/Docker.

## Synthetic nightlife acceptance scenario

Use a fictional roster with a Florianópolis overnight, canonical city/timezone America/Sao_Paulo, next-duty time and rest constraints, and fake records from the existing places/Concierge adapter. Do not name real venues or assert real opening hours in fixtures. Request nightlife suggestions; return at most three options only when the existing source supports the requested category. Require location opt-in before using coordinates; absent hotel/location must produce an honest clarification or city-level result. Account B cannot inherit account A's hotel/coordinates.

Assertions to add in the relevant existing places flow: source timestamps and official opening-hours freshness are respected; unknown or stale hours/prices are labeled uncertain; next duty/rest limits affect the recommendation window; route links contain only necessary destination information and no account, token, room or private hotel data; free-text/private location does not enter SOS or send an alert. No recommendation should fabricate availability. This scenario is an acceptance specification, not a claim that these behaviors were implemented or tested in this PDF patch.
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

## Final scope correction — linked visitor, not anonymous guest

The user clarified: Bruno tests his full authenticated account as on Telegram; Marina is his linked visitor using the same existing role as his mother. The fictional guest test above is retained only as transport/test-isolation infrastructure. It does not implement or prove the requested linked visitor role and must not become the product access path.

Read-only source inspection found the canonical role in server/platform.mjs: allowedPermissions (roster,map,hotels,room,presentation,radar,contact,emergency,chat); handleVisitors invite, accept/login, revoke/update; handlePlatformVisitorTelegram. No WhatsApp visitor route/binding was found in server/whatsapp.mjs. The mother's actual permissions were not read; no assumption is made about which flags she has enabled.

Existing Telegram behavior: invite-token hash is consumed when binding telegram_chat_id; invited state cannot query until first access is completed; active linked visitor and owner's Premium entitlement are checked for ordinary queries. /escala shows up to seven upcoming days and /proximo one only when roster permission is enabled. /hotel exposes only stays marked share_with_visitors, with room and presentation gated independently. No financial permission exists and no financial command is exposed in this visitor handler. map/radar/contact/chat flags belong to the broader existing web role and are not automatically Telegram/WhatsApp grants. /emergencia can notify the owner through email/Telegram when emergency is allowed; do not invoke or enable that side effect during these tests. Family membership does not authorize an unsolicited alert.

Next implementation must reuse an active existing visitor_id + owner relationship and its freshly loaded permissions/revocation, with a separate WhatsApp binding (no reuse of Telegram IDs/tokens, no owner-account impersonation). Dispatch visitor reads through the canonical role-scoped queries and filter before rendering; recheck role/binding before delivery. Never pass ownerEmail as the normal full-account Concierge identity for a visitor. Need synthetic tests for invited/revoked/expired/non-Premium, denied flags, share_with_visitors=false, room/presentation withheld, owner/account crossing and mid-flight revocation. A safe channel binding migration/design and durable DB validation remain required. No binding field/schema/grant was created here.

Bruno's full-account test remains the existing normal consented link flow; do not connect test service to production DB or export his roster merely to satisfy equivalence. Present the exact existing-role read/write and binding impact before any persistent expansion. This role discovery supersedes anonymous visitor assumptions; live linked visitor equivalence is PENDING.
# Linked WhatsApp visitor implementation — local review

Functional local code, default OFF under CREWCHECK_WHATSAPP_VISITOR_ENABLED === 'true'. No real binding, grant, credential, DB access, message, deployment or activation. Bruno retains the normal full-account consented link path; Marina must reference her existing active visitor_id and owner relationship. No mother's permissions or real account data were read.

## Implemented

- Existing authenticated visitor portal now offers link/unlink controls only when the server visitor gate is enabled. The handoff is shown in memory with a manual WhatsApp link; logout invalidates pending UI replies, and no message is automatically sent.
- Authenticated visitor-session POST /api/platform/visitor/whatsapp/link/start requires explicit consent, active existing visitor relationship and owner's canonical Premium entitlement. A random 256-bit, ten-minute handoff code is returned; only its HMAC is persisted. Issuing another code retires earlier handoffs for the same relationship. POST /unlink removes that visitor's bindings/pending handoffs without touching another owner.
- Signed inbound code 'visitante_<token>' links the sender hash to visitor_id + owner relationship + receiver + unique binding revision. Existing JSON state table only; no schema migration or automatic new DDL. Canonical visitor row/code/phone reservation are locked in a transaction and code is consumed once. Active owner-account phone binding conflicts; simultaneous owner linking uses the same phone reservation when the visitor gate is on. No phone plaintext is persisted in these role records.
- Visitor messages are dispatched before full-account linking/Concierge/PDF paths. Bound or conflicted visitor identities never fall through into the full-account engine. Active role, current permissions, Premium, binding revision and configured receiver are rechecked before private delivery. An own incoming message with known recent provider timestamp is required; unknown/future/expired windows cause no send. A durable HMAC receipt provides at-most-once outbound attempt even if ordinary webhook dedup falls back in memory.
- platformVisitorReadReply is shared by the actual Telegram visitor handler and WhatsApp role handler. /escala (up to seven upcoming days), /proximo (one) and /hotel (up to three explicitly shared stays) use existing role-scoped SQL. hotels, roster, room and presentation permissions are preserved. Visitor full-account identity impersonation and financial queries are denied. Location/PDF/audio are rejected without providers or account writes.
- Revoking an existing visitor also clears their WhatsApp handoffs/bindings. Account deletion cleans role/handoff/receipt state scoped to that owner. Dispatch errors expose only VISITOR_UNAVAILABLE, not database/message details. Transport receives the visitor's own sender as recipient, captured expected receiver and inbound reply context.

## Tests and limits

PASS synthetic linked visitor suite exercises actual prepared platform producers, actual Telegram visitor handler, WhatsApp dispatch/inbound/payload duplicate processing, authenticated-route role/consent checks with injected identities, lifecycle/expiry, cross-owner and owner-vs-visitor conflicts, Premium denial, permissions, mid-flight revocation/permission/binding changes, strict messaging window and finance/media/location/SOS denial. All DB/transport/identity fixtures are fictional; this is not live JWT/DB/provider validation.

PASS existing sender/menu/payload dedup, PDF signed integration, query parity, visitor-outage recovery, account-health deletion (4/4), pharmacy/GPS and SOS (requires --experimental-vm-modules). Legacy v13.8.0 platform suite FAILS Kotlin-bom 1.8.22 assertion on both this prepared checkout and isolated prepared main81ec0bcd (generated value 2.0.21), not a new green result. No unrelated fix was made.

The optional local MySQL8 test now includes visitor handoff concurrency, phone reservation, durable receipt and revocation using real InnoDB SQL. Syntax PASS; runtime UNEXECUTED because no MySQL/Docker is available. JSON/locking/adapter behavior is not considered homologated by mocks. Source finalizer is idempotent when invoked directly. Exact-code remote CI and independent review are still pending; no push/merge/deploy.

The existing web visitor portal and authenticated API/channel flow are wired locally behind the gate. Whole TSX syntax and actual handoff/unlink helper consent/logout-race/error cases PASS. Full TypeScript/build/browser and real authentication acceptance remain UNEXECUTED; no real relationship was created. Test-service production DB isolation/access is not proven and was not bypassed. Real Meta messaging is not enabled; parent reports 130497 needing external resolution. Old exposed token is not usable for this work.

Visitor SOS/email/Telegram outreach is deliberately disabled on the new WhatsApp path, even if existing emergency permission is true. Help menu omits it, /emergencia explains the limitation, and ordinary location never enters SOS. Therefore complete Telegram equivalence is NOT claimed: SOS visitor effects, browser/full-build verification, real account acceptance, real MySQL, exact-code CI/review and authorized test sender setup remain pending. map/radar/contact/chat flags are not silently promoted into new commands. The anonymous fixture remains only test infrastructure and is not the linked visitor implementation.
