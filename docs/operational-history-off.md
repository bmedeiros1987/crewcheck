# Histórico operacional SQL — OFF, dependente da #1217

Esta fatia é separada da #1217 e usa sua branch como base (`9f719717`). Não altera esse HEAD enquanto ele aguarda revisão. Não altera `server.mjs`, scheduler, dispatch, TTS/transportes, financeiro ou UI. Não houve ambiente, migração ou envio real. O opt-in continua reservado à composição coordenada com o owner Concierge (#1229 ativa).

## Persistência e autoridade implementadas

`server/concierge/operational-history.mjs` grava um documento versionado, por encarnação de owner, no `crewcheck_telegram_state` já existente (`operational-source-history:<hash>`). Não existe DDL, tabela nova, migração ou rotina de bootstrap neste módulo. A limpeza de conta inclui o novo namespace no mecanismo existente.

O escopo é exclusivamente o primeiro trecho da próxima jornada canônica. Usa `readOperationalBriefingPreview` real com `lockSource:true`, locks de conta/escala ativa e digest de conteúdo+revisão. Não aceita seleção de voo a partir de URL/job/dispositivo/cache. Um ticket server-side obtido antes de uma consulta deve coincidir com a escala atual quando a resposta chega; reimportação, mudança de conteúdo, revisão, owner ou ocorrência rejeitam a resposta atrasada. O leitor requer transação do caller e `lockSource:true` e toma `FOR UPDATE` em todo o registro de fonte, não apenas IDs.

O writer aceita somente portão com o contrato custom já admitido por `inspectOperationalChange`/`inspectGateSourceHistory`. Armazena apenas campos de prova/ocorrência/recebimento, descartando propriedades extras. Mantém duas observações, sem reconstruir histórico de `lastRadar`. A primeira é baseline; duplicata não renova recebimento/frescor; fonte ou recebimento fora de ordem não substituem o atual. Valores contraditórios no mesmo instante persistem uma marca de ambiguidade; o leitor bloqueia, e uma prova posterior começa nova baseline. Revisão diferente da escala também estabelece baseline nova, não transição entre revisões. Fonte envelhecida não é entrega atual.

O leitor retorna o contrato `{scope,source}` já consumido pela #1217. O SQL sintético usa esse leitor real no produtor e dispatcher reais: não injeta um objeto de histórico no lugar do leitor. Não há fila/outbox/transporte paralelo.

## Fronteiras OFF e integração restante

A constante literal `OPERATIONAL_HISTORY_ENABLED = false` protege todos os exports antes de DB. Não há callsite shipping, rota HTTP, timer, fetch, consulta de fornecedor nem permissão de gravar preferências. `enabled:true` é exercitado somente pelos testes. Não alterar essa constante ou conectar ao scheduler como parte deste draft.

O writer só pode ser conectado posteriormente no callback server-side de uma resposta Radar já autorizada, com ticket de ocorrência lido antes da consulta e prova custom original intacta. `publicRadarPayload.gateUpdate` é projeção normalizada; não a relabelar nem fabricar `departureGateUpdate`. A integração no writer `server.mjs` requer composição/ownership e testes da implementação real antes de ativação. Esta fatia não inicia consultas adicionais.

Mesmo após conectar esse writer, respostas do app ou `/radar` só atualizam a fonte quando há consulta: não são trigger autônomo. Feed/ingest sem app ainda precisa ser identificado e autorizado. Status continua recusado: não há prova temporal real no adapter atual. NOTAM não é expandido, não tem tópico/writer/leitor aqui e seu diagnóstico não é executado. Consentimento no Concierge é uma etapa separada, sem duplicar controles de #1229. Nenhuma preferência salva prova agendamento; nenhum teste prova recebimento físico.

## Validação

Testes de módulo usam engine canônico/SQL doubles sem rede, abrangendo OFF antes de DB, locks, replay, persistência após recriar módulo, baseline, frescor, conflito, ticket/revisão/owner e projeção mínima. MySQL isolado usa o padrão existente (`--network none`, socket e nome QA fixos): oito writers, reinício de módulo, oito planners, dispatch concorrente e transporte falso; teste RR cria snapshot antes de esperar owner e verifica a nova observação commitada durante espera. Uma contraprova remove o current-read somente no wrapper de teste e exige `HISTORY_STALE_READ`; não há knob de isolamento ou de teste no código de produção. O workflow existente de briefing executa testes e SQL raw/prepared, sem pipeline novo.
