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
| `WHATSAPP_ACCESS_TOKEN` | token permanente de usuário de sistema da Meta; não usar token temporário do Graph Explorer em produção |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp → Configuração da API → ID do número de telefone |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | WhatsApp → Configuração da API → ID da conta do WhatsApp Business |
| `WHATSAPP_BUSINESS_NUMBER` | número oficial exclusivo do CrewCheck em formato internacional; `CREWCHECK_WHATSAPP_NUMBER` é aceito como alias de compatibilidade |
| `CREWCHECK_WHATSAPP_AUDIT_SALT` | segredo aleatório exclusivo para anonimizar identificadores e proteger o vínculo |

A versão da Graph API pode ser fixada opcionalmente por `WHATSAPP_GRAPH_VERSION`; na ausência da variável, o backend usa a versão compatível definida pelo CrewCheck.

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
8. Registre o número oficial e adicione pagamento.
9. Com token permanente e `WHATSAPP_PHONE_NUMBER_ID` no Render, confirme no diagnóstico `outbound: true`.

## Vínculo seguro da conta

O WhatsApp não recebe acesso à escala apenas porque alguém conhece o número oficial do CrewCheck. A conta precisa ser vinculada explicitamente.

Fluxo:

1. usuário autenticado toca em **Vincular WhatsApp** no CrewCheck;
2. o backend gera um código aleatório de seis dígitos, válido por dez minutos e de uso único;
3. somente o hash do código fica no banco;
4. o CrewCheck abre o WhatsApp oficial com o código preparado para envio;
5. ao receber o código pelo número do próprio usuário, o backend associa aquele WhatsApp à conta autenticada;
6. um número já vinculado a outra conta ativa é recusado;
7. o usuário pode desvincular o canal, revogando consentimentos.

O número vinculado não é persistido em texto puro. O banco mantém hash para busca, cópia cifrada para operações futuras autorizadas e apenas os quatro últimos dígitos para identificação na interface.

## Concierge por texto

Depois do vínculo, mensagens de texto recebidas pelo webhook passam pelo mesmo motor de Concierge que atende a escala ativa no app/Telegram. O WhatsApp não mantém um parser ou uma cópia independente da escala.

Nesta etapa estão liberados:

- perguntas textuais sobre programação e próxima atividade;
- consultas já suportadas pelo motor compartilhado, como Saída Inteligente, Radar, meteorologia, hotel, rotina, diárias e conformidade quando disponíveis no contexto ativo;
- resposta oficial pela Cloud API dentro da conversa iniciada pelo usuário;
- deduplicação por `message_id` para evitar respostas repetidas.

Ainda ficam fora desta entrega: áudio, localização, PDF, templates de mensagens iniciadas pelo CrewCheck e alertas proativos. Esses recursos exigem consentimentos e gates próprios.

## Segurança implementada

- validação GET por token e devolução exata de `hub.challenge`;
- validação HMAC SHA-256 do cabeçalho `x-hub-signature-256` no POST;
- confirmação HTTP 200 antes do processamento assíncrono;
- limite de 1 MB por webhook;
- deduplicação imediata em memória e persistente no MySQL quando disponível;
- eventos de auditoria armazenam somente metadados e hashes, nunca o texto das mensagens;
- conteúdo textual recebido existe apenas em memória durante a geração da resposta;
- vínculo de conta usa código temporário, hash e consentimento explícito;
- telefone vinculado protegido por hash e AES-256-GCM, sem texto puro no banco;
- logs exibem somente contagens, status e códigos de erro sanitizados;
- endpoint de saúde não revela tokens, IDs ou número de telefone;
- token permanente, App Secret e demais credenciais ficam somente no ambiente seguro.

## Teste técnico

```bash
node scripts/regression-whatsapp-business-webhook.mjs
```

A regressão cobre verificação, assinatura, privacidade, idempotência, envio oficial, vínculo e conexão do WhatsApp ao motor textual compartilhado do Concierge.
