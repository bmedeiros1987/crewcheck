# CrewCheck v13.7.9 — Telegram Human Voice Reply

## Motivo
O bot estava escrevendo mensagens técnicas como “estou transcrevendo” e “resposta enviada em áudio”. O objetivo é voltar ao comportamento mais humano: parecer que está gravando um áudio para responder a um amigo.

## Implementado
- Remove mensagens visíveis de transcrição/conversão.
- Usa `sendChatAction` com `record_voice` antes de responder.
- Responde por áudio limpo, sem caption técnico.
- Não ecoa “Ouvi: ...” por padrão.
- Fallbacks de erro ficam informais e curtos.
- Mantém opção de eco do transcript apenas se ativado por env.

## Variáveis opcionais
```env
TELEGRAM_CONCIERGE_HUMAN_VOICE_ENABLED=true
TELEGRAM_CONCIERGE_ECHO_TRANSCRIPT=false
TELEGRAM_CONCIERGE_AUDIO_CAPTION=
```

## Preservado
- Parser AIMS/CrewRoster.
- Motor canônico.
- Google Calendar.
- Radar.
- Salário/diárias.
- Auth.
- STT/transcrição.
- ElevenLabs TTS.
- Import Guardian.
