# Radar Cirium: wiring OFF com fonte sintética injetada

Base: main `5583684bb4d5326c0df3fe74da97c6a32b32c386`, com PR1014 e
contrato PR1013 integrados. Este incremento não contém transporte HTTP Cirium,
credenciais, variáveis de ativação, flag de query, polling ou configuração.

O registro Cirium permanece `available:false/state:disabled`. Chamadas reais
de `handleRadar(req,res,url)` continuam usando o fallback existente. Somente
um quarto argumento **injetado por código** com `cirium.enabled === true`
percorre `handleRadar → runRadarRace → runCiriumRadarInjection` e recebe uma
fonte sintética fornecida pelo teste. Esse caminho antecede a corrida legada;
não muda prioridade/consenso dos provedores atuais nem constitui integração
de uma conta Cirium de produção. HTTP não pode fornecer função JavaScript.

Antes de chamar a fonte, reutiliza a validação do contrato puro e exige
`flight` compatível com o carrier FS/número explícitos. Identidade vem dos
parâmetros carrierNamespace, carrierFsCode, flightNumber, origin, destination,
departureDate, originTimeZone e scheduledDepartureUtc, sem nenhum default.
Não usa o scheduledDeparture derivado do horário do browser/Home para provar
data operacional. Cadastro confiável aeroporto–fuso, extração/aliases,
freshness máxima, orçamento e transporte são etapas futuras não autorizadas.

A resposta preserva provider/state, chave UTC exata, todas as proveniências e
observação conhecida. `configured` continua false mesmo no teste available,
pois não existe transporte de produção configurado. Para qualquer estado
Cirium, `canonicalReadOnly:true` e `exportedToConcierge:false`: retorno antes
de auth, load, `conciergeApplyRadar` e save. Não altera escala/roster/APZ,
financeiro, MCC, Home, Watch, Wake, notificações ou Play. O fluxo legado de
persistência permanece como estava para resultados não Cirium.

O materializador altera apenas import/registro, publicRadarPayload, a entrada
da corrida e o handler Radar. Preserva assinaturas/âncoras das transformações
v14390/91/92. Sua única linha na cadeia fica depois dos patches existentes e
antes da função fechar; preparation-cache e o finalizador terminal
sync-canonical-manual não são modificados. Âncora inesperada falha fechada.

Teste direto: `node scripts/regression-cirium-radar-wiring-off.mjs` (3 fusos).
Extrai os handlers reais de server.mjs em VM com fetch proibido e counters.
Com fonte sintética prova chegada de gate/identity/provenance à resposta e
zero acessos a env, rede, fallback, auth, snapshots ou escrita canônica.
OFF prova payload/counters idênticos ao caminho legado padrão; a query
ciriumEnabled é ignorada. OFF não proíbe os provedores legados já existentes.

`node scripts/check-cirium-radar-wiring-off.mjs` testa raw e preparado,
preparação fria/repetida/invalidação/restauração e gates Radar/escala/estadias/
financeiro. Seus filhos herdam somente TZ. TypeScript/build/server/smoke são
verificados pelo CI web existente. Revisão independente e segunda revisão
do parent antes de merge. Nenhuma ativação ou API real faz parte deste PR.

## Bloqueio encontrado na preparação

A preparação fria e repetida passa, incluindo o wiring em três fusos.
Invalidação de um arquivo de runtime obriga replay e falha em
scripts/v139/apply-core.mjs: âncora ausente em Telegram CrewLock.
Reprodução independente na base5583684 sem este wiring: cold=0, repeat=0,
invalidate=1, mesma âncora. O checker conserva a falha; não a ignora nem
altera preparation-cache/apply-core. A correção dessa frente está fora da
reserva atual. Este gate impede aprovação final/merge do wiring enquanto
não for resolvido e revalidado na composição.
