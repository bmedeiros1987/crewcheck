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

## Partner Gate API v1

A integração B2B de portão está documentada em:

- `docs/partner-gate-api-v1.md` — guia de integração, segurança, webhooks, watches, retries e assinatura HMAC.
- `docs/partner-gate-api-v1.openapi.yaml` — contrato OpenAPI 3.1.
- `migrations/20260826_018_partner_gate_api_v1.sql` — esquema MySQL/Aiven.

A exportação de dados para parceiros permanece desabilitada por padrão e depende de autorização expressa das fontes/licenças e dos flags de produção.
