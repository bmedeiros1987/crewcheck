# Transporte Sky preparado OFF

Base main510555c. Continuação draft da frente Cirium já integrada, com
integração mínima ao handler Radar e ao materializador existente. Não altera
registro Radar, preparação de runtime ou configuração.
`CIRIUM_SKY_PRODUCTION_ENABLED=false`; factory de produção sem credenciais,
nenhuma chave/env é acessada. O handler resolve defaultCiriumRadarOptions OFF;
somente uma capability de código habilitada com transport percorre handler →
race → runCiriumSkyRadar → source HTTP → contrato puro → resposta/proveniência.
Teste com fake fetch prova esse caminho nos handlers reais raw/prepared,
inclusive falha403 sem fallback/canonical writes. A capability existe somente
para testes offline ou futuro canário explicitamente revisado. O runner retorna
contrato Radar/proveniência, nunca o resumo administrativo do diagnóstico.

O adapter aceita um único envelope flightStatuses/flightStatus, valida pelo
contrato puro aprovado e exige voo FS/rota/fuso/data/instante exatos. O fuso
do aeroporto deve estar no catálogo confiável passado pela política; aliases
não são inferidos. Observação ausente, futura ou mais antiga que o limite
de política (máximo15min) falha fechada. Nunca substitui observação por fetch time.
Não grava canônico/concierge; não altera MCC, MyCrewCare, Watch ou Play.

Transporte GET HTTPS em host fixo, redirect:error; secret somente no header,
sem logs/URL/payload público. Prazo cobre fetch e body, abort explícito,
body UTF-8/JSON limitado256KiB. Um pedido upstream por tentativa; sem retries,
Flex, polling, timers permanentes ou novos recursos. Cache60s máximo128 entradas,
falhas incluídas, copies independentes e coalescing de chamadas concorrentes.
429 respeita Retry-After segundos/data com mínimo60s/máximo24h; 401/403 bloqueiam
até o fim da vigência. Timeout bloqueia novos pedidos por60s. Orçamento contado
antes da tentativa, máximo100 por capability, intervalo mínimo1s.

## Evidência ainda necessária antes de qualquer chamada real

Prints inspecionados pelo parent confirmam trial Cirium Sky aprovado09/10/2026,
vigência09/10–23/10/2026 e credencial CrewCheck ACTIVE criada10/10/2026.
Referências Library: libfile_e3bba1adf49481918d245b14024072ee e
libfile_70d2b61e5cb08191b98cd57a7551d62d; sem segredos visíveis.
Não pedir renovação novamente: email de agosto é histórico. Falta confirmar
inclusão do endpoint Flight Status, quota/saldo/rate limit, overage e uso em
produção. Política sintética do teste é fixture,
não comprovação de direito comercial. Evidência e contrato da API são exigidos
antes de chamar credential/fetch, mas seus identificadores são referências
auditáveis de código, não verificação criptográfica/comercial.

Documentação oficial pública consultada:
https://developer.cirium.com/apis/cirium-sky-api/flight-status
https://developer.cirium.com/apis/cirium-sky-api/authentication
O conteúdo detalhado não foi legível nesta execução. Endpoint/header/envelope
estão preparados conforme o diagnóstico existente, sem reutilizar sua rota ou
resumo: `/v1/flights/status/airline/{FS}/flight-number/{number}/departure-date/{date}`,
Authorization com secret estático sem inventar Bearer. Confirmar especificação
oficial e fixture sanitizada Sky antes de validar compatibilidade de produção.
Nenhum payload Flex deve ser usado como prova de Sky.

Orçamento/cache/cooldown são locais à capability/processo; restart/múltiplas
instâncias recriam orçamento: limite por processo não é teto financeiro.
Não habilitar produção até haver orçamento durável
e compartilhado aprovado, gate/autorização do usuário da rota e integração de
UI com identidade confiável; o handler HTTP atual continua OFF. A factory
de produção não possui política/credenciais conectadas: trocar a constante
isoladamente falha not_configured. Nunca ligar
simplesmente por existência de env/token. Próximo teste real deve ser canário
one-shot com uma identidade autorizada, quota1, janela curta e recibo sanitizado,
somente depois da confirmação de inclusão do endpoint/especificação e revisão
independente. Plano inicial: exatamente um GET de um voo do roster cuja
identidade completa seja verificada (FS/número/rota/data/fuso/UTC exato),
maxCalls1, timeout8000ms, sem retries/Flex/polling, validade da capability
de5min dentro do trial; recibo somente status/duração/contagem e proveniência,
sem headers/secret/payload bruto. Não há identidade atual comprovada nesta
execução; não inventar scheduledDepartureUtc nem reaproveitar data de fixture.

## Verificação offline

`node scripts/regression-cirium-sky-transport-off.mjs`: fake fetch/secret,
sem rede real, prova gateOFF, política inválida, cache/quota, singleflight,
timeout, cooldown, resposta limitada, erro sanitizado e proveniência.
O CI Cirium existente inclui esta regressão em raw/prepared em três fusos,
preservando o helper/lifecycle/gates canônicos já aprovados.
