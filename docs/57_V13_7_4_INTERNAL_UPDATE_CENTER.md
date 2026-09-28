# CrewCheck v13.7.4 — Internal Update Center

## Objetivo
Criar uma Central Admin de Atualizações para hotfix visual e pacote ZIP seguro.

## Recursos
- Menu Admin/Atualizações.
- Leitor de pacote `.zip` com `manifest.json`, `patch.css` e `release-notes.md`.
- Aplicação de CSS runtime sem novo deploy.
- Rollback por botão.
- Endpoint `GET /api/admin/runtime-patch/current`.
- Endpoint `POST /api/admin/runtime-patch`.
- Endpoint `POST /api/admin/runtime-patch/clear`.
- Validação contra JS, tokens, segredos e conteúdo perigoso.
- Suporte a `CREWCHECK_ADMIN_UPDATE_TOKEN` no Render.
- Correção built-in do menu real `.cz-menu-panel`.

## Segurança
O runtime patch aceita apenas CSS. Não executa JavaScript, não grava tokens no código e bloqueia padrões perigosos.

## Pacote CrewCheck
Formato recomendado:

```text
manifest.json
patch.css
release-notes.md
```

## Preservado
- Parser AIMS/CrewRoster.
- Motor canônico.
- Google Calendar.
- Radar.
- Salário/diárias.
- Telegram/despertador.
- Auth.
- Import Guardian.
