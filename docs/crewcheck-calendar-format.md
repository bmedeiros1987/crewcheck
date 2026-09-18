# Formato CrewCheck para Google Agenda

O exportador ICS e a sincronização Google usam o mesmo formato. No modo Escala limpa, cada jornada de voo aparece como `CrewCheck · Voo · GRU → BSB → GRU`. A descrição contém data, referência de fuso, apresentação, término, etapas numeradas e hotel quando informado. Horários ausentes são identificados como não informados.

Exemplos de outros títulos: `CrewCheck · DO · Folga`, `CrewCheck · Reserva no aeroporto · ASB`, `CrewCheck · Sobreaviso em casa · HSB`.

Os horários mantêm a referência America/Sao_Paulo já usada pelo exportador; o Google pode convertê-los para o fuso de exibição do usuário. Folgas são eventos de dia inteiro, com término exclusivo no dia seguinte. O modo de voos detalhados permanece disponível. Para incluir reservas e treinamentos, selecione Escala limpa (modo all).

Validação: `node scripts/regression-crewcheck-calendar-format.mjs`. Nenhum evento real foi enviado ao Google durante os testes. A sincronização existente ainda substitui eventos CrewCheck no período; esta mudança não altera esse algoritmo.

Validação do estado preparado: preparação completa, regressão do calendário, TypeScript e build Web aprovados. No Windows, use checkout com LF (core.autocrlf=false): os scripts históricos de preparação dependem de âncoras literais, inclusive Java. O workflow crewcheck-calendar-export repete esses gates no Linux.

