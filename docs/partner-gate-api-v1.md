# CrewCheck Partner Gate API v1

API B2B para parceiros consultarem o portão atualmente conhecido pelo Radar do CrewCheck e receberem notificações assinadas quando houver atribuição ou mudança de portão.

## 1. Princípios de segurança

- A exportação operacional fica **desabilitada por padrão**.
- Chaves `ck_live_...` são mostradas uma única vez e armazenadas apenas por hash SHA-256.
- O segredo `whsec_...` de cada webhook é mostrado uma única vez e armazenado criptografado com AES-256-GCM.
- Escopos são separados: `gates:read`, `webhooks:manage` e `flights:watch`.
- Rate limit é persistido no banco e funciona entre múltiplas instâncias.
- Webhooks aceitam apenas HTTPS público na porta 443; localhost, redes privadas e redirects são rejeitados.
- Revogar a API key cancela entregas pendentes e encerra watches vinculados.
- A resposta externa não revela o provedor bruto usado pelo Radar. A origem pública é `crewcheck-radar`.
- `occurrenceMatch: live-flight-route` deixa explícito que a v1 não afirma identidade histórica por data.

## 2. Habilitação em produção

Mantenha estes dois flags `false` até revisar os contratos/licenças das fontes de dados e autorizar redistribuição a terceiros:

```bash
CREWCHECK_PARTNER_GATE_EXPORT_ENABLED=false
CREWCHECK_PARTNER_WEBHOOKS_ENABLED=false
```

Quando a redistribuição estiver juridicamente/licencialmente autorizada:

```bash
CREWCHECK_PARTNER_GATE_EXPORT_ENABLED=true
CREWCHECK_PARTNER_WEBHOOKS_ENABLED=true
```

Configurações recomendadas:

```bash
# Rate limit por API key, por minuto
CREWCHECK_PARTNER_API_RATE_LIMIT=60

# Timeout do Radar interno
CREWCHECK_PARTNER_RADAR_TIMEOUT_MS=4000

# Normalmente não altere: loopback do próprio servidor
CREWCHECK_PARTNER_RADAR_BASE_URL=http://127.0.0.1:4173

# Monitor de watches; mínimo efetivo 30s
CREWCHECK_PARTNER_WEBHOOK_MONITOR_SECONDS=60

# Timeout de entrega do webhook
CREWCHECK_PARTNER_WEBHOOK_TIMEOUT_MS=8000

# Recomendado: segredo dedicado e estável, server-side, nunca VITE_
CREWCHECK_PARTNER_WEBHOOK_ENCRYPTION_KEY=<segredo-aleatorio-longo>

# Apenas para laboratório: emite ck_test_ em vez de ck_live_
CREWCHECK_PARTNER_API_TEST_MODE=false
```

Se `CREWCHECK_PARTNER_WEBHOOK_ENCRYPTION_KEY` não estiver definido, o backend usa `CREWCHECK_DATA_ENCRYPTION_KEY` e, por último, `CREWCHECK_AUTH_SECRET`. Em produção, prefira a chave dedicada para permitir rotação independente.

## 3. Emitir uma API key

Somente administrador autenticado no CrewCheck.

```http
POST /api/admin/partner-api/keys
Authorization: Bearer <JWT_ADMIN_CREWCHECK>
Content-Type: application/json

{
  "partnerEmail": "parceiro@empresa.com",
  "label": "Empresa Parceira - produção",
  "scopes": [
    "gates:read",
    "webhooks:manage",
    "flights:watch"
  ]
}
```

Resposta:

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
    "scopes": ["gates:read", "webhooks:manage", "flights:watch"],
    "active": true
  }
}
```

Guarde `key` em cofre de segredos. O CrewCheck não consegue recuperar o valor completo depois desta resposta.

## 4. Consultar portão via REST

```http
GET /api/v1/flights/LA3729/gate?origin=GRU&destination=BSB
Authorization: Bearer ck_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Accept: application/json
```

Resposta com portão:

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
  "retrievedAt": "2026-08-26T16:30:00.000Z",
  "occurrenceMatch": "live-flight-route"
}
```

Sem portão conhecido, HTTP 200:

```json
{
  "ok": false,
  "gate": null,
  "gateStatus": "unavailable"
}
```

Isso diferencia “dado ainda não disponível” de erro de autenticação, infraestrutura ou rate limit.

## 5. Cadastrar webhook

A URL deve usar HTTPS público na porta 443.

```http
POST /api/v1/webhooks
Authorization: Bearer ck_live_xxx
Content-Type: application/json

{
  "url": "https://partner.example.com/webhooks/crewcheck",
  "description": "Produção",
  "events": ["flight.gate.updated"]
}
```

Resposta:

```json
{
  "ok": true,
  "signingSecret": "whsec_xxxxxxxxxxxxxxxxxxxxxxxxx",
  "webhook": {
    "id": 12,
    "url": "https://partner.example.com/webhooks/crewcheck",
    "events": ["flight.gate.updated"],
    "active": true
  }
}
```

O `signingSecret` só aparece uma vez. O CrewCheck armazena a versão criptografada.

Listar webhooks:

```http
GET /api/v1/webhooks
Authorization: Bearer ck_live_xxx
```

Desativar:

```http
DELETE /api/v1/webhooks/12
Authorization: Bearer ck_live_xxx
```

## 6. Testar webhook

```http
POST /api/v1/webhooks/12/test
Authorization: Bearer ck_live_xxx
```

O CrewCheck enfileira e tenta entregar um evento `partner.webhook.test`. A resposta inclui o `eventId` e o estado da primeira tentativa.

