# CrewCheck v13.9.7 — escala premium e ganhos por programação

## O que foi corrigido

O layout da escala dependia do seletor global `data-version="13.9.4"`. Quando o sistema avançou para a v13.9.6, a folha deixou de reconhecer a tela e o conteúdo voltou a aparecer sem cards, estreito e concatenado. A nova folha usa o escopo estável `.cc-roster-premium-v1397`, independente da versão global.

## Nova leitura operacional

- painel mensal com dias, voos, pernoites, diárias previstas e produção por KM;
- agrupamento por dia, aceitando várias programações sem sobreposição;
- cards em verde para voo tripulando, cinza para deslocamento/extra, roxo para pernoite, azul para folga, âmbar para reserva, coral para sobreaviso e índigo para treinamento;
- horários de apresentação, partida e chegada com hierarquia visual clara;
- tempo em solo a partir de 60 minutos, hotel, descanso e rotina preservados;
- visual amplo no desktop e empilhamento seguro no celular.

## Finanças conferíveis

Cada item de diária passa a guardar o `eventId` que originou o cálculo. Assim, café, almoço, jantar ou ceia aparecem na programação correta, sem rateio artificial. Cada voo também recebe os dados já calculados pelo motor financeiro: KM diurno, KM noturno, tarifas aplicadas e total previsto.

Nenhuma tarifa nova foi inventada. A tela reutiliza a ACT, as calibrações administrativas e os valores aprendidos de demonstrativos. Os números continuam identificados como estimativa e podem ser auditados nas telas Diárias e Salário.

## Validação

```bash
npm run check
npm run build
npm run regression:v13.9.7:premium-roster
```
