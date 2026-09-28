# CrewCheck v13.6.7 — Boot Rescue / Safe Start

## Objetivo
Corrigir travamento na tela inicial e permitir recuperação mesmo quando a SPA não abre corretamente.

## Implementado
- Modo seguro por URL: `/?safe=1&v=13.6.7`
- Reparo por URL: `/?repair=1&v=13.6.7`
- Página independente do React: `/crewcheck-repair`
- Abertura em Diagnóstico sem renderizar cockpit primeiro
- Abertura de vídeo com timeout automático e tratamento de erro/stall
- Limpeza de cache/service worker antigo preservando login, escala ativa e preferências operacionais
- ErrorBoundary preservando mais chaves críticas e redirecionando para modo seguro

## Preservado
- Parser AIMS/CrewRoster
- Motor canônico
- Google Calendar
- Radar
- Salário/diárias
- Telegram/despertador
- Auth
- Continuidade física
- Import Guardian

## Pós-deploy
Abrir: `/crewcheck-repair` e tocar em “Reparar e abrir modo seguro”.
