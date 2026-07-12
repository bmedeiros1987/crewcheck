# CrewCheck v13.7.2 — Menu Scroll Rescue

## Motivo
Em alguns Android/iPad/Web, o menu lateral/drawer ficava sem rolagem e os últimos itens não eram acessíveis.

## Implementado
- Scroll forçado e suave no `.cc-sidebar`.
- Scroll forçado e suave no `.cc-drawer`.
- Altura baseada em `100dvh` com fallback para `100vh`.
- `overscroll-behavior: contain`.
- `-webkit-overflow-scrolling: touch`.
- Padding inferior com `safe-area-inset-bottom`.
- Fallback para drawers/menus genéricos por `role="dialog"` e data attributes.
- Versão visual atualizada para 13.7.2.
- `/api/health` atualizado para 13.7.2 quando aplicável.

## Preservado
- Parser AIMS/CrewRoster.
- Motor canônico.
- Google Calendar.
- Radar.
- Salário/diárias.
- Telegram/despertador.
- Auth.
- Import Guardian.
