# CrewCheck AI providers — setup sem expor secrets

Este runbook configura os provedores externos do `AI Gateway`. O CrewCheck continua **local-first**: roster, APZ, compliance, regulamentação e dados brutos do CrewLife/Fem não dependem de LLM externa.

## Regra de segurança

- Nunca cole API keys em issue, PR, chat, código, screenshot ou log.
- Guarde as chaves apenas no ambiente server-side (por exemplo, Render Environment).
- Nunca use prefixo `VITE_` para essas chaves.
- Ative um provedor por vez, rode o smoke test e só então ative o próximo.
- `AI_ALLOW_PAID=false` deve permanecer como padrão. Um modelo `strong` só pode rodar quando o deploy e a requisição autorizarem explicitamente.

## 1. OpenRouter — primeiro fallback gratuito

Documentação/rota gratuita: https://openrouter.ai/openrouter/free/apps

1. Entre no OpenRouter e crie uma API key no dashboard.
2. No ambiente server-side configure:

```env
AI_OPENROUTER_ENABLED=true
OPENROUTER_API_KEY=<secret>
AI_OPENROUTER_MODEL=openrouter/free
```

`openrouter/free` roteia automaticamente entre modelos gratuitos disponíveis. Como disponibilidade e latência variam, o CrewCheck deve tratá-lo como fallback, nunca como dependência operacional crítica. O endpoint usado é o `POST /api/v1/chat/completions`, compatível com o contrato oficial do OpenRouter.

## 2. Cloudflare Workers AI — segundo fallback

Guia oficial REST: https://developers.cloudflare.com/workers-ai/get-started/rest-api/

1. No Cloudflare Dashboard abra **Workers AI**.
2. Escolha **Use REST API**.
3. Crie um **Workers AI API Token**.
4. Copie também o **Account ID**.
5. Configure no ambiente server-side:

```env
AI_CLOUDFLARE_ENABLED=true
CLOUDFLARE_ACCOUNT_ID=<account-id>
CLOUDFLARE_AI_API_TOKEN=<secret>
AI_CLOUDFLARE_MODEL=@cf/meta/llama-3.1-8b-instruct
```

A Cloudflare publica uma franquia gratuita diária de Workers AI; confira a página oficial de preços antes de alterar o modelo: https://developers.cloudflare.com/workers-ai/platform/pricing/

## 3. Gemini API — terceiro fallback / modelo leve forte

Chaves oficiais: https://ai.google.dev/gemini-api/docs/api-key

Preços/Free Tier: https://ai.google.dev/gemini-api/docs/pricing

Em setembro de 2026 o Google está migrando para **authorization keys**. Crie uma chave nova no Google AI Studio em vez de reaproveitar uma chave padrão antiga.

Configure:

```env
AI_GEMINI_ENABLED=true
GEMINI_API_KEY=<secret>
AI_GEMINI_MODEL=gemini-3.8-flash
AI_GEMINI_TIER=light
```

No nível gratuito, a política do Google pode permitir uso do conteúdo para melhoria de produtos. Por isso o CrewCheck só deve enviar o contexto previamente minimizado pelo `privacy.mjs`; dados íntimos brutos do CrewLife/Fem continuam proibidos.

## 4. Controles globais recomendados

Para provedores gratuitos, a latência pode ser bastante variável. O smoke test usa janela mais larga do que a experiência normal do produto.

```env
AI_KILL_SWITCH=false
AI_ALLOW_PAID=false
AI_TIMEOUT_MS=12000
AI_SMOKE_TIMEOUT_MS=30000
AI_MAX_RETRIES=1
AI_CIRCUIT_FAILURE_THRESHOLD=3
AI_CIRCUIT_RESET_MS=60000
AI_DAILY_BUDGET_UNITS=1000
AI_RATE_LIMIT_PER_MINUTE=30
```

`AI_TIMEOUT_MS` controla o gateway em uso normal. `AI_SMOKE_TIMEOUT_MS` existe apenas para testar conectividade do provedor sem confundir fila/latência de free tier com erro de credencial.

O orçamento/rate limit atual é process-local. Antes de escalar horizontalmente, mover contadores para um storage atômico compartilhado.

## 5. Smoke test seguro

Depois de cadastrar as variáveis no ambiente server-side, execute:

```bash
node scripts/ai-provider-smoke.mjs
```

O teste usa apenas o prompt sintético `Responda apenas OK.` e não lê escala, usuário, CrewLife ou banco. Ele imprime somente status/provedor/modelo/latência e código HTTP quando houver erro, sem exibir a API key.

Um timeout agora é reportado como timeout real; ele não deve ser convertido em `empty_response`. Se o OpenRouter gratuito estiver apenas lento, o smoke aguarda até `AI_SMOKE_TIMEOUT_MS` antes de falhar.

## 6. Ordem de ativação sugerida

1. `OpenRouter/free`
2. `Cloudflare Workers AI`
3. `Gemini Flash`
4. modelos pagos somente depois de telemetria real e autorização explícita

Se um provedor falhar, o gateway tenta o próximo dentro dos limites configurados. Se todos falharem, a resposta externa falha fechado; fatos operacionais nunca são inventados por fallback de IA.
