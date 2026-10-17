# Contrato puro Cirium para Radar, OFF

Incremento isolado sobre main `4cfa7b45868e523b197eb5e081dbb0d7959be600`.
Não integra servidor, preparação, corrida Radar, diagnóstico administrativo ou UI.
Não lê ambiente, credenciais, relógio ou rede. O gate só aceita booleano `true`
injetado pelo chamador; o default OFF retorna antes de inspecionar os inputs.

`evaluateCiriumRadar(request, response, options)` recebe uma coleção `rows`
já extraída por um transporte futuro revisado. Reutiliza o normalizador
`cirium-flight-adapter`, identidade `radar-occurrence-identity` e proveniência
`radar-field-provenance`. O parser de envelopes do diagnóstico é privado:
não o copia nem importa o diagnóstico no runtime. Extração de envelopes e
resolução de aliases ficam fora deste incremento, para um parser independente
compartilhado em etapa coordenada. Não é um provedor de produção.

A identidade exige namespace FS, carrier FS, número como string, aeroportos
IATA distintos, data operacional local, fuso explícito da origem e instante
publicado de partida com offset. Nada usa hoje, horário do browser, data UTC
como substituto da data operacional, alias LA/LAN ou contexto para preencher
campo ausente do provedor. O fuso deve vir de cadastro confiável do aeroporto
na futura integração; este contrato não verifica essa associação.

Cada linha exige identidade e horários publicados UTC verificáveis, com chegada
posterior à partida em até 24h. Deve coincidir em carrier/número, rota, instante
publicado e data local no fuso pedido. Nenhuma correspondência produz `no_data`;
duas correspondências, mesmo duplicadas, produzem `ambiguous`. Coleção malformada,
linha inválida ou mais de 100 linhas produzem `invalid_payload`.
Horários estimados/reais admitidos precisam ficar a até 24h do correspondente
publicado; seus pares e o par efetivamente exibido exigem chegada posterior,
com duração de até 24h. A política é conservadora e não cobre atrasos maiores.
A chave deste contrato conserva o prefixo local legível do helper compartilhado
e acrescenta `UTC:<instante ISO canônico com milissegundos>`. Todas as chaves
de proveniência recebem a mesma qualificação. Isso distingue folds de DST,
segundos e milissegundos distintos, sem modificar o helper compartilhado.
Representações UTC/offset equivalentes geram a mesma identidade e proveniência.

Estados: `disabled`, `invalid_request`, `not_configured`, `no_data`, `ambiguous`,
`invalid_payload`, `timeout`, `rate_limited`, `provider_error`, `available`.
Estados de transporte são entradas sanitizadas, não tentativas HTTP.
Somente `available` devolve candidato e proveniência. Campos opcionais são
limitados antes da normalização; portão de chegada nunca vira portão de partida.
Observação ausente/inválida permanece `null` na proveniência, sem inventar
freshness a partir de horário de consulta. Timestamp presente não prova que
o dado ainda esteja atual: política de idade máxima permanece pendente.

O fallback atual é preservado por ausência completa de integração/import do
novo módulo. A paridade coberta aqui é OFF sem inspecionar entradas e sem rede;
paridade end-to-end da corrida será exigida na integração futura.

Teste: `TZ=UTC node scripts/regression-cirium-radar-provider-off.mjs`, também
em America/Sao_Paulo e Pacific/Auckland. Filho inicia somente com TZ;
fetch real lança erro, nenhum token é necessário. Workflow separado usa Node
22.13.0 e nenhum install/deploy/secret. Revisão independente e segunda revisão
do parent são necessárias antes de merge. Integração requer coordenação com
as frentes que alteram server.mjs/scripts de preparação; nenhuma é modificada.
