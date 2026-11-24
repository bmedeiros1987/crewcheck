# Aceite de exclusão no candidato exato da #1374

Este rascunho exclusivo de QA usa a branch da #1368 como base de revisão. O checkout separado do produto usa apenas o HEAD `43504832` da #1374. A árvore `1ed9292e` é a mesma do merge virtual `0a86de0d` sobre a main `1d241f98`. Os cinco arquivos preparados do backend são verificados contra essa composição exata.

O único job usa Chrome com sandbox e MySQL 8.4 descartável por socket e sem rede. Com duas contas sintéticas, o ensaio aciona a exclusão pelas telas Configurações e página pública. Cada entrada usa um banco novo. A prova exige exclusão persistida de A, HTTP 401 na sessão anterior de A, continuidade da sessão de B e reabertura dos rascunhos de férias e 13º de B. A segunda entrada roda mesmo se a primeira falhar, e qualquer falha mantém o job vermelho.

O resultado anterior passou nas duas telas na árvore `f647641b`. Ele permanece registrado no SHA de QA `bee0355d`. A decisão de release da #1374 depende da prova na árvore `1ed9292e` e dos demais checks aplicáveis. [Prova anterior](https://github.com/bmedeiros1987/crewcheck/actions/runs/45302280646/job/138137496050)
