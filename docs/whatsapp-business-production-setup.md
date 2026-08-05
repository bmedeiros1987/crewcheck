# WhatsApp Business Platform — configuração de produção do CrewCheck

## Endpoint oficial

- Callback URL: `https://crewcheck.online/api/whatsapp/webhook`
- Diagnóstico sem segredos: `https://crewcheck.online/api/whatsapp/health`
- Certificado de cliente/mTLS: desativado nesta fase

## Variáveis obrigatórias no Render

Crie os valores diretamente no painel do Render. Não grave valores reais no GitHub.

| Variável | Origem |
|---|---|
| `WHATSAPP_VERIFY_TOKEN` | segredo aleatório criado para validar o webhook; o mesmo valor deve ser informado no painel da Meta |
| `META_APP_SECRET` | Meta for Developers → Configurações do app → Básico → Chave secreta do app |
| `WHATSAPP_ACCESS_TOKEN` | token permanente do usuário de sistema da Meta |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp → Configuração da API → ID do número de telefone |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | WhatsApp → Configuração da API → ID da conta do WhatsApp Business |
| `WHATSAPP_BUSINESS_NUMBER` | número oficial exclusivo do CrewCheck, somente no Render |
| `CREWCHECK_WHATSAPP_AUDIT_SALT` | segredo aleatório exclusivo para anonimizar identificadores em auditoria |

Sugestão para gerar os dois segredos aleatórios localmente:

```bash
openssl rand -hex 32
```

Use valores diferentes para `WHATSAPP_VERIFY_TOKEN` e `CREWCHECK_WHATSAPP_AUDIT_SALT`.

## Ordem no painel da Meta

1. Faça o deploy da versão que contém o webhook.
2. Abra `https://crewcheck.online/api/whatsapp/health` e confirme:
   - `inbound: true`;
   - `verifyTokenConfigured: true`;
   - `appSecretConfigured: true`.
3. Em **WhatsApp → Configuração → Webhooks**, informe:
   - URL de callback: `https://crewcheck.online/api/whatsapp/webhook`;
   - Verificar token: o valor exato de `WHATSAPP_VERIFY_TOKEN`.
4. Mantenha **Anexar certificado de cliente** desativado.
5. Clique em **Verificar e salvar**.
6. Em **Campos do webhook**, assine o campo `messages`.
7. Publique o app antes de esperar eventos reais de produção.
8. Registre o número oficial, adicione pagamento e envie a mensagem de teste pelo painel.

## Segurança implementada

- validação GET por token e devolução exata de `hub.challenge`;
- validação HMAC SHA-256 do cabeçalho `x-hub-signature-256` no POST;
- confirmação HTTP 200 antes do processamento assíncrono;
- limite de 1 MB por webhook;
- deduplicação imediata em memória e persistente no MySQL quando disponível;
- banco armazena somente metadados e hashes, nunca o texto das mensagens;
- logs exibem somente contagens e códigos de erro sanitizados;
- endpoint de saúde não revela tokens, IDs ou número de telefone.

## Teste técnico

```bash
node scripts/regression-whatsapp-business-webhook.mjs
```

A integração desta etapa recebe mensagens e atualizações de status com segurança. O envio automático, templates, consentimento e vinculação de usuários continuam nas próximas entregas da issue #219.
