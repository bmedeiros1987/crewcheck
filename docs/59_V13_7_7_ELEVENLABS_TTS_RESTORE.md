# CrewCheck v13.7.7 — ElevenLabs TTS Restore

## Motivo
Voltar o TTS do CrewCheck para ElevenLabs, mantendo STT/transcrição separado.

## Implementado
- ElevenLabs volta como provedor principal de TTS.
- Novas rotas:
  - `/api/tts/health`
  - `/api/tts/speak`
- Resposta de áudio do Telegram usa ElevenLabs quando o usuário envia áudio e a transcrição gera uma resposta.
- Se ElevenLabs não estiver configurado, o bot cai para resposta em texto sem quebrar o fluxo.
- `reliability/env` passa a mostrar Voz Premium ElevenLabs sem expor segredos.

## Variáveis Render
```env
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
ELEVENLABS_OUTPUT_FORMAT=mp3_44100_128
```

Aliases aceitos:
```env
CREWCHECK_ELEVENLABS_API_KEY=...
CREWCHECK_ELEVENLABS_VOICE_ID=...
CREWCHECK_ELEVENLABS_MODEL_ID=...
```

## Opcional
```env
ELEVENLABS_STABILITY=0.48
ELEVENLABS_SIMILARITY_BOOST=0.78
ELEVENLABS_STYLE=0.18
ELEVENLABS_SPEAKER_BOOST=true
```

## Preservado
- Parser AIMS/CrewRoster.
- Motor canônico.
- Google Calendar.
- Radar.
- Salário/diárias.
- Auth.
- STT/transcrição.
- Import Guardian.
