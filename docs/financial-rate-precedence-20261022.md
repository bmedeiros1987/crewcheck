# Precedência de tarifas confirmadas

Base: main 161a66b1. Escopo: somente `rateAt` em `client/src/lib/financialStatementLearning.ts`. Sem mudança de valores, ACT, vigências, schema, merge, sincronização ou dados de usuário. Fixtures sintéticas apenas.

## Falha reproduzida

`rateAt` escolhia o início mais recente antes de testar o término. Com a fonte A (01–29/02/2032, 200/50/50) e a fonte B com outro início (07–09/02/2032, 180/45/45), a consulta de 10/02 parava em B já expirada e retornava `null`; o chamador real (`perDiemConfig` da Home) caía na referência ACT 100/25/táxi null, embora A ainda estivesse vigente.

## Correção

Primeiro só a revisão mais recente de cada escopo (chave, moeda, início — o escopo que `mergeConfirmedRates` revisa) fica elegível; depois, entre os escopos vigentes na data, vence o de início mais recente. Uma correção encurtada continua sem ressuscitar a revisão anterior do mesmo escopo.

Diferenças fora da produção: sem moeda informada (`currency` indefinida), cada moeda é um escopo próprio, como no merge; o main comparava revisões entre moedas com o mesmo início. Entrada sem `effectiveTo` não cobre nenhuma data e deixa de bloquear escopos anteriores; o armazenamento validado já exige `effectiveTo`. Os chamadores da Home sempre informam moeda.

## Limite e ambiguidade (não resolvidos neste lote)

O modelo armazenado não tem identidade de fonte. Dois documentos com o mesmo início (e chave/moeda) são revisões de um mesmo escopo, mesmo com impressões digitais distintas: a confirmação mais recente governa e a anterior nunca é retomada, inclusive depois que a mais recente termina. Esse comportamento é idêntico ao do main e foi mantido de forma conservadora; não se escolhe tarifa por impressão digital. Uma correção que altere o início vira outro escopo e passa a competir como fonte de início diferente — também herdado do modelo. Resolver essas ambiguidades exige identidade de fonte explícita (mudança de modelo), fora deste lote.

## Testes

`scripts/regression-financial-rate-precedence.mjs` (workflow `per-diem-effective-period`, bruto e preparado, UTC/São Paulo/Tóquio; localmente também Auckland): fontes com inícios distintos e fronteiras inclusivas (incluindo 29/02), correções encurtadas de A e de B, mesmo início com impressões digitais distintas (ambas as ordens e com B), isolamento por dono (outro dono, sem dono, legado sem dono) e o `perDiemConfig` real.
