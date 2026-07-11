# CrewCheck v13.6.5 — Telegram Concierge + Smart Wakeup Restore

## Objetivo
Restaurar a camada de concierge Telegram e Despertador Inteligente, preservando os motores críticos.

## Implementado
- Health detalhado do Telegram.
- Webhook Telegram com respostas amigáveis.
- Envio manual/teste para Telegram.
- Setup de webhook quando `CREWCHECK_PUBLIC_URL` estiver configurado.
- Health do Despertador Inteligente.
- Prévia/teste do despertador.
- Tela do Despertador com:
  - canal Telegram;
  - canal ligação;
  - ligação + Telegram;
  - chat ID;
  - telefone com DDI;
  - antecedência;
  - soneca local;
  - lembrete local;
  - status de canal.

## Variáveis
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_DEFAULT_CHAT_ID`
- `CREWCHECK_PUBLIC_URL`
- `INFOBIP_API_KEY`
- `INFOBIP_BASE_URL`
- `CALLMEBOT_API_KEY`

## Preservado
- Parser AIMS/CrewRoster.
- Motor canônico.
- Radar.
- Google Calendar.
- Salário/diárias.
- Server auth.
- Continuidade física.
- Import Guardian.

## Limites
O webhook responde sem expor detalhes técnicos. Para respostas personalizadas com a escala de cada usuário no Telegram, uma etapa futura deve vincular chat ID ao usuário e à escala ativa no backend.
