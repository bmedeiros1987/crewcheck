# CrewCheck

Aplicação operacional para tripulantes, com escala, Radar, Concierge e serviços de apoio.

## Desenvolvimento

```bash
npm install
npm run dev
```

## Produção

```bash
npm ci
npm run build
npm start
```

## Partner Exchange API v1

A integração B2B é dividida em duas fronteiras independentes:

- **Partner Gate API** — CrewCheck entrega ao parceiro somente portões autorizados pela política de redistribuição da fonte.
- **Partner Roster Exchange** — parceiro entrega ao CrewCheck o PDF raw/original autorizado pelo usuário; o CrewCheck preserva o documento e faz sua própria interpretação.

Documentação:

- `docs/partner-gate-api-v1.md` — REST de portão, política de fonte, webhooks, watches, retries e HMAC.
- `docs/partner-gate-api-v1.openapi.yaml` — OpenAPI 3.1 da Gate API.
- `docs/partner-roster-exchange-v1.md` — vínculo revogável do usuário, ingestão de PDF raw, auditoria, identidade e reprocessamento.
- `docs/partner-roster-exchange-v1.openapi.yaml` — OpenAPI 3.1 da troca de escala.
- `migrations/20260826_018_partner_gate_api_v1.sql` — esquema de Gate API/webhooks.
- `migrations/20260826_019_partner_roster_exchange_v1.sql` — esquema de ingestão/auditoria de escala raw.

As três capacidades externas permanecem desabilitadas por padrão:

```text
CREWCHECK_PARTNER_GATE_EXPORT_ENABLED=false
CREWCHECK_PARTNER_WEBHOOKS_ENABLED=false
CREWCHECK_PARTNER_ROSTER_IMPORT_ENABLED=false
```

A existência técnica da integração não autoriza redistribuição de dados licenciados nem substitui a autorização do usuário para exportação do PDF.
