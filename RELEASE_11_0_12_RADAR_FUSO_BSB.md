# CrewCheck v11.0.12 — Radar no dia local + fuso padrão BSB

## Objetivo
Alinhar o Radar de Voos ao comportamento dos monitores de aeroporto, mantendo o sistema inteiro no padrão Brasília/BSB e adicionando preferência de fuso para o usuário.

## Ajustes principais
- Radar de Voos carrega somente o dia atual do aeroporto selecionado.
- Padrão do sistema mantido em Brasília/BSB (`America/Sao_Paulo`).
- Nova configuração em Configurações > Preferências: Brasília/BSB, horário local do dispositivo, UTC ou fuso específico.
- Radar mostra badge informando que usa o dia local do aeroporto e qual fuso o sistema está usando.
- Backend passa a calcular data do radar pelo aeroporto, com cache por dia/aeroporto.
- Filtro do monitor oficial corta seções de voos de outros dias quando o painel público mistura hoje e amanhã.
- FlightStats/Cirium usa hora local do aeroporto na montagem da consulta.

## Validação
- `npm run check` aprovado.
- `npm run build` aprovado.
