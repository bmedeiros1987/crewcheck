# CrewCheck v13.7.8 — ElevenLabs ENV Alias Restore

Corrige a leitura das variáveis ElevenLabs antigas já configuradas no Render.

## Novos aliases aceitos
- ELEVENLABS_TTS_VOICE_ID
- ELEVENLABS_TTS_MODEL
- ELEVENLABS_TTS_OUTPUT_FORMAT
- ELEVENLABS_TTS_STABILITY
- ELEVENLABS_TTS_SIMILARITY_BOOST
- ELEVENLABS_TTS_STYLE
- ELEVENLABS_TTS_SPEAKER_BOOST

## Diagnóstico seguro
/api/tts/health mostra apenas o nome da variável ativa, nunca o valor.

## Preservado
Parser, motor canônico, Google Calendar, radar, salário/diárias, auth, STT e Import Guardian.
