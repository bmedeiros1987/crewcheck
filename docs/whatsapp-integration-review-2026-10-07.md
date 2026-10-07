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
