# CrewCheck v14.3.30 — CrewRosterReport com pairing iniciado antes do período

Corrige CrewRosterReport em que o primeiro pairing começa no mês anterior (`<==`) e continua por vários dias com marcadores `(+1)`, `(+2)` e `(+3)`.

A preparação passa a:

- separar jornadas pelo horário de apresentação publicado antes da primeira atividade de cada nova jornada;
- manter conexões noturnas sem nova apresentação dentro da mesma jornada;
- recalcular `isNextDay` relativamente à data real da jornada, em vez de tratar todo `(+n)` como virada interna;
- preservar somente os dias dentro do período publicado após a normalização canônica;
- resgatar atividades `MCK` com data, início e fim próprios.
