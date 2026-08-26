# CrewCheck Partner Gate API v1

API B2B para parceiros consultarem o portão atualmente exportável pelo Radar do CrewCheck e receberem notificações assinadas quando houver atribuição ou mudança de portão.

## Segurança e licenciamento

A API foi desenhada para falhar fechada:

```bash
CREWCHECK_PARTNER_GATE_EXPORT_ENABLED=false
CREWCHECK_PARTNER_WEBHOOKS_ENABLED=false
CREWCHECK_PARTNER_GATE_DEFAULT_SOURCE_CLASS=unclassified
CREWCHECK_PARTNER_SHAREABLE_GATE_SOURCE_CLASSES=user_reported,crewcheck_verified,public_airport_source
```

Mesmo quando `CREWCHECK_PARTNER_GATE_EXPORT_ENABLED=true`, um portão só sai para o parceiro quando sua classe estiver na allowlist de redistribuição. As classes conhecidas são:

- `user_reported`: informação enviada por usuário e elegível segundo a política CrewCheck;
- `crewcheck_verified`: informação verificada pelo próprio CrewCheck;
- `public_airport_source`: fonte pública cuja reutilização foi validada;
- `licensed_provider`: fornecedor contratado/licenciado;
- `unclassified`: origem não classificada.

Por padrão, `licensed_provider` e `unclassified` **não são exportados**. Não inclua `licensed_provider` na allowlist sem confirmar contratualmente o direito de redistribuição do campo.

A resposta pública usa `source: crewcheck-radar` e não revela nome, chave ou credencial de fornecedor bruto.

## Credenciais

API keys `ck_live_...`/`ck_test_...` são mostradas uma única vez e armazenadas somente por SHA-256. Escopos disponíveis:

```text
gates:read
webhooks:manage
flights:watch
rosters:write
```

O escopo `rosters:write` pertence à troca de PDF raw documentada em `docs/partner-roster-exchange-v1.md`.

Exemplo administrativo:

```http
POST /api/admin/partner-api/keys
Authorization: Bearer <JWT_ADMIN_CREWCHECK>
Content-Type: application/json

{
  "partnerEmail": "parceiro@empresa.com",
  "label": "Parceiro - produção",
  "scopes": ["gates:read", "webhooks:manage", "flights:watch", "rosters:write"]
}
```

O valor completo da chave aparece somente na resposta de criação. Revogar a chave bloqueia consultas, watches, entregas pendentes e vínculos de importação associados.

## Consultar portão

```http
GET /api/v1/flights/LA3729/gate?origin=GRU&destination=BSB
Authorization: Bearer ck_live_xxx
```

Portão exportável:

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
  "sourceClass": "crewcheck_verified",
  "shareable": true,
  "retrievedAt": "2026-08-26T16:30:00.000Z",
  "occurrenceMatch": "live-flight-route"
}
```

Portão existente internamente, mas não redistribuível:

```json
{
  "ok": false,
  "gate": null,
  "terminal": null,
  "gateStatus": "restricted",
  "source": "crewcheck-radar",
  "sourceClass": "licensed_provider",
  "shareable": false
}
```

Portão ainda não conhecido:

```json
{
  "ok": false,
  "gate": null,
  "gateStatus": "unavailable"
}
```

`confidence` é um score de qualidade do Radar CrewCheck; não deve ser interpretado como probabilidade estatística de correção.

## Identidade da ocorrência

A v1 usa `occurrenceMatch: live-flight-route`. `origin` e `destination` são recomendados na consulta e obrigatórios para watches. A v1 deliberadamente não afirma uma identidade histórica exata apenas por número de voo/data.

## Webhooks

Cadastrar endpoint HTTPS público na porta 443:

```http
POST /api/v1/webhooks
Authorization: Bearer ck_live_xxx
Content-Type: application/json

{
  "url": "https://partner.example.com/webhooks/crewcheck",
  "events": ["flight.gate.updated"]
}
```

O `signingSecret` `whsec_...` é retornado uma única vez e armazenado no CrewCheck com AES-256-GCM.

O backend rejeita localhost, redes privadas, credenciais embutidas na URL, portas diferentes de 443 e redirects. A resolução DNS é validada antes de cada entrega.

## Watches

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

- início entre agora e os próximos 7 dias;
- duração máxima de 48 horas;
- `notifyInitial=true` emite a primeira atribuição;
- `notifyInitial=false` cria baseline e só emite mudanças posteriores;
- o monitor usa lock MySQL para evitar duplicação entre instâncias;
- gates restritos pela política de fonte são removidos antes da camada de watch e não geram `flight.gate.updated`.

## Evento `flight.gate.updated`

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

Primeira atribuição: `previousGate=null` e `reason=assigned`.

## HMAC

Cada entrega contém:

```text
X-CrewCheck-Event
X-CrewCheck-Event-ID
X-CrewCheck-Timestamp
X-CrewCheck-Signature
```

String assinada:

```text
<timestamp>.<raw_request_body>
```

Assinatura:

```text
v1=HMAC-SHA256(signingSecret, timestamp + "." + rawBody)
```

O parceiro deve validar a assinatura em tempo constante, rejeitar timestamp antigo (por exemplo >5 minutos) e usar `X-CrewCheck-Event-ID`/`payload.id` como chave de idempotência.

## Entrega e retries

HTTP 2xx é sucesso. Falhas são repetidas em até 6 tentativas, aproximadamente:

```text
1 min -> 5 min -> 15 min -> 60 min -> 3 h
```

Após falhas consecutivas suficientes, o endpoint é desativado. Histórico recente:

```http
GET /api/v1/webhook-deliveries
Authorization: Bearer ck_live_xxx
```

## Rate limit

Padrão: 60 requisições/minuto/API key, persistido no MySQL e compartilhado entre instâncias.

Headers:

```text
X-RateLimit-Limit
X-RateLimit-Remaining
X-RateLimit-Reset
```

## Configurações

```bash
CREWCHECK_PARTNER_API_RATE_LIMIT=60
CREWCHECK_PARTNER_RADAR_TIMEOUT_MS=4000
CREWCHECK_PARTNER_WEBHOOK_MONITOR_SECONDS=60
CREWCHECK_PARTNER_WEBHOOK_TIMEOUT_MS=8000
CREWCHECK_PARTNER_WEBHOOK_ENCRYPTION_KEY=<segredo-estavel>
```

A chave de webhook deve ser segredo server-side e nunca variável `VITE_`.

## Gate jurídico/licencial

A implementação técnica não constitui autorização para redistribuir dados de terceiros. Antes de mudar uma classe de fonte para exportável, valide contrato/licença, campos permitidos, finalidade, território, volume, retenção e sublicenciamento aplicável.

A política `unclassified -> não exportável` existe justamente para impedir que uma nova fonte passe a ser compartilhada por acidente.
