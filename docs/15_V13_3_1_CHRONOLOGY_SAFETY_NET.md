# CrewCheck v13.3.1 — Chronology Safety Net

Hotfix após v13.3.0.

## Problema

Mesmo com o Canonical Roster Core, se o índice canônico não encontrasse evento futuro/ativo, a Home ainda fazia fallback para o primeiro evento operacional da escala. Isso podia exibir um voo encerrado, como LA3455 FOR → GRU, como Próxima Programação.

## Correção

- Próxima Programação passa a filtrar somente eventos operacionais canônicos.
- Se não houver evento futuro/ativo, não volta para voo antigo.
- FlightCard passa a usar a data real canônica do evento.
- ZeroLeg passa a guardar a data real de startDateTime.
- Adicionada regressão sem fallback para passado.
- Layout Premium/EFB preservado.
- Parser AIMS preservado.
