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
| Linked visitor reads/binding | Synthetic actual Telegram/WhatsApp parity PASS | Visitor gate OFF; portal/helper syntax PASS; browser/SOS effects and real MySQL pending |
| Independent review and exact-code remote CI | Review found stay-sharing/unlink P1s; local deterministic fix PASS | Re-review/native MySQL/CI still required before activation |
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
