# CrewCheck v13.9.2 — Telegram, ATIS, regulamentação e auditoria visual

## Entrega

- Respostas faladas são enviadas com `sendVoice`, aparecendo como nota de voz nativa do Telegram.
- ElevenLabs continua como sintetizador principal; o texto falado trata ICAO, voo, QNH e horário Zulu com vocabulário aeronáutico.
- `/atis SBXX` consulta METAR e TAF, produz uma leitura meteorológica em português e envia texto mais nota de voz.
- METAR usa cache mínimo de um minuto e TAF de dez minutos, `User-Agent` identificável e fallback temporário para o último reporte.
- O teclado do bot ganha ações nomeadas, emojis, ATIS, ligação com confirmação e emergência.
- A ligação usa o bot auxiliar configurado. A Bot API não oferece ligação nativa; falhas do provedor devolvem a franquia consumida.
- A tela Regulamentação volta a aceitar cálculo manual com Tabela B.1, ACT selecionada, origem da jornada e extensão condicionada.
- O menu web passa a aproveitar até 1180 px em desktop. A regra é aplicada somente a partir de 1024 px, preservando celular e PWA.

## Render

Obrigatórias para o Telegram:

```text
TELEGRAM_BOT_TOKEN
TELEGRAM_WEBHOOK_SECRET
TELEGRAM_PUBLIC_BASE_URL=https://SEU-DOMINIO
CREWCHECK_TTS_PROVIDER=elevenlabs
CREWCHECK_FORCE_ELEVENLABS_TTS=true
ELEVENLABS_API_KEY
ELEVENLABS_VOICE_ID
ELEVENLABS_OUTPUT_FORMAT=opus_48000_128
TELEGRAM_CONCIERGE_HUMAN_VOICE_ENABLED=true
```

Recomendadas:

```text
AVIATION_WEATHER_USER_AGENT=CrewCheck/13.9.2 (contato@seu-dominio)
TELEGRAM_CONCIERGE_ECHO_TRANSCRIPT=false
TELEGRAM_CONCIERGE_AUDIO_CAPTION=
CALLMEBOT_TELEGRAM_CALL_ENABLED=true
CALLMEBOT_TELEGRAM_CALL_USER=usuario_sem_arroba
CALLMEBOT_TELEGRAM_LANG=pt-BR-Standard-A
```

Depois do deploy, execute uma vez `POST /api/telegram/setup-webhook` autenticado conforme a configuração do ambiente. A rota atualiza o webhook, os comandos e o botão de menu.

## Limites operacionais

O ATIS gerado é meteorológico e não contém pista em uso, aproximação nem instrução ATC. A simulação regulatória é apoio à decisão e não substitui ACT, RBAC 117, SGRF/manual aprovado ou a decisão competente da empresa.
