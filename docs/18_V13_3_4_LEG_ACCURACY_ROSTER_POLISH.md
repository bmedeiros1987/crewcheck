# CrewCheck v13.3.4 — Leg Accuracy & Roster Polish

## Causa

A escala ainda podia herdar `day.isNextDay` e `dutyReport` da jornada em todas as pernas. Isso gerava `+1` indevido e fazia pernas seguintes parecerem ter a apresentação operacional da primeira perna.

## Correção

- `legCrossesNextDay` calcula virada por perna usando `leg.isNextDay` ou `arrival < departure`.
- `buildCanonicalRosterEvents` marca `showPresentation` apenas na primeira perna do dia.
- Pernas seguintes exibem conexão/solo, decolagem e chegada.
- Cidades IATA foram centralizadas em `airports.ts`.
- Contadores do cockpit mostram dias, voos, atividades, folgas e alertas.
- FlightCard separa Status, Aeronave e Matrícula.

## Regressões

- `scripts/regression-v13-3-4-leg-accuracy.mjs` valida `LA3785` sem `+1`, `LA4546` sem apresentação herdada, `CXJ = Caxias do Sul` e que `day.isNextDay` não contamina todas as pernas.

## Preservado

- Correções v13.3.1, v13.3.2 e v13.3.3;
- Filtro de período publicado;
- Anti-artefato `msgsys` / `Updated Date`;
- Layout Premium/EFB;
- Parser canônico AIMS.
