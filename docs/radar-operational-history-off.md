# Callback Radar para histórico — OFF, dependente de #1231 e #1217

Cadeia real: main `d7c43258` → #1217 `9f719717` → #1231 `e4c30390` → esta fatia. Base desta branch é `feat/telegram-operational-history-off`; não modificar nem incorporar os drafts anteriores sem seus gates/revisões. O recibo sem findings da #1231 não contém SHA; o review formal vinculado ao HEAD mais novo é a resposta do autor, não parecer do bot. Não tratá-los como aprovação formal do HEAD. #1217 ainda aguarda parecer automático, sem solicitação duplicada.

## Ownership

Contato específico autorizado por Bruno com a tarefa `01a167df-7fd7-7304-a17b-31bfa758101a` confirmou ausência de reserva/hunks em providerCustom/runRadarRace/handleRadar/conciergeRadarReply e snippets. O integrador confirmou que financeiro, UX #1229, offline #1230 e WhatsApp não editarão esses hunks e designou esta frente como writer único desta conexão. #1143 é draft histórica sobre o ramo Cirium do Radar; foi inventariada, não incorporada nem alterada. Futuro merge dessa branch requer preservar o callback e sua admissão. Não houve contato com outras tarefas, navegador pessoal ou ambiente de produção.

## Integração mínima

Cinco linhas funcionais no `server.mjs` existente ligam o handler autenticado do app ao writer #1231. O hook é literal OFF antes de identidade/DB/imports do histórico. O módulo de histórico também deve estar explicitamente habilitado; mudar somente um gate não ativa persistência. Não existe env/URL/preferência capaz de ligar esses gates nesta composição.

1. Antes da consulta já existente, `beginRadarOperationalHistory` usa `requireExistingIdentity` (sem criar perfil) e o principal do briefing. Lê ticket da próxima ocorrência canônica em transação/locks pela #1231. Somente o primeiro trecho admitido pela fonte canônica pode gravar; uma consulta Radar sobre outro voo continua sem captura.
2. `providerCustom` entrega a resposta original ao capturador privado antes de descartar `departureGateUpdate`. Só o contrato custom real é admitido; não converte `gateUpdate` público, timestamp genérico ou dado Cirium em prova. Retém recebimento original e campos mínimos, sem secrets ou prova raw na resposta pública.
3. Depois da seleção e das revalidações existentes do handler, commit exige prova/valor/ocorrência/recebimento concordantes com a resposta selecionada e ausência de conflito. A retenção concordante de prova custom quando outro fornecedor vence mantém o recebimento original; divergência não grava.
4. Revalida sessão e escala/revisão sob locks via writer #1231. Resposta tardia de outra conta/revisão, expiração, fonte sem prova e falha/resultado incerto não são confirmados nem repetidos pelo mesmo capturador. Falha de histórico não relabela resposta Radar como erro de fornecedor nem mente sobre persistência.

O fluxo existente ainda realiza exatamente suas consultas anteriores quando chamado: esta composição não dispara upstream, polling ou query adicional. Nenhum fornecedor foi executado nesta tarefa. `/radar` por vínculo legado, `/saida`, Cirium e outros consumidores não recebem captura automaticamente. Não há novo transporte/dispatcher, mudança de consentimento, preferência ou UI. Os testes de handlers extraídos receberam o hook shipping OFF, mantendo seus asserts e zero DB extra.

## Limites e gates

Ambos os gates permanecem false. O produtor/dispatcher shipping da #1217 continua com leitor padrão null: esta PR não conecta esse leitor nem ativa entrega. O harness SQL injeta o leitor real explicitamente, como teste, e usa transporte falso. Ainda faltam composição do leitor no ciclo existente, opt-in por assunto no Concierge (owner separado), atualização autônoma autorizada sem app e prova temporal real de status. NOTAM não é expandido. Nenhum teste equivale a recebimento físico ou funcionamento automático com app fechado.

## Validação

Harness novo executa providerCustom/runRadarRace/handleRadar reais com fontes falsas e capturador real; armazenamento downstream é mockado nessa parte. Abrange OFF antes de dependências, ambos os gates, aliases, prova ausente/antiga/futura/contraditória, conta/revisão substituída, expiração, conflito entre fornecedores, prova concordante retida, recebimento original, não vazamento de raw, incerteza e commit único, sem consulta extra. A regressão MySQL existente agora executa também o capturador real com writer/leitor reais, antes do produtor/fila/dispatch e transporte falso. Mantém oito writers, restart, concorrência e contraprova RR. MySQL permanece somente no banco/socket QA isolado do workflow existente; nenhuma migração/DDL é executada em produção.
