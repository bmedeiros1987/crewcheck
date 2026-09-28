# CrewCheck v13.7.10 — App Route Guard Hotfix

## Causa
A rota STT ficou com operador vírgula:

```js
if (url.pathname === '/api/telegram/stt-health','/api/tts/health')
```

Em JavaScript isso deixa a condição sempre verdadeira e fazia `/app` retornar o JSON de STT.

## Correção
- `/api/telegram/stt-health` volta a ser rota estrita.
- `/api/tts/health` fica separada.
- `/app` volta ao fallback SPA.
- Regressão bloqueia rotas com operador vírgula.

## Preservado
Parser, motor canônico, calendário, radar, financeiro, auth, STT, ElevenLabs TTS e Import Guardian.
