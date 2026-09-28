# CrewCheck v13.3.5 — Physical Timeline / Anti-Teleport Roster

## Problema

Após a v13.3.4, a escala ficou mais legível, mas ainda podia misturar pernas impossíveis dentro do mesmo dia.

Exemplo observado:

- `LA3838 GRU → CXJ`
- `LA3730 BSB → FOR`
- `LA3730 BSB → FOR` duplicado
- `LA3839 CXJ → GRU`

Isso quebra a continuidade física: após `GRU → CXJ`, a próxima perna da mesma sequência não pode sair de `BSB`.

## Correção

- Deduplicação de pernas quase iguais do mesmo voo/rota/horário.
- Seleção da melhor sequência física conectada dentro do dia.
- Remoção de pernas que causam teletransporte quando há uma cadeia física confiável.
- Cards compactos menos poluídos no Roster.

## Regressão

- `scripts/regression-v13-3-5-physical-timeline.mjs` valida que `LA3730 BSB → FOR` é removido do bloco `GRU → CXJ → GRU`.
