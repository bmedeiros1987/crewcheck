# CrewCheck Partner Gate API v1

API REST para parceiros consultarem o portão de embarque atualmente conhecido pelo Radar do CrewCheck.

## Segurança e habilitação

A exportação de dados operacionais fica desativada por padrão. Para habilitar em produção, configure:

```bash
CREWCHECK_PARTNER_GATE_EXPORT_ENABLED=true
```

Antes de habilitar, valide se as fontes de dados usadas pelo Radar permitem redistribuição a terceiros. A API externa não identifica o fornecedor bruto; ela expõe `source: crewcheck-radar` e uma confiança derivada da qualidade calculada pelo próprio CrewCheck.

Configurações opcionais:

```bash
CREWCHECK_PARTNER_API_RATE_LIMIT=60
CREWCHECK_PARTNER_RADAR_TIMEOUT_MS=4000
# normalmente não é necessário alterar; o padrão aponta para o próprio servidor
CREWCHECK_PARTNER_RADAR_BASE_URL=http://127.0.0.1:4173
# somente para ambientes de teste: emite chaves ck_test_ em vez de ck_live_
CREWCHECK_PARTNER_API_TEST_MODE=false
```

## Emitir uma chave

Somente um administrador autenticado no CrewCheck pode emitir credenciais.

```http
POST /api/admin/partner-api/keys
Authorization: Bearer <JWT_ADMIN_CREWCHECK>
Content-Type: application/json

{
  "partnerEmail": "parceiro@empresa.com",
  "label": "Empresa Parceira - produção",
  "scopes": ["gates:read"]
}
```

A resposta contém a chave completa uma única vez:

```json
{
  "ok": true,
  "message": "Credencial criada. A chave completa é exibida apenas nesta resposta.",
  "key": "ck_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "credential": {
    "id": 1,
    "partnerEmail": "parceiro@empresa.com",
    "label": "Empresa Parceira - produção",
    "keyPrefix": "ck_live_xxxxxxxxxx",
    "scopes": ["gates:read"],
    "active": true
  }
}
```

A chave não é armazenada em texto puro. O banco mantém apenas SHA-256 e um prefixo de identificação.

## Consultar portão

```http
GET /api/v1/flights/LA3729/gate?origin=GRU&destination=BSB
Authorization: Bearer ck_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Accept: application/json
```

Resposta com portão disponível:

```json
{
  "ok": true,
  "apiVersion": "v1",
  "flight": "LA3729",
  "origin": "GRU",
  "destination": "BSB",
  "gate": "325",
  "terminal": "3",
  "flightStatus": "Programado",
  "gateStatus": "available",
  "confidence": 0.87,
  "confidenceBand": "high",
  "source": "crewcheck-radar",
  "retrievedAt": "2026-08-26T15:30:00.000Z",
  "occurrenceMatch": "live-flight-route"
}
```

Quando o Radar ainda não tiver portão, a API retorna HTTP 200 com `gate: null`, `gateStatus: unavailable` e `ok: false`. Isso permite ao parceiro distinguir indisponibilidade de dado de falha de autenticação ou infraestrutura.

## Identidade da ocorrência

Esta primeira versão é propositalmente orientada ao voo operacional corrente. O contrato `occurrenceMatch: live-flight-route` deixa explícito que a API não afirma correspondência histórica por data. Para reduzir ambiguidades, recomenda-se enviar `origin` e `destination` sempre que conhecidos.

Uma versão futura pode adotar uma chave canônica de ocorrência baseada em voo + aeroporto + data/hora operacional, reaproveitando o módulo `radar-occurrence-identity` do CrewCheck.

## Rate limit

O padrão é 60 requisições por minuto por credencial. A resposta inclui:

```text
X-RateLimit-Limit
X-RateLimit-Remaining
X-RateLimit-Reset
```

Excesso retorna HTTP 429 e `code: RATE_LIMITED`.

## Listar e revogar chaves

Listagem administrativa:

```http
GET /api/admin/partner-api/keys
Authorization: Bearer <JWT_ADMIN_CREWCHECK>
```

Revogação:

```http
DELETE /api/admin/partner-api/keys/1
Authorization: Bearer <JWT_ADMIN_CREWCHECK>
```

## Códigos principais

- `INVALID_API_KEY` — chave ausente, inválida ou revogada.
- `INSUFFICIENT_SCOPE` — credencial sem `gates:read`.
- `RATE_LIMITED` — limite de requisições excedido.
- `PARTNER_EXPORT_DISABLED` — exportação ainda não habilitada pelo operador.
- `INVALID_FLIGHT` — identificação de voo inválida.
- `INVALID_ORIGIN` / `INVALID_DESTINATION` — IATA inválido.
- `RADAR_UNAVAILABLE` — Radar interno não respondeu.
- `DATABASE_UNAVAILABLE` — banco indisponível.

## Webhooks

Webhooks de mudança de portão não fazem parte deste primeiro contrato. O endpoint REST foi desenhado para ser o núcleo estável; a próxima versão pode acrescentar `flight.gate.updated`, assinatura HMAC, idempotência e tentativas de entrega sem alterar o contrato de leitura acima.
