# Render build preflight — v14.3.23

O build do Render executa toda a cadeia histórica de patches sobre um checkout limpo. Quando `conciergePlaceLines` já possui distância por um hotfix anterior, mas com formatação equivalente e não idêntica, o patch legado v14.3.23 não deve abortar o deploy.

O preflight desta correção:

- reconhece semanticamente `place.distanceKm` e `const distance`;
- normaliza somente a função `conciergePlaceLines` para a forma canônica esperada pelo patch;
- mantém o comportamento funcional existente;
- continua falhando quando a função está truncada ou quando a estrutura esperada realmente não existe;
- roda antes de `scripts/v14323/apply.mjs`.

A correção não ignora erros gerais e não altera o motor canônico da escala.
