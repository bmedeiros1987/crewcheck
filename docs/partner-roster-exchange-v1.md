# CrewCheck Partner Roster Exchange v1

Contrato B2B para um parceiro autorizado entregar ao CrewCheck o **PDF raw/original da escala do próprio usuário**, mantendo o CrewCheck como única autoridade de interpretação.

O parceiro fornece o documento de entrada. Ele não fornece jornadas, APZ, pernoites, regras, eventos canônicos ou qualquer interpretação operacional. O CrewCheck preserva o arquivo recebido e executa o seu próprio `server/rosterParser.mjs`.

## Princípios

1. **Sem credenciais da companhia aérea.** Nunca enviar senha, cookie, sessão, token LATAM/MyCrewCare/AIMS ou credencial equivalente.
2. **Autorização do usuário.** O usuário autenticado no CrewCheck cria um `linkToken` revogável e temporário. O parceiro precisa desse token para entregar o PDF daquele usuário.
3. **Vínculo ao primeiro parceiro.** No primeiro uso, o `linkToken` é associado à API key B2B que o utilizou. Outra API key não pode reutilizá-lo.
4. **Raw imutável.** O PDF original é identificado por SHA-256 e guardado criptografado. Reprocessamentos criam novas tentativas; não substituem o raw.
5. **Parser CrewCheck.** O parceiro não decide a interpretação da escala.
6. **Quarentena antes de ativação.** A ingestão B2B não escreve diretamente em `crewcheck_platform_rosters` e não troca silenciosamente a escala ativa.
7. **Identidade.** Quando o CrewCheck já conhece o `crewId` do usuário, um PDF com identidade diferente fica em `identity_mismatch`; se o PDF não permitir confirmar a identidade, fica `identity_unverified`.
8. **Privacidade.** O parceiro recebe somente metadados/status da importação; o conteúdo interpretado é acessível ao próprio usuário CrewCheck.
9. **Idempotência.** O parceiro deve enviar um `externalId` estável ou `Idempotency-Key`.
10. **Fail closed.** `CREWCHECK_PARTNER_ROSTER_IMPORT_ENABLED=false` por padrão.

## Escopo da API key

A credencial do parceiro precisa de:

```text
rosters:write
```

A mesma credencial pode receber também `gates:read`, `webhooks:manage` e `flights:watch` quando o acordo comercial exigir.

## 1. Usuário cria o vínculo

Requer sessão normal do usuário CrewCheck:

```http
POST /api/partner-roster-links
Authorization: Bearer <JWT_DO_USUARIO>
Content-Type: application/json

{
  "label": "CrewTopia",
  "expiresInDays": 30
}
```

Resposta:

```json
{
  "ok": true,
  "linkToken": "rlnk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "link": {
    "id": 17,
    "label": "CrewTopia",
    "tokenPrefix": "rlnk_xxxxxxxxxxxxx",
    "expiresAt": "2026-09-25T18:00:00.000Z",
    "partnerBound": false,
    "crewIdentityPinned": true,
    "active": true
  }
}
```

O valor completo de `linkToken` é exibido apenas nessa resposta. O usuário entrega esse token ao parceiro pelo fluxo autorizado da integração.

O token não contém e-mail, BP, senha ou outro identificador legível.

### Listar vínculos

```http
GET /api/partner-roster-links
Authorization: Bearer <JWT_DO_USUARIO>
```

### Revogar

```http
DELETE /api/partner-roster-links/17
Authorization: Bearer <JWT_DO_USUARIO>
```

A revogação impede novas entregas. A revogação da API key administrativa do parceiro também encerra os vínculos já associados àquela chave.

## 2. Parceiro envia o PDF raw

```http
POST /api/v1/roster-imports
Authorization: Bearer ck_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Idempotency-Key: crewtopia-2026-08-26-user-export-001
Content-Type: application/json

{
  "linkToken": "rlnk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "externalId": "crewtopia-2026-08-26-user-export-001",
  "authorizationReference": "crewtopia-consent-987654",
  "filename": "Roster_Report_Aug_2026.pdf",
  "mimeType": "application/pdf",
  "sourceDocumentCreatedAt": "2026-08-26T12:00:00-03:00",
  "dataBase64": "JVBERi0xLjQK..."
}
```

`authorizationReference` deve apontar para o registro de autorização/consentimento mantido no fluxo entre parceiro e usuário. É evidência de auditoria, não substitui as obrigações jurídicas/contratuais das partes.

A v1 usa JSON + base64. O limite padrão é 8 MiB de PDF; o backend valida `application/pdf`, assinatura `%PDF-` e o tamanho após decodificação.

## 3. Resposta

Quando o arquivo foi preservado e interpretado com identidade compatível:

