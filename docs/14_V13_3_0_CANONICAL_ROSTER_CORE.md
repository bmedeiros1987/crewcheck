# CrewCheck v13.3.0 — Canonical Roster Core

Correção estrutural do coração da escala.

## Problema

O CrewRosterReport podia gerar uma escala visual bagunçada, com eventos deslocados, dias misturados e Próxima Programação apontando para voo já encerrado.

## Solução

- Novo `canonicalRoster.ts`;
- `normalizeRosterDays(roster)`;
- `buildCanonicalRosterEvents(roster)`;
- `selectNextRosterEvent(events, now)`;
- Parser CrewRosterReport devolve roster normalizado;
- Home consome eventos canônicos;
- Escala agrupada por data publicada real;
- Regressão LA3455 vs LA3838.

## Preservado

- Layout Premium/EFB;
- Parser canônico AIMS;
- Funcionalidades existentes;
- Sem credenciais, senha, MFA, SMS, cookies ou sessão.
