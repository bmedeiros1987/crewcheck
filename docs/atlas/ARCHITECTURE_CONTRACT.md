# Atlas — Contrato arquitetural

Registro dos contratos estruturais que já se mostraram importantes o suficiente para quebrar duas vezes de formas parecidas (#440/#512/#513/#524). Objetivo: qualquer consumidor novo (FlightDeck, Pulse, Radar, relatório) deve seguir este contrato em vez de reimplementar sua própria heurística.

## Cadeia canônica

```
fonte (PDF AIMS/CrewRoster/iFlight)
  -> parser/importer (pdfParser.ts, aimsParser.ts, rosterParser.mjs)
  -> canonical roster (canonicalRoster.ts::buildCanonicalRosterEvents)
  -> journeyId / journeyBoundary (identidade única de jornada)
  -> consumidores: apresentação/Saída Inteligente, regulamentação (madrugadas),
     ground time, pernoite/stay, FlightDeck, Pulse, Radar, relatório
```

## Regra estrutural (causa-raiz repetida em #440, #512, #513, #524)

**Identidade de jornada (`journeyId`) tem uma única fonte: `canonicalRoster.ts`.** Nenhum consumidor deve derivar fronteira de jornada por conta própria (ex.: por `dateKey` civil, por `RosterDay.date`, ou por heurística paralela) — isso é exatamente o que produziu contagem dupla, perda silenciosa de perna e madrugadas mal contadas nas investigações anteriores.

Consequência prática já verificada:
- Apresentação/Saída Inteligente (PR #513) e contagem regulatória de madrugadas (PR #524) reaproveitam o mesmo `journeyId` — não duas heurísticas de fronteira que podem divergir.
- Uma jornada que cruza a meia-noite tem sua "noite civil tocada" definida pela janela 00:00-06:00 que ela realmente atravessa, não pela data de publicação/abertura da jornada.

## Camadas de execução — atenção obrigatória

O código commitado em `client/src/lib/*.ts` **não é necessariamente o que é embarcado**. A cadeia `scripts/v139/apply.mjs` roda ~80 patches históricos (`scripts/vNNNNN/apply.mjs`) que casam código por **string exata** e podem substituir uma função inteira por uma implementação diferente em tempo de preparo (ex.: `scripts/v14359/compliance-temporal-helpers.txt` substitui as funções de madrugada do arquivo base).

Regra: **todo fix estrutural precisa ser verificado nos dois estados** — base (committed) e preparado (`node scripts/v139/apply.mjs`) — porque a mesma classe de bug pode existir de forma independente nas duas camadas (confirmado em #524: corrigir só o arquivo base não teria efeito nenhum em produção).

## Distinção de produto ainda não implementada

**Publicada x Realizada/Executada**: o parser deve recuperar apenas o que está demonstravelmente presente na publicação atual. Diffs entre publicações/revisões são responsabilidade de um versionador separado (ainda não construído) — a recuperação nunca deve ressuscitar programação legitimamente removida de uma publicação anterior. Relevante para #527 (republicações da mesma escala não podem se fundir silenciosamente) e para #510 (apresentação não pode herdar de um boundary anterior).
