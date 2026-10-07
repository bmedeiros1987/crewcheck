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
