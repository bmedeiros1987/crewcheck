# CrewCheck v13.6.9 — App Route Fix / Service Worker Off

## Motivo
Após a v13.6.8, a tela HTML segura abriu o app em `/app?safe=1`, mas o roteador React não tinha rota `/app`. Resultado: tela “Page Not Found”.

## Implementado
- `/app` renderiza Home.
- `/home` renderiza Home.
- Shell seguro abre `/app?safe=1&v=13.6.9`.
- Mantida compatibilidade com `/__crewcheck_boot_rescue_1368.html`.
- Nova rota `/__crewcheck_boot_rescue_1369.html`.
- Desativado registro de service worker antigo durante a fase de recuperação.
- Limpeza de caches `crewcheck`, `workbox` e `vite` no boot.
- `/api/health` atualizado para 13.6.9.

## Preservado
- Parser AIMS/CrewRoster.
- Motor canônico.
- Google Calendar.
- Radar.
- Salário/diárias.
- Telegram/despertador.
- Auth.
- Import Guardian.
