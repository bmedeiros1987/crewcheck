# CrewCheck v13.7.3 — Actual Menu Panel Scroll Rescue

## Diagnóstico
O menu atual do `Home.tsx` não usa `.cc-drawer`. Ele usa `.cz-menu-overlay`, `.cz-menu-backdrop`, `.cz-menu-panel` e `.cz-menu-section`.

## Implementado
- Scroll forçado no painel real `.cz-menu-panel`.
- Overlay com `touch-action: none`.
- Painel com `touch-action: pan-y`.
- `body/html` recebem classe `crewcheck-menu-open` enquanto o menu está aberto.
- O painel recebe `data-crew-menu-panel="true"`.
- `onWheel` e `onTouchMove` não vazam para a página atrás.
- Header do menu fica sticky.
- Última seção ganha safe-area e espaço inferior para alcançar os últimos itens.
- Versão visual atualizada para 13.7.3.

## Preservado
- Parser AIMS/CrewRoster.
- Motor canônico.
- Google Calendar.
- Radar.
- Salário/diárias.
- Telegram/despertador.
- Auth.
- Import Guardian.