```json
{
  "ok": true,
  "stored": true,
  "parsed": true,
  "message": "PDF raw preservado e interpretado pelo parser CrewCheck.",
  "import": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "externalId": "crewtopia-2026-08-26-user-export-001",
    "source": "CrewTopia",
    "filename": "Roster_Report_Aug_2026.pdf",
    "mimeType": "application/pdf",
    "fileSha256": "<sha256>",
    "fileSizeBytes": 421337,
    "parseStatus": "parsed",
    "parserVersion": "server-roster-parser-v3@abcdef123456",
    "summary": {
      "sourceFormat": "CrewRosterReport",
      "month": 8,
      "year": 2026,
      "base": "BSB",
      "events": 34,
      "flights": 22,
      "confidence": "alta"
    }
  }
}
```

O parceiro **não recebe** o roster canônico, `rawText`, nome completo ou demais campos interpretados do PDF.

Se o raw foi preservado, mas a interpretação precisa ficar em quarentena, a resposta é HTTP 202 e `parsed:false`.

Estados possíveis:

- `parsed`: interpretação disponível ao usuário CrewCheck;
- `identity_unverified`: o CrewCheck esperava uma identidade conhecida, mas o PDF não permitiu confirmá-la;
- `identity_mismatch`: o PDF pertence a outra identidade;
- `parse_failed`: o raw foi guardado, mas o parser não conseguiu interpretar o documento.

## 4. Consultar status pelo parceiro

```http
GET /api/v1/roster-imports/550e8400-e29b-41d4-a716-446655440000
Authorization: Bearer ck_live_xxx
```

A API key só acessa importações que ela própria enviou.

## 5. Idempotência

O par `(api_key, externalId)` é único.

- repetir o mesmo `externalId` com o mesmo PDF retorna a importação existente;
- reutilizar o mesmo `externalId` para outro PDF retorna HTTP 409 `IDEMPOTENCY_CONFLICT`;
- o mesmo PDF SHA-256 para o mesmo usuário também é deduplicado.

## 6. Acesso pelo usuário CrewCheck

### Histórico

```http
GET /api/partner-roster-imports?limit=30
Authorization: Bearer <JWT_DO_USUARIO>
```

### Última interpretação válida

```http
GET /api/partner-roster-imports/latest
Authorization: Bearer <JWT_DO_USUARIO>
```

### Detalhe

```http
GET /api/partner-roster-imports/{id}
Authorization: Bearer <JWT_DO_USUARIO>
```

Quando `parseStatus=parsed`, o detalhe contém o snapshot criptografado que foi interpretado pelo parser CrewCheck. O PDF raw não é devolvido por esse endpoint.

### Reprocessar com o parser atual

```http
POST /api/partner-roster-imports/{id}/reprocess
Authorization: Bearer <JWT_DO_USUARIO>
```

O CrewCheck descriptografa o raw imutável, executa a versão atual do parser e grava **uma nova tentativa de parse**. O PDF original, seu SHA-256 e a tentativa anterior permanecem preservados.

## 7. Modelo de auditoria

Para cada documento o CrewCheck mantém, no mínimo:

```text
partner API key id
user link id
externalId / idempotency key
authorizationReference
nome do arquivo
MIME
SHA-256 do raw
tamanho em bytes
PDF raw criptografado
data de criação informada pelo parceiro
data de recebimento
parserVersion
parseStatus
diagnósticos/resumo
tentativas de reprocessamento
```

Isso permite reconstruir posteriormente qual documento entrou e qual versão do parser produziu cada interpretação.

## 8. Criptografia

O raw e o snapshot completo interpretado são protegidos com AES-256-GCM.

Configuração de produção:

```bash
CREWCHECK_PARTNER_ROSTER_ENCRYPTION_KEY=<segredo-aleatorio-longo-e-estavel>
```

O Render gera uma chave dedicada no manifesto atual. Não use variável `VITE_` e não compartilhe esse segredo com o parceiro.

## 9. Habilitação

Por padrão:

```bash
CREWCHECK_PARTNER_ROSTER_IMPORT_ENABLED=false
```

Somente habilite depois de:

- formalizar o fluxo de autorização do usuário;
- definir a política de retenção e exclusão do documento;
- aplicar/revisar a migração `20260826_019_partner_roster_exchange_v1.sql`;
- emitir ao parceiro uma API key com `rosters:write`;
- testar com PDFs de homologação sem credenciais de companhia aérea.

## 10. Separação de propriedade intelectual

O contrato técnico foi deliberadamente dividido em duas fronteiras:

```text
Parceiro -> PDF raw/original -> CrewCheck parser -> modelo CrewCheck
CrewCheck -> Gate API/Webhook -> parceiro
```

A entrega do PDF não concede ao parceiro acesso ao parser, regras, heurísticas, jornada canônica ou inteligência do CrewCheck. Da mesma forma, o CrewCheck não precisa das credenciais ou da lógica interna usada pelo parceiro para obter o PDF de forma autorizada.

## 11. Relação com a Gate API

A troca de portões continua sujeita à política de redistribuição por classe de fonte. Um dado que possa ser exibido internamente no CrewCheck não é automaticamente exportável ao parceiro.

Consulte `docs/partner-gate-api-v1.md`.
