# CrewCheck v13 — Motor Canônico da Escala

## Objetivo

O parser canônico é a fonte da verdade. Não reescrever sem necessidade.

## Regras de data

- Próxima programação deve ser cronológica.
- Nunca escolher o primeiro dia do arquivo como próxima programação.
- Usar data atual do dispositivo/servidor com timezone local.
- Escala de Julho não pode ser interpretada como Junho.
- Roster deve abrir no dia vigente.
- Se hoje houver programação, abrir hoje.
- Se hoje for folga, localizar próxima programação operacional.

## Eventos que exigem deslocamento

Considerar:
- voo;
- reserva em aeroporto;
- reunião;
- treinamento presencial;
- CRM presencial;
- acionamento.

Não considerar:
- folga;
- férias;
- EAD;
- sobreaviso sem acionamento;
- DOP/DO/DOF;
- eventos sem deslocamento.

## Exibição

Cada voo deve ter card próprio, mesmo no mesmo dia.

O card deve conter:
- apresentação;
- decolagem;
- chegada;
- origem;
- destino;
- número do voo;
- tipo;
- tripulação;
- hotel;
- radar;
- meteorologia;
- irregularidades;
- ações.

## Extra/PS

Extra/PS deve aparecer como "Extra", não "Vivo de extra".

## Pernoite diurno

Pernoite diurno é tratado como pernoite:
- mesmo símbolo de hotel;
- mesmas funcionalidades;
- cor diferenciada permitida.

## Próxima Programação

Algoritmo:
1. normalizar eventos;
2. filtrar eventos operacionais;
3. remover eventos passados, exceto evento em andamento;
4. ordenar por data/hora local;
5. selecionar o primeiro;
6. atualizar todos os cards dependentes.
