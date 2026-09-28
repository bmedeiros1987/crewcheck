# CrewCheck v13.7.11 — ElevenLabs Exclusive TTS

Garante ElevenLabs como provedor efetivo de TTS e bloqueia fallback Google/legacy quando ElevenLabs estiver configurado.

## Variáveis recomendadas no Render

```env
CREWCHECK_FORCE_ELEVENLABS_TTS=true
CREWCHECK_TTS_PROVIDER=elevenlabs
TELEGRAM_CONCIERGE_SPEECH_PROVIDER=elevenlabs
CREWCHECK_SPEECH_PROVIDER=elevenlabs
CREWCHECK_ALLOW_GOOGLE_TTS_FALLBACK=false
CREWCHECK_INFOBIP_USE_GOOGLE_TTS_AUDIO=false
CREWCHECK_INFOBIP_GOOGLE_TTS_REQUIRED=false
TTS_API_ENABLED=false
SGLKC_TTS_API_ENABLED=false
```

## Preservado
Parser, motor canônico, calendário, radar, financeiro, auth, STT, aliases ElevenLabs e Import Guardian.
