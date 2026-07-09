# CrewCheck v13.3.8 — Literal Header Separator Fix

## Problema

A v13.3.7 adicionou um separador `·`, mas ele ainda podia renderizar colado no mobile:

- `DOM 05/07·1 voo`
- `SEG 06/07·1 voo`
- `QUA 08/07·4 voos`

## Correção

- Troca o separador por texto literal com espaços: `{' · '}`.
- Envolve o cabeçalho em `cz-day-headline` para manter uma linha textual previsível.
- Mantém o motor canônico, parser AIMS e continuidade física intactos.

## Resultado esperado

- `DOM 05/07 · 1 voo · LA3730 · 09:30 → 13:04`
- `SEG 06/07 · 1 voo · LA3455 · 04:15 → 08:28`
- `QUA 08/07 · 4 voos · CXJ · 09:03 → 20:00`
