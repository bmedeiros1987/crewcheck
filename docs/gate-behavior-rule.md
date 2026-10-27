# Regra de comportamento do portão de embarque

O portão do próximo voo vem de duas consultas: a **manual**, informada pelo tripulante no card ou no Radar, e a **automática**, feita pelo Radar nas fontes configuradas (FlightAware, AeroDataBox, AirLabs, Aviationstack e fonte própria). A decisão é única: o card da tela inicial, o card do voo e o relógio mostram o mesmo resultado, calculado por `resolveNextFlightGate` em `client/src/lib/nextFlightGate.ts`.

## Ordem de prioridade

| Ordem | Origem (`gateSource`) | Quando vale | Como aparece | Alerta de mudança / Pulse | Relógio |
|---|---|---|---|---|---|
| 1 | `manual` | Portão manual vinculado a esta partida (voo, trecho e horário UTC iguais) | "Portão manual · informado por você" | Revisão de nova fonte comprovada, como hoje | Mostra o portão |
| 2 | `radar` (comprovado) | Fonte informa a hora em que o portão foi observado, ou envia atualização de portão com prova, há no máximo 30 min | "Portão · fonte operacional" | Sim, dentro da janela operacional do voo | Mostra o portão; validade limitada pela observação |
| 3 | `reported` (informado) | Fonte respondeu para esta partida exata, com recebimento há no máximo 30 min, mas sem hora de observação do portão | "Portão informado por FlightAware · a confirmar" e, nos detalhes, a hora de recebimento | **Nunca** | Mostra "P12 a confirmar"; validade de 30 min após o recebimento |
| — | nenhum | Nada acima | "Não confirmado" | — | "Portão não informado" |

O portão publicado na escala aparece só como referência ("não confirma portão atual") e nunca preenche o portão do dia.

## O que nunca vira portão informado

- Resposta de outro voo, outro trecho, outro dia ou com horário de partida diferente.
- Posição ou estande da aeronave.
- Resposta com mais de 30 min ou com carimbo futuro.
- Fontes que discordam entre si sobre o portão.
- Fonte que mandou prova de observação, ou atualização de portão, que falhou: antiga, de outro valor ou conflitante. Se a prova da fonte diz que o dado é velho ou divergente, ele não é rebaixado para "informado".
- Marca d'água de atualização de portão mais recente com outro valor.

## Divergência

Se existir portão manual e a fonte (comprovada ou informada) indicar outro, o manual continua exibido e o card avisa: "Você informou 24; FlightAware indica 12". Valores iguais não geram aviso.

## Fora do app

Telegram, Concierge, `/saida` e notificações continuam usando somente campos comprovados (`verifiedRadarFields`). O portão informado existe apenas na tela do app e no relógio, sempre marcado como "a confirmar".

## Consulta automática e diagnóstico

O Radar consulta as fontes configuradas só no dia do voo, para uma partida publicada na escala da conta. A resposta passa a dizer qual fonte venceu (`provider`, somente nomes da lista conhecida).

`GET /api/radar-health` continua público com o resumo de sempre. Para o administrador autenticado, a resposta inclui também `providers`: para cada fonte, se está configurada, a hora do último sucesso, da última falha, do último erro de rede e o último código HTTP de falha, desde o último reinício. Com isso dá para saber se uma fonte, como o FlightAware, falha (por exemplo, 401 com chave inválida) ou nem chega a ser chamada. O diagnóstico não expõe chaves, URLs nem dados de voo.

## Cirium

A Cirium entra no Radar pela API **FlightStats Flex Flight Status**, a mesma do Commercial Plan. Ela é tratada como mais uma fonte da corrida (`cirium-flex`), com as mesmas regras de ocorrência exata. O portão dela aparece como "informado por Cirium" até existir prova de observação do campo.

Para ligar, no serviço do backend:

- `CIRIUM_APP_ID` e `CIRIUM_APP_KEY`: credenciais do portal FlightStats. Nunca com prefixo `VITE_`.
- `CIRIUM_FLEX_RADAR_ENABLED=true`. Sem essa variável a fonte não chama nada, mesmo com credenciais (o diagnóstico de admin usa as mesmas credenciais).
- `CIRIUM_FLEX_DAILY_LIMIT` (opcional, padrão 100): máximo de chamadas por dia UTC neste processo. Valor inválido desliga a fonte.

As chamadas só acontecem no dia do voo, para uma partida publicada na escala da conta, e contam no plano. Resposta válida sem a ocorrência não pausa a fonte; erro HTTP pausa por 30 s e aparece no diagnóstico de admin.

A Cirium **Sky** continua desligada (`CIRIUM_SKY_PRODUCTION_ENABLED = false`): as APIs Premium/Sky exigem o Contract Plan, e o trial terminou em 23/10/2026.