## 7. Monitorar um voo

Para reduzir o risco de confundir ocorrências repetidas do mesmo número de voo, `origin` e `destination` são obrigatórios e cada watch tem janela limitada.

```http
POST /api/v1/watches
Authorization: Bearer ck_live_xxx
Content-Type: application/json

{
  "flight": "LA3729",
  "origin": "GRU",
  "destination": "BSB",
  "startsAt": "2026-08-26T17:00:00-03:00",
  "expiresAt": "2026-08-27T05:00:00-03:00",
  "notifyInitial": true
}
```

Regras:

- `startsAt`: de agora até 7 dias no futuro.
- `expiresAt`: posterior ao início.
- duração máxima: 48 horas.
- `notifyInitial=true`: a primeira atribuição conhecida (`null -> 325`) gera evento.
- `notifyInitial=false`: a primeira observação apenas cria baseline; só mudanças posteriores geram evento.

Listar watches:

```http
GET /api/v1/watches
Authorization: Bearer ck_live_xxx
```

Encerrar:

```http
DELETE /api/v1/watches/42
Authorization: Bearer ck_live_xxx
```

## 8. Evento `flight.gate.updated`

Exemplo de payload:

```json
{
  "id": "evt_m1abc123_XYZ",
  "type": "flight.gate.updated",
  "apiVersion": "v1",
  "createdAt": "2026-08-26T20:15:00.000Z",
  "data": {
    "flight": "LA3729",
    "origin": "GRU",
    "destination": "BSB",
    "previousGate": "322",
    "gate": "325",
    "terminal": "3",
    "flightStatus": "Programado",
    "confidence": 0.91,
    "confidenceBand": "high",
    "source": "crewcheck-radar",
    "reason": "changed",
    "occurrenceMatch": "live-flight-route",
    "watchId": 42
  }
}
```

Quando o primeiro portão é atribuído, `previousGate` é `null` e `reason` é `assigned`.

## 9. Assinatura HMAC

Cada POST contém:

```text
X-CrewCheck-Event: flight.gate.updated
X-CrewCheck-Event-ID: evt_...
X-CrewCheck-Timestamp: 1787775300
X-CrewCheck-Signature: v1=<hex_sha256>
```

String assinada:

```text
<timestamp>.<raw_request_body>
```

Algoritmo:

```text
HMAC-SHA256(signingSecret, timestamp + "." + rawBody)
```

### Node.js

```js
import crypto from 'node:crypto';

function verifyCrewCheckWebhook({ rawBody, timestamp, signature, secret }) {
  const expected = `v1=${crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`, 'utf8')
    .digest('hex')}`;

  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
```

Além da assinatura, rejeite timestamps antigos — por exemplo, diferença superior a 5 minutos — para reduzir replay.

## 10. Idempotência

O parceiro deve persistir `X-CrewCheck-Event-ID` ou `payload.id`. Se o mesmo ID já tiver sido processado, responda `2xx` sem executar novamente a ação de negócio.

Uma mesma entrega pode ser repetida quando a tentativa anterior falhar ou expirar.

## 11. Retries

O CrewCheck considera sucesso qualquer HTTP `2xx`.

Em falha, são feitas até 6 tentativas, com backoff aproximado de:

```text
1 min -> 5 min -> 15 min -> 60 min -> 3 h
```

Redirects HTTP não são seguidos. Após 20 falhas consecutivas no endpoint, o webhook é desativado automaticamente.

Consultar histórico recente:

```http
GET /api/v1/webhook-deliveries
Authorization: Bearer ck_live_xxx
```

## 12. Rate limit

Padrão: 60 requisições/minuto/API key, compartilhado entre instâncias do backend.

Headers:

```text
X-RateLimit-Limit
X-RateLimit-Remaining
X-RateLimit-Reset
```

Excesso: HTTP 429, `code: RATE_LIMITED`.

## 13. Revogação

Administrador:

```http
DELETE /api/admin/partner-api/keys/1
Authorization: Bearer <JWT_ADMIN_CREWCHECK>
```

Após a revogação:

- consultas REST retornam 401;
- watches vinculados deixam de ser processados;
- entregas pendentes são marcadas `cancelled`;
- novos webhooks/watches não podem ser criados.

## 14. Códigos principais

- `INVALID_API_KEY`
- `INSUFFICIENT_SCOPE`
- `RATE_LIMITED`
- `PARTNER_EXPORT_DISABLED`
- `INVALID_FLIGHT`
- `INVALID_ORIGIN`
- `INVALID_DESTINATION`
- `ROUTE_REQUIRED`
- `INVALID_WATCH_START`
- `INVALID_WATCH_EXPIRY`
- `INVALID_WEBHOOK_URL`
- `PRIVATE_WEBHOOK_ADDRESS`
- `WEBHOOK_ALREADY_EXISTS`
- `WEBHOOK_ENCRYPTION_UNAVAILABLE`
- `RADAR_UNAVAILABLE`
- `DATABASE_UNAVAILABLE`

## 15. Observação sobre licenciamento de dados

A existência técnica desta API não autoriza, por si só, a redistribuição de dados recebidos de terceiros. Antes de ativar `CREWCHECK_PARTNER_GATE_EXPORT_ENABLED`, confirme contratualmente quais fontes do Radar podem ser redistribuídas, em quais campos, territórios, volumes e finalidades.

O contrato externo foi desenhado para não identificar nem retransmitir credenciais ou nomes internos de fornecedores, mas isso não substitui a análise da licença da fonte originária.
