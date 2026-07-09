# CrewCheck v13.3.7 — Roster Header Spacing / Micro UI Polish

## Problema

Após a v13.3.6, os rótulos de DR/HSB ficaram corretos, mas o cabeçalho do dia ainda podia aparecer visualmente colado:

- `QUI 09/07Descanso regulamentar`
- `QUA 08/074 voos`

## Correção

- Adicionado separador explícito `·` entre data e resumo do dia.
- O card de `DR` usa título compacto `Descanso`.
- A linha de detalhe mantém `Descanso regulamentar`.
- Preserva o Roster canônico, a continuidade física e o parser AIMS.

## Resultado esperado

- `QUI 09/07 · Descanso regulamentar`
- `SEX 10/07 · Sobreaviso · 10:05 → 21:00`
- `QUA 08/07 · 4 voos · CXJ · 09:03 → 20:00`
