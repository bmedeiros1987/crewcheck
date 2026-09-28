# Contrato canônico de portão de partida

O CrewCheck deve selecionar portão e terminal apenas quando os dados pertencem ao mesmo segmento operacional identificado por:

- número do voo;
- data operacional;
- origem;
- destino.

Campos de chegada nunca podem preencher o portão de embarque. Dados de outro trecho, codeshare divergente ou cache antigo devem ser descartados. Quando fontes equivalentes divergirem sem maioria confiável, a interface deve exibir `—`.

## Caso de regressão

Para LA3377 REC → GRU, a fixture oficial desta correção espera portão de partida 9 e terminal 1. O portão 11 aparece apenas em contexto de chegada ou de segmento incompatível e deve ser rejeitado.

## Superfícies obrigatórias

A mesma decisão canônica deve alimentar Radar, Próxima Programação, FlyDeck e Concierge. Nenhuma superfície pode recalcular o portão de forma independente.
