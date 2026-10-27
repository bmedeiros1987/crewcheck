# Regra de comportamento do portão de embarque

O portão do próximo voo vem de duas consultas: a **manual**, informada pelo tripulante no card ou no Radar, e a **automática**, feita pelo Radar nas fontes configuradas (FlightAware, AeroDataBox, AirLabs, Aviationstack e fonte própria). A decisão é única: o card da tela inicial, o card do voo e o relógio mostram o mesmo resultado, calculado por `resolveNextFlightGate` em `client/src/lib/nextFlightGate.ts`.

## Ordem de prioridade

| Ordem | Origem (`gateSource`) | Quando vale | Como aparece | Alerta de mudança / Pulse | Relógio |
|---|---|---|---|---|---|
| 1 | `manual` | Portão manual vinculado a esta partida (voo, trecho e horário UTC iguais) | "Portão manual · informado por você" | Revisão de nova fonte comprovada, como hoje | Mostra o portão |
| 2 | `radar` (comprovado) | Fonte informa a hora em que o portão foi observado, ou envia atualização de portão com prova, há no máximo 30 min | "Portão · fonte operacional" | Sim, dentro da janela operacional do voo | Mostra o portão; validade limitada pela observação |
| 3 | `reported` (informado) | Fonte respondeu para esta partida exata, com recebimento há no máximo 30 min, mas sem hora de observação do portão | "Portão informado por FlightAware · a confirmar" e, nos detalhes, a hora de recebimento | **Nunca** | Mostra o número (ex.: "P12 a confirmar"), com o aviso "a confirmar" no detalhe; validade de 30 min após o recebimento |
| — | nenhum | Nada acima | "Não confirmado" | — | "Portão não informado" |

O portão publicado na escala aparece só como referência ("não confirma portão atual") e nunca preenche o portão do dia.

## O que nunca vira portão informado

- Resposta de outro voo, outro trecho, outro dia ou com horário de partida diferente.
- Posição ou estande da aeronave.
- Resposta com mais de 30 min ou com carimbo futuro.
- Fontes que discordam entre si sobre o portão.
- Fonte que mandou prova de observação, ou atualização de portão, que falhou: antiga, de outro valor ou conflitante. Se a prova da fonte diz que o dado é velho ou divergente, ele não é rebaixado para "informado".
- Histórico de atualização de portão com outro valor, ou marcado como conflitante, mesmo que o número coincida.

## Divergência

Se existir portão manual e a fonte (comprovada ou informada) indicar outro, o manual continua exibido e o card avisa: "Você informou 24; FlightAware indica 12". Valores iguais não geram aviso.

## Fora do app

Telegram, Concierge, `/saida` e notificações continuam usando somente campos comprovados (`verifiedRadarFields`). O portão informado existe apenas no app e no relógio. No relógio ele aparece com o número, por decisão do responsável pelo produto (27/10/2026), e o aviso "a confirmar" vai no detalhe.

## Consulta automática e diagnóstico

O Radar consulta as fontes configuradas só no dia do voo, para uma partida publicada na escala da conta. A resposta passa a dizer qual fonte venceu (`provider`, somente nomes da lista conhecida).

`GET /api/radar-health` continua público com o resumo de sempre. Para o administrador autenticado, a resposta inclui também `providers`: para cada fonte, se está configurada, a hora do último sucesso, da última falha, do último erro de rede e o último código HTTP de falha, desde o último reinício. Com isso dá para saber se uma fonte, como o FlightAware, falha (por exemplo, 401 com chave inválida) ou nem chega a ser chamada. O diagnóstico não expõe chaves, URLs nem dados de voo.

A Cirium entra pelo Radar sequencial da #1143 (Cirium Flex primeiro, FlightAware só sem portão válido), com orçamento mensal durável por provedor; o portão dela também aparece como "informado por Cirium". A Cirium Sky segue desligada (Contract Plan).
