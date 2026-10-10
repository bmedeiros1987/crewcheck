# Cirium Sky: preparação offline

Base inspecionada: main `cea3bfff835707ac08e7a842b9ebdab373f2789a`.
Branch da proteção: `safety/cirium-diagnostic-off-by-default`.
Nenhum AGENTS.md ou SKILL.md versionado foi encontrado no checkout.

## Pacote independente

Esta proteção adiciona executor offline, regressão e opt-in explícito no diagnóstico.
O workflow Cirium existente executa o harness offline e o teste de occurrence identity.
Não modifica rotas, adapter, consenso Radar ou configuração de serviços.
Não contém credenciais, não exige conta e não faz consultas Cirium.

Execute `node scripts/check-cirium-offline.mjs`. O processo filho começa com
ambiente vazio antes de importar os módulos. Fetch real é bloqueado; os testes
existentes utilizam valores sintéticos e mocks injetados. São reutilizadas as
regressões diagnostic, canonical-adapter e radar-field-provenance.
O novo teste também comprova que a configuração desligada não lê credenciais.

`CIRIUM_DIAGNOSTIC_ENABLED` precisa ser exatamente `true` para habilitar o
diagnóstico; ausente, vazio ou qualquer outra string mantém `disabled`.
O gate fica antes de ler tokens ou chaves e bloqueia tanto Sky quanto Flex.
É preparação local, sem publicação: o ambiente atualmente em produção continua
exigindo que o usuário não insira token até revisão e implantação autorizadas.

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
3. Revisar o opt-in explícito preparado neste pacote e sua regressão. Não inserir
   token no serviço publicado até que a proteção seja implantada com autorização.
4. Impedir consultas em HEAD; definir cache/dedupe e orçamento aprovado antes
   de GET. Não adicionar polling, tentativas automáticas ou fallback Flex.
5. Corrigir resultados ambíguos: 404/405 não comprovam autenticação; 200 com
   JSON inválido/vazio não comprova dados disponíveis; entrada inválida não
   deve virar LA3377 silenciosamente; null numérico não deve virar zero.
6. Reexecutar os mocks e revisar patch antes de autorizar qualquer teste real.

## Entrada segura futura pelo usuário

Após esses gates e autorização específica, o usuário deverá inserir a nova
credencial diretamente no gerenciador seguro do backend sob
`CIRIUM_SKY_API_TOKEN`, sem prefixo VITE_. Manter `CIRIUM_DIAGNOSTIC_ENABLED`
ausente ou `false`; somente definir `true` com autorização específica para o teste.
Não copiar o segredo compartilhado
na conversa. Não registrar valores em Git, arquivos locais, comandos, logs ou
mensagens. Não configurar aliases ou credenciais Flex como fallback.
O opt-in deverá permanecer desligado até a validação autorizada.
Nenhuma ativação ou teste real está incluído neste pacote.

## Validação nesta tarefa

Node 22.23.3 encontrado em `.local/node/node-v22.23.3-darwin-arm64/bin/node`.
Harness executado com sucesso: disabled-by-default, diagnostic Sky/Flex,
canonical-adapter e radar-field-provenance. Nenhuma instalação necessária,
nenhuma consulta real, nenhum segredo herdado pelo processo filho.
Os demais problemas citados acima permanecem pendentes: estes testes não
comprovam o contrato Sky público, cobertura de conta ou custo de consultas.
