# Histórico operacional SQL — OFF, dependente da #1217

Esta fatia é separada da #1217 e usa sua branch como base (`9f719717`). Não altera esse HEAD enquanto ele aguarda revisão. Não altera `server.mjs`, scheduler, dispatch, TTS/transportes, financeiro ou UI. Não houve ambiente, migração ou envio real. O opt-in continua reservado à composição coordenada com o owner Concierge (#1229 ativa).

## Persistência e autoridade implementadas

`server/concierge/operational-history.mjs` grava um documento versionado, por encarnação de owner, no `crewcheck_telegram_state` já existente (`operational-source-history:<hash>`). Não existe DDL, tabela nova, migração ou rotina de bootstrap neste módulo. A limpeza de conta inclui o novo namespace no mecanismo existente.

O escopo do leitor operacional para notificações é exclusivamente o primeiro trecho da próxima jornada canônica. Usa `readOperationalBriefingPreview` real com `lockSource:true`, locks de conta/escala ativa e digest de conteúdo+revisão. Não aceita seleção de voo a partir de URL/job/dispositivo/cache. Um ticket server-side obtido antes de uma consulta deve coincidir com a escala atual quando a resposta chega; reimportação, mudança de conteúdo, revisão, owner ou ocorrência rejeitam a resposta atrasada. O leitor requer transação do caller e `lockSource:true` e toma `FOR UPDATE` em todo o registro de fonte, não apenas IDs.

O writer aceita somente portão com o contrato custom já admitido por `inspectOperationalChange`/`inspectGateSourceHistory`. Armazena apenas campos de prova/ocorrência/recebimento, descartando propriedades extras. Mantém duas observações, sem reconstruir histórico de `lastRadar`. A primeira é baseline; duplicata não renova recebimento/frescor; fonte ou recebimento fora de ordem não substituem o atual. Valores contraditórios no mesmo instante persistem uma marca de ambiguidade; o leitor bloqueia, e uma prova posterior começa nova baseline. Revisão diferente da escala também estabelece baseline nova, não transição entre revisões. Fonte envelhecida não é entrega atual.

O leitor retorna o contrato `{scope,source}` já consumido pela #1217. O SQL sintético usa esse leitor real no produtor e dispatcher reais: não injeta um objeto de histórico no lugar do leitor. Não há fila/outbox/transporte paralelo.

## Fronteiras OFF e integração restante

A constante literal `OPERATIONAL_HISTORY_ENABLED = false` protege todos os exports antes de DB. Não há callsite shipping, rota HTTP, timer, fetch, consulta de fornecedor nem permissão de gravar preferências. `enabled:true` é exercitado somente pelos testes. Não alterar essa constante ou conectar ao scheduler como parte deste draft.

O writer só pode ser conectado posteriormente no callback server-side de uma resposta Radar já autorizada, com ticket de ocorrência lido antes da consulta e prova custom original intacta. `publicRadarPayload.gateUpdate` é projeção normalizada; não a relabelar nem fabricar `departureGateUpdate`. A integração no writer `server.mjs` requer composição/ownership e testes da implementação real antes de ativação. Esta fatia não inicia consultas adicionais.

Mesmo após conectar esse writer, respostas do app ou `/radar` só atualizam a fonte quando há consulta: não são trigger autônomo. Feed/ingest sem app ainda precisa ser identificado e autorizado. Status continua recusado: não há prova temporal real no adapter atual. NOTAM não é expandido, não tem tópico/writer/leitor aqui e seu diagnóstico não é executado. Consentimento no Concierge é uma etapa separada, sem duplicar controles de #1229. Nenhuma preferência salva prova agendamento; nenhum teste prova recebimento físico.

## Validação

Testes de módulo usam engine canônico/SQL doubles sem rede, abrangendo OFF antes de DB, locks, replay, persistência após recriar módulo, baseline, frescor, conflito, ticket/revisão/owner e projeção mínima. MySQL isolado usa o padrão existente (`--network none`, socket e nome QA fixos): oito writers, reinício de módulo, oito planners, dispatch concorrente e transporte falso; teste RR cria snapshot antes de esperar owner e verifica a nova observação commitada durante espera. Uma contraprova remove o current-read somente no wrapper de teste e exige `HISTORY_STALE_READ`; não há knob de isolamento ou de teste no código de produção. O workflow existente de briefing executa testes e SQL raw/prepared, sem pipeline novo.

## Arquivo paginado por ocorrência (candidato local OFF)

O arquivo usa a tabela existente, com páginas de até 100 registros e índices por ocorrência/evidência. Conta, voo, origem, destino, data local de origem e instante UTC programado compõem o escopo. A captura geral reutiliza o resolver autenticado de publicações da main, com locks e revalidação de revisão antes/depois da resposta. Não há consulta extra a fornecedor nem backfill. O contrato operacional custom da primeira jornada permanece separado e não é ampliado para notificações por dados apenas reportados.

`sourceUpdatedAt` preserva a atualização da fonte; não é observação física. Os contratos atuais não fornecem observação física, portanto `observedAt` permanece nulo. `receivedAt` é o recebimento original. A resposta declara `order: recorded-sequence`: sequência de registro não significa cronologia. Registros com relógios anteriores ficam marcados; índices de conflito funcionam entre páginas, sem varrer toda a coleção. Duplicatas não renovam relógios. Nenhum registro é apagado por atingir uma página.

Cada append consulta até cinco registros indexados e grava até cinco; cada página lê até 102 registros limitados. O JSON de cada página tem no máximo 100 observações. O número total de linhas cresce conforme o histórico solicitado; esses limites são por operação, não uma promessa de capacidade/custo ilimitados do banco. Chaves cabem no VARCHAR(255) existente. Não há DDL, migração ou conexão com banco real nesta preparação.

O estado operacional atual passa à chave `operational-source-history:live:<hash>`. O documento anterior permanece intacto. Sua compatibilidade usa projeções JSON de tamanho fixo, incluindo consulta separada `legacy=1`; não transfere nem regrava toda a coleção. A fonte do campo legado chamado observedAt era departureGateUpdate.updatedAt: a projeção o identifica como sourceUpdatedAt e mantém observedAt nulo. Conflitos legados sem índice são explicitamente desconhecidos. A eficiência dessa projeção pressupõe a coluna JSON nativa já declarada no contrato; validar schema/SQL no gate isolado antes de ativar. A exclusão existente por conta cobre todos esses subnamespaces.

GET /api/radar-history autentica somente conta existente, revalida a encarnação e retorna páginas da ocorrência exata com `currentConfirmation:false`; nunca chama um fornecedor, planner ou entrega. O painel do Radar consulta apenas por ação do usuário e usa os componentes/tokens existentes. Erro/disabled não é apresentado como arquivo vazio, e uma resposta A atrasada é rejeitada após troca para B.

OPERATIONAL_HISTORY_ENABLED e RADAR_OPERATIONAL_HISTORY_ENABLED continuam false. Nenhuma fonte, licença, orçamento, canal ou configuração é ativada. Requer revisão independente, gates de composição e SQL real isolado; testes sintéticos não comprovam disponibilidade ou dados de produção.
