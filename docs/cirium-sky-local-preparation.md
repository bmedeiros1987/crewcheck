# Cirium Sky: preparação offline

Base inspecionada: main `500fb1c3` (merge da PR #986), trazido para este branch.
Branch da proteção: `safety/cirium-diagnostic-off-by-default`.
Nenhum AGENTS.md ou SKILL.md versionado foi encontrado no checkout.

## Pacote independente

Esta proteção adiciona executor offline, regressões e opt-ins explícitos no
diagnóstico. O workflow Cirium existente executa o harness offline e o teste de
occurrence identity. Não modifica rotas de negócio, adapter canônico, consenso
Radar ou configuração de serviços. Não contém credenciais, não exige conta e não
faz consultas Cirium.

Execute `node scripts/check-cirium-offline.mjs`. O processo filho começa com
ambiente vazio antes de importar os módulos. Fetch real é bloqueado; os testes
existentes utilizam valores sintéticos e mocks injetados. São reutilizadas as
regressões guard, diagnostic, canonical-adapter e radar-field-provenance.
O teste de portão também comprova que a configuração desligada não lê credenciais.

## Portão e opt-ins

`CIRIUM_DIAGNOSTIC_ENABLED` precisa ser exatamente `true` para habilitar o
diagnóstico; ausente, vazio ou qualquer outra string mantém `disabled`.
O gate fica antes de ler tokens ou chaves e bloqueia tanto Sky quanto Flex.

O probe Flex legado tem um opt-in separado: `CIRIUM_DIAGNOSTIC_ALLOW_LEGACY_FLEX`
precisa ser exatamente `true`. Credenciais Flex nunca são usadas como fallback
automático do probe Sky. É preparação local, sem publicação: o ambiente
atualmente em produção continua exigindo que o usuário não insira token até
revisão e implantação autorizadas.

## Contratos encontrados

`server/cirium-diagnostic.mjs` implementa Sky e Flex separadamente. Sky usa
`https://api.sky.cirium.com`, header `Authorization` com token direto e
`Accept: application/json`, timeout de 8 segundos e redirects bloqueados.
`CIRIUM_SKY_API_TOKEN` tem prioridade sobre alias `CIRIUM_SKY_SECRET`.
`CIRIUM_SKY_IDENTIFIER` só informa presença e não é enviado.
`CIRIUM_SKY_BASE_URL` passa por allowlist. Flex usa variáveis separadas
`CIRIUM_APP_ID` e `CIRIUM_APP_KEY`; não é prova do contrato Sky.

O parent relatou exemplo oficial de Authorization direto, sem prefixo Bearer,
em https://developer.cirium.com/apis/cirium-sky-api/flight-alerts.
A leitura web nesta tarefa não retornou conteúdo da página; o endpoint status
e seu schema continuam pendentes de validação oficial específica do produto.
Não usar o fixture FlightStats como prova de equivalência com Sky.

O adapter de laboratório normaliza campos para Radar e possui regressões,
mas não integra o consenso. A documentação antiga em
`docs/cirium-evaluation-diagnostic.md` descreve o probe Flex e não corresponde
ao probe Sky atual, que consulta um voo real.

## Gates antes de configurar ou consultar

1. A comparação read-only da PR937 (head e9a23a1b) retornou 13 arquivos de
   CrewCierge, matcher de consultas salvas, finalizadores e regressões. Nenhum
   coincide com os arquivos deste pacote. A ação proposta é bloquear diagnóstico
   Cirium por padrão, não implementar consultas salvas ou retomar a PR937.
   Nenhum merge, push ou deploy é autorizado por esta comparação. O parent
   revisará separadamente esta proteção local.
2. Validar endpoint status, schema, janela de datas e direitos da conta com
   documentação oficial. Informação de plano gratuito não comprova cobertura.
3. Revisar os opt-ins explícitos preparados neste pacote e suas regressões. Não
   inserir token no serviço publicado até que a proteção seja implantada com
   autorização.
4. ~~HEAD / orçamento~~ Implementado nesta branch (pendente de revisão):
   `/api/admin/cirium-health` aceita apenas GET; `createCiriumGuard` limita o
   processo a 6 consultas reais, intervalo mínimo de 30 s, cache de 10 min
   (inclusive de falhas) e dedupe de consultas simultâneas idênticas. Um `429`
   do provedor vira cooldown (`provider_cooldown`) a partir de `Retry-After`,
   com fallback conservador de 60 s quando o header não vem — nunca uma nova
   tentativa automática. O orçamento nunca é reembolsado e não há polling, retry
   nem fallback de provedor. O teto numérico é provisório: o orçamento aprovado
   pelo usuário ainda deve ser definido antes de qualquer teste real.
5. ~~Resultados ambíguos~~ Implementado: 404/405 → `unverified` (não provam
   autenticação); 2xx com corpo inválido → `invalid_payload`, inclusive quando
   os **elementos** do array não são registros utilizáveis
   (`flightStatuses: [null, "garbage"]` nunca é `available`); carrier, voo e data
   **presentes** mas vazios ou malformados recebem HTTP 400 na rota antes de
   qualquer diagnóstico e nunca são trocados pelo padrão (parâmetro omitido usa
   o padrão documentado); data fora de ±2 dias de hoje (janela provisória) é
   rejeitada; a ocorrência devolvida precisa ser o trecho pedido — mesmo carrier
   e voo, partida e chegada válidas e distintas, chegada depois da partida e
   dentro de um dia, e dia de partida igual ao consultado (data local, ou UTC
   dentro de um dia); linha sem data verificável é rejeitada, nunca exibida, e
   conta em `rejectedRows`; valor numérico só é aceito como número real ou string
   numérica simples, então `null`, vazio, booleano, array (`[]`, `[null]`, `[1]`)
   ou objeto permanecem `null` (nunca 0). Ainda pendente: schema oficial do
   endpoint Sky.
6. Reexecutar os mocks e revisar patch antes de autorizar qualquer teste real.

## Escopo do orçamento

O guard vive em um processo Node: ele zera em reinício ou deploy e não é
compartilhado entre instâncias. Ele reduz gasto acidental, mas não substitui a
quota do provedor.

## O que este pacote não faz

- nenhuma consulta real, nenhum token inserido, nenhum segredo lido;
- nenhuma alteração de `render.yaml`, `.env.example`, secrets, permissões ou custo;
- nenhum merge, deploy ou publicação.

**A proteção só passa a valer no serviço publicado depois do merge e do deploy
desta PR.** Até lá, a revisão principal continua podendo consultar a API quando
um token estiver presente, porque o portão ainda não está publicado. Nada neste
pacote autoriza inserir token.

## Entrada segura futura pelo usuário

Após esses gates e autorização específica, o usuário deverá inserir a nova
credencial diretamente no gerenciador seguro do backend sob
`CIRIUM_SKY_API_TOKEN`, sem prefixo VITE_. Manter `CIRIUM_DIAGNOSTIC_ENABLED`
ausente ou `false`; somente definir `true` com autorização específica para o teste.
Não copiar o segredo compartilhado
na conversa. Não registrar valores em Git, arquivos locais, comandos, logs ou
mensagens. Não configurar aliases ou credenciais Flex como fallback.
Os opt-ins deverão permanecer desligados até a validação autorizada.
Nenhuma ativação ou teste real está incluído neste pacote.

## Validação nesta tarefa

Node 22.13.0 (mesma versão fixada no workflow). Harness executado com sucesso:
disabled-by-default, guard/validação (`regression-cirium-guard.mjs`, incluindo
cooldown de 429 e opt-in Flex), diagnostic Sky/Flex, canonical-adapter e
radar-field-provenance. Nenhuma instalação necessária, nenhuma consulta real,
nenhum segredo herdado pelo processo filho.
Os demais problemas citados acima permanecem pendentes: estes testes não
comprovam o contrato Sky público, cobertura de conta ou custo de consultas.
