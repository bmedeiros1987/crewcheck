# CrewCheck v13.3.6 — Roster Duty/Rest Polish

## Problema

A escala já estava melhor cronologicamente, mas os dias sem voo apareciam com texto ruim:

- `0 voo(s) · DRApresentação — · Término —`
- `0 voo(s) · HSBapresentação 10:05 · Término 21:00`
- cards DR/HSB mostrando rota artificial `BSB → BSB`.

## Correção

- Remove `0 voo(s)` de dias sem voo.
- DR vira `Descanso regulamentar`.
- HSB vira `Sobreaviso`.
- Reserva, folga, férias e treinamento recebem rótulo amigável.
- Header do dia passa a ser uma frase única, sem texto colado.
- Cards sem voo deixam de mostrar rota artificial `BSB → BSB`.
- Detalhes do modal usam `Local/Base` para eventos sem voo.

## Preservado

- v13.3.5 Physical Timeline / Anti-Teleport;
- v13.3.4 Leg Accuracy;
- v13.3.3 Strict Published Range;
- Layout Premium/EFB;
- Parser AIMS.
