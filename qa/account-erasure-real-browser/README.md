# QA integrada da exclusão de conta

Esta revisão de QA tem como base a branch da #1368 no commit `624c8b4b`. Não é candidata à integração. Os arquivos da PR contêm o ensaio e a reconstrução da árvore de produto em um diretório descartável. A branch da #1368 fica intacta.

A composição testada é a árvore `f647641b21280e5ef313bfc12a7abef1d27258a0` de `e613e45d6c8bc7b4b898f08cb7949d0d8ef14dfb`. O índice recupera objetos dos SHAs públicos da main e dos rascunhos #1342, #1368 e #1348. A sobreposição é a diferença local de seis arquivos. O script exige a árvore bruta esperada antes de preparar o app. A preparação canônica deve reproduzir os cinco hashes do backend que passou na prova anterior de API.

O job usa Chrome com sandbox e MySQL 8.4 descartável por socket, sem portas publicadas. Os contextos do navegador ficam limitados à origem loopback. A API usa os handlers reais e só admite as rotas do ensaio. As duas contas e os rascunhos locais são sintéticos. Em cada entrada, Configurações e página pública, o navegador confirma a exclusão de A, comprova que a sessão anterior de A termina e que a sessão de B continua, e reabre os rascunhos de férias e 13º de B. O mesmo recibo exige remoção persistida de A no MySQL e preservação de B.

O teste aceita apenas a PR em rascunho a partir do ref de QA contra a base exata. O job não tem ação de publicação nem configuração de serviço. O resultado pode ser consultado no log do job, por entrada.
