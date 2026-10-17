# Android / notificações — diagnóstico e candidato local, 15/10/2026

Follow-up P2: a referência direta ao PNG no splashv31 foi substituída por drawable
com inset27%, preservando a arte. Evidência e limites atuais em
`docs/android-splash-mask-review-20261015.md`; as etapas anteriores abaixo
permanecem como histórico, não aceite físico.

Base: `2286c88ffed330246f1c39bed5ad7bb4d64e7851`. Escopo exclusivo Android e
notificações. Não há AGENTS.md/SKILL.md no checkout nem conteúdo em
`/workspace/.agents`; a consulta de contexto pessoal retornou indisponível.
Nenhuma credencial, configuração de produção, permissão, envio real, publicação,
instalação, desinstalação ou limpeza de dados foi realizada.

## Ownership e trabalho reaproveitado

- #1040 está mesclada: `b78613b1f321cc79e9ce7ff25e3f7eff1787bab5`.
  Reutilizados boot-progress.mjs, fast reveal, watchdog e etapas reais web.
  A PR registra publicação web, mas aceite físico Android pendente.
- #1028/#1033/#1034 mescladas: pipeline/journal/publicação permanecem OFF;
  nenhum workflow_dispatch foi solicitado nesta investigação.
- #1039 permanece draft e possui alterações nativas de recebimento de PDF:
  MainActivity/receiver de PDF não foram editados ou reincorporados.
- #891 permanece draft, com Home/chat/Pulse; #1032 é composição de evidência.
  Nenhum arquivo financeiro, Home ou Pulse foi editado. A tarefa paralela
  `01a14131-659f-75b9-a79d-dda202cd301b` mantém esse ownership.
  Não foi possível inspecionar o estado interno das outras tarefas pelo ambiente;
  a conferência efetuada foi de PRs e checkout, não um lock global de writers.

## Notificações: fronteiras atuais

1. **Android oficial:** MainActivity agenda PendingIntent explícito para
   CrewCheckNotificationReceiver via AlarmManager.setAndAllowWhileIdle.
   O receiver usa NotificationManager. Não há FirebaseMessagingService,
   dependência Firebase Messaging, registro/token FCM, rotação/revogação nativa
   ou cadastro de tokens Android no caminho inspecionado. O serviço Wear existente
   é sincronização de relógio, não recepção remota de notificações do telefone.
2. **Alarmes locais:** bridge true confirma apenas enfileiramento na UI thread.
   Falhas posteriores são capturadas sem confirmação ao chamador. AlarmManager
   ausente ou bloqueio pelo sistema podem não chegar ao UI. Não há restauração
   de alarmes no boot (RECEIVE_BOOT_COMPLETED declarado sem receiver correspondente),
   persistência/owner/cancelamento nativo comprovados nesse caminho.
3. **Defeito/risco demonstrável em fonte:** NotificationTiming descarta disparo
   com atraso superior a 120 segundos; o agendamento é inexato. A documentação
   Android permite atraso maior que isso, particularmente sob Doze. Não se deve
   simplesmente remover a validade e entregar avisos operacionais vencidos.
   A correção precisa transportar validade explícita do evento e identidade da
   conta/cancelamento; não foi ampliada arbitrariamente nesta alteração visual.
   Isso não prova a causa específica no aparelho de Bruno.
4. **Permissão/canais:** POST_NOTIFICATIONS está declarada. permissionStatus
   lê separadamente permissão, areNotificationsEnabled e importância do canal;
   o canal ainda inexistente pode retornar null. MainActivity e receiver usam
   `crewcheck_alerts`, mas criam DEFAULT e HIGH respectivamente. A configuração
   efetiva de um canal existente e a escolha do usuário não podem ser inferidas
   dessas constantes. Nenhuma permissão/canal real foi consultado ou alterado.
5. **Web/PWA:** a #996 já integrada acrescentou PushManager, worker com listener,
   cadastro autenticado, vínculo owner/installation/revision, revogação,
   outbox e provider VAPID. Portanto os documentos de 08–09/10 que afirmam ausência
   de Web Push são históricos, não retrato da base atual. A configuração é
   fail-closed: WEB_PUSH_ENABLED literal true e configuração válida são necessários.
   Nenhuma variável/segredo real foi lida; estado do deploy atual é desconhecido.
   A presença desse código não cria um receptor push nativo no wrapper.
6. **Preferências:** mobilePwa/watch/crewCierge e Todos representam intenção;
   não concedem permissão, não habilitam transporte nem comprovam entrega.
   Worker exige vínculo atual, consentimento e validade. accepted_unconfirmed e
   display_api_resolved não significam recebido/lido. Concierge/pernoite e avisos
   internos relatados por Bruno não comprovam esse transporte no Android fechado.

Referência de tempo Android: https://developer.android.com/develop/background-work/services/alarms

## Abertura e correção local

Há três superfícies: splash do sistema, overlay Java e abertura React. O tema
anterior não definia windowSplashScreen* para Android 12+. O overlay preparado
usa crewcheck_logo_neon e #00010E; ele só revela o web quando detecta conteúdo
montado. O progresso web então acompanha sessão/perfil. Isso pode formar a
sequência percebida de dois progressos; não foi filmada/reproduzida em aparelho.

Candidato local restrito a resources: base comum AppTheme.Base, fundo #00010E
e variante values-v31 apontando explicitamente para crewcheck_logo_neon com o
mesmo fundo. Sem nova Activity, dependência, timer ou lógica de recuperação.
Não reimplementa a #1040 e não afirma eliminar todos os progressos/transições.
Após preparação canônica, ícone web e recurso nativo têm SHA256 aprovado
`3656d39df50e32094211ef737c0237a26308e7e742bcccc855a87150f47a638c`.
Em fonte bruta, aliases históricos podem diferir; avaliar artefato preparado.
Compilação de recursos Android passou no follow-up abaixo; enquadramento/máscara
e continuidade visual permanecem pendentes em aparelho. Referência:
https://developer.android.com/develop/ui/views/launch/splash-screen

## Evidência e limites dos testes

Node 24.19.0 disponível. Cache-only npm ci falhou por yauzl não armazenado;
npm ci --ignore-scripts --no-audit --no-fund em /tmp concluiu com 271 pacotes.
Não houve audit remoto, instalação no checkout principal ou inicialização do app.

PASS sintético antes de editar: browser-reminder-scheduling (23 casos),
notification-preference-projection, web-push-provider, web-push-api,
web-push-offline e web-push-lifecycle. Repetição após primeira preparação passou;
provider/DB/worker/auth são mocks/fixtures, sem notificações reais.

PASS após preparação limpa do candidato: p0-android-self-heal/regression,
startup-progress, startup-lifecycle (19 casos), approved-brand-assets.
XML foi parseado; herança, referência ao drawable existente e cor foram conferidas.
Gates release_workflow_off e check_mobile_workflow_scripts passaram na base.
TypeScript (`tsc --noEmit`) e Vite build do candidato preparado limpo passaram;
build em 12,84 s com aviso de chunks grandes existente. O app preparado conserva
versionCode 144110 / versionName 14.4.11; não houve aumento de versão nesta tarefa.
Isso não comprova a versão instalada nem oferece atualização in-place por si só.

Uma segunda preparação sobre árvore já preparada e depois alterada falhou em
scripts/v1396/apply.mjs por marcador legado ausente; a árvore parcial também fez
approved-brand-assets falhar em idempotência de sw.js. Não foram relaxados gates.
O candidato foi revalidado em novo archive limpo, com somente o delta XML e uma
preparação completa. Não atribuir resultados dessa árvore limpa à árvore parcial.

## Dependências externas e desbloqueios

- Testes acima usam recursos locais e fixtures. Não demonstram disponibilidade
  Aiven/MySQL de produção, scheduler Render, implantação exata ou configuração
  VAPID. Nenhuma operação em Aiven ou serviço Render foi executada; a consulta
  de sessão/listagem de workspaces do Render está registrada no follow-up.
- Compilação Java/recursos Android foi desbloqueada e passou no follow-up;
  APK oficial assinado continua pendente. O run antigo 38548933634 não valida
  este candidato.
- Preservado applicationId com.crewcheck.app, signing e versionamento existentes.
  A fonte bruta pode ser 14.4.09; o materializador alinha 14.4.11. Nenhum desses
  nomes determina versionCode/certificado do APK instalado pela Play.
- Antes de oferecer APK para atualização in-place, comparar package/versionCode
  e SHA256 público do certificado instalado com o APK candidato. O workflow usa
  upload key; Play App Signing pode ter certificado diferente. Não remover app,
  limpar dados ou trocar assinatura para contornar incompatibilidade.
- Push remoto nativo exige receptor/transporte e configuração existente
  verificável; ausentes no caminho atual. Não criar projeto, credenciais,
  permissões ou infraestrutura sem autorização específica. Web Push preparado
  não basta para declarar resolvido o APK oficial.
- Teste físico posterior: solicitar autorização para um único aparelho/conta,
  canal, conteúdo genérico, horário e quantidade. Separar teste de alarme local
  com app em background de teste remoto com processo encerrado; force-stop,
  reboot e perda de permissão são cenários distintos. Primeiro coletar apenas
  metadados de versão/assinatura e leitura das configurações, sem token secreto.
  Nenhum teste físico/envio está autorizado ou foi executado por este relatório.

Estado: candidato LOCAL compilado para revisão, sem commit remoto, PR, merge,
deploy, distribuição de APK ou loja. Entrega fora do app continua não resolvida.

## Follow-up: Android realmente compilado e Chrome/PWA separado

### Ferramentas, compilação e assinatura

- Gradle 8.13 baixado da distribuição oficial; SHA256 conferido:
  `20f1b1176237254a6fc204d8434196fa11a4cfb387567519c61556e8710aed78`.
  Command-line tools oficiais conferidas contra SHA1 do repository2-1.xml
  `e025545c62a8e64c7559119566a569fb1dec5f60`; SDK36 revision2 e Build Tools35.0.0
  instalados somente em `/tmp/crewcheck-android-tools`. Android CLI com
  `--no-metrics`; sem device, emulator, instalação do app ou novo serviço.
- Download de JDK pelo endpoint Adoptium recebeu 403 Forbidden e foi encerrado,
  sem rota alternativa para esse download. Descobriu-se que o Java21 local contém
  jdk.compiler/jdk.jlink, embora os launchers javac/jlink estejam ausentes.
  Launchers temporários chamam esses módulos reais, com lib/conf/release locais
  e java.home no diretório temporário. Não foi usado compilador stub, nem
  alteração do Java/sandbox/sistema. `run.py` registra os paths e proxy já existente.
- Tentativas históricas preservadas: Gradle sem proxy não resolveu AGP; com
  proxy, parou por JAVA_COMPILER ausente; após launcher, por jlink ausente.
  Todas foram corrigidas com recursos locais e propriedades temporárias, sem
  alterar Gradle, dependências, SDK mínimo/alvo ou signing do repositório.
- **PASS Android debug:** :app:compileDebugJavaWithJavac e
  :app:processDebugResources, BUILD SUCCESSFUL em21s.
- **PASS Android release:** :app:compileReleaseJavaWithJavac e
  :app:processReleaseResources, BUILD SUCCESSFUL em19s. Inclui o MainActivity,
  receiver, AndroidX e os recursos reais do candidato; não é build web ou stub.
  Manifest release efetivo: com.crewcheck.app /144110 /14.4.11.
- Parâmetros de assinatura release estão ausentes no ambiente. O gate existente
  store-policy.gradle exige assinatura para assembleRelease/bundleRelease;
  a execução real de :app:assembleRelease falhou em12s exatamente na linha26:
  `Release signing is required; unsigned store artifacts are forbidden.`
  não será removido nem se produzirá um APK oficial com chave substituta.
  Nenhum certificado/keystore existente foi lido, criado ou trocado.
  Classes e recursos intermediários compilados são evidência; não são APK
  instalável nem atualização aprovada da Play.
- Avisos preservados: Gradle APIs deprecated, XML SDK novo e analytics.settings
  em diretório não gravável. Não bloquearam a compilação Java/recursos.

### Clock sintético e política dos alarmes

`regression-android-notification-timing.mjs` compila a classe Java real e executa
12 casos com clock fixo. PASS: futuro/sem data/sem permissão são rejeitados;
atrasos 0/1/119999/120000ms passam;120001ms/10min/1h são descartados.
Também confere que o receiver usa essa classe e que o agendamento usa o método
inexato. É uma caracterização da política atual, não uma correção ou teste físico.
A validade de120s continua explícita; ampliar esse prazo exige validade de evento,
owner e cancelamento definidos. Não se alegou que esse descarte explica o aparelho.

### Chrome/PWA: botão reaproveitado e limites de envio

- O botão já existia em CrewCheckPushDevice dentro das preferências de
  notificações (BidsAlertPreferences); não foi criado outro fluxo ou alterada Home.
  Agora, com serviço habilitado e permissão default, mostra **Autorizar no navegador**.
  granted mostra **Ativar neste aparelho**; denied orienta a configuração do site
  sem repetir prompt; ausência de recursos mostra indisponibilidade. Cadastro
  existente mantém opção de cancelamento, inclusive com serviço desabilitado.
  Renderização/foco/leitura de preferências não pedem permissão. Transporte,
  endpoint, consentimento e inscrição existentes foram preservados.
- Chrome/Chromium real, com mocks de runtime/display e rede limitada ao localhost:
  UI default/denied/granted/unsupported, serviçoOFF, troca de conta tardia e
  recibos sem falsa entrega PASS. Worker real + IndexedDB: dedupe concorrente,
  persistência após fechamento da página, expiração, revogação e conta PASS.
  Nenhuma permissão real, PushManager.subscribe real ou showNotification real.
- Matriz adicional da ativação real: default/denied não inscrevem; granted só
  inscreve/salva/vincula com owner, enabled e confirmação explícitos. Desabilitado,
  sem conta e sem confirmação não chamam nem o mock de permissão. PASS.
- API autentica conta e confere origem; registro guarda subscription protegida e
  revisão. Worker é importado por sw.js; offlineRuntime registra o worker na raiz
  e conecta lifecycle. Logout/expiração/troca de conta revogam, sem garantia de
  confirmação remota offline. Provider usa VAPID, valida destino, TTL e timeout;
  aceitação não é entrega/leitura. Testes API/provider/lifecycle continuam PASS.
- O produtor atual é **BIDS**, chamado no scheduler existente; não é fan-out de
  todos os avisos internos/Concierge para Web Push. CURRENT_BIDS_ALERT_CAMPAIGN
  continua null na fonte: não há campanha oficial vigente configurada. Portanto
  permissão+cadastro, mesmo válidos, não bastam para gerar um aviso. Não ativar ou
  inventar campanha para testar. MySQL/eligibilidade/fonte/horário/quiet/consentimento
  são revalidados no produtor/outbox; nada disso foi lido em produção.
- Necessários, já previstos no código: WEB_PUSH_ENABLED literal true,
  WEB_PUSH_ORIGIN HTTPS exato; VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY correspondentes,
  VAPID_SUBJECT válido, WEB_PUSH_ENCRYPTION_KEY hexadecimal64. Não se leem valores
  secretos para conferir presença. Nenhuma dessas variáveis foi criada/alterada.
  Existência/validade delas no deploy atual continua desconhecida.
- Usada habilidade Render env-vars somente para investigar leitura segura.
  get_selected_workspace retornou ausência de seleção; list_workspaces retornou
  Bruno's workspace `tea-d6hvu975r7bs73f6631g`. O conector exige confirmação do
  workspace; pergunta enviada, sem confirmação disponível nesta etapa. Nenhum
  serviço foi selecionado/consultado nem ambiente modificado. Os tools expostos
  não incluem leitor de presença de env vars: update_environment_variables não
  será usado como leitura. Metadados de serviço tampouco comprovam chaves válidas.
- Se configuração existente faltar, geração/ativação de chaves/configuração
  requer aprovação específica. Mesmo havendo configuração, precisam de validação
  do transporte implantado, fonte elegível, opt-in explícito do aparelho e teste
  real específico autorizado. Botão e mocks não comprovam entrega fora da página.
- TypeScript e Vite após o delta PWA passaram; build11,07s com aviso de chunks
  grandes. Sem mudanças em Home/financeiro/Pulse e sem deploy.

## Follow-up: pipeline oficial build-only e produtores de rotina

### Acesso e assinatura sem extrair segredo

Pré-voo local: branch `work`, remoto
`https://github.com/bmedeiros1987/crewcheck.git`, HEAD2286c88f. A leitura
`git ls-remote origin refs/heads/main` confirmou exatamente
`2286c88ffed330246f1c39bed5ad7bb4d64e7851`; não houve avanço de main entre essas
leituras. Sete arquivos locais desta frente, sem mudança em Home/financeiro/Pulse,
MainActivity ou contrato de PDF da #1039. Ownership das PRs foi conferido na etapa
anterior; não há lock global de tarefas nem revalidação remota de todos os writers.

O CLI `gh api user --jq '{login,id}'` retornou literalmente
`Get "https://api.github.com/user": Forbidden`. Portanto identidade/autorização de
escrita não foram comprovadas; não foi tentado push, criação de branch/PR,
workflow_dispatch ou troca de rota/credencial após a recusa. O acesso de leitura
Git não autoriza inferir identidade, permissões de escrita ou acesso a secrets.
Não houve rejeição de auto-review nesta etapa: a recusa observada foi do acesso
GitHub pelo CLI. Este é o bloqueio operacional do build assinado remoto.

Workflows existentes inspecionados, sem alteração:

| Caminho | O que já faz | Limite para este candidato |
| --- | --- | --- |
| mobile-self-heal-signed.yml | workflow_dispatch com checkout do ref selecionado; prepara/testa, usa JDK17/Gradle8.13/SDK36, restaura chave existente somente no runner, gera APK+AAB, verifica assinatura e preserva artefatos14dias, remove JKS temporário | É a rota existente mais direta para APK de revisão de uma branch dedicada após push autorizado; não contém publicação Play. O filtro de PR não inclui os arquivos XML deste candidato; não presumir disparo automático. Dispatch não tentado com identidade recusada. |
| mobile-only-internal.yml | build-only padrão; publish_mobile_internal false; APK+AAB/proveniência em artefato7dias; assinatura existente no runner | Exige current main, PR já mesclada, SHA exato e CI independente, além de environment protegido. O candidato é local e não pode ser substituído pelo SHA antigo #1040 nem ser mesclado só para satisfazer esse gate. |
| android.yml | PR de mesma origem gera bundles assinados e verifica certificado público; publicação exige main+workflow_dispatch+flag explícita | Faz principalmente AAB app/Wear/WatchFace, não substitui o APK desejado. O evento PR neste candidato não habilita publicação. Nenhum flag foi alterado. |

O workflow de self-heal referencia CREWCHECK_KEYSTORE_BASE64,
CREWCHECK_STORE_PASSWORD, CREWCHECK_KEY_ALIAS e CREWCHECK_KEY_PASSWORD existentes;
sua presença/validade atual é desconhecida. Não se leem valores e não se cria chave.
Após um futuro run autorizado: conferir ref/SHA/tree efetivos e base de revisão,
package/versionCode, digest APK/AAB e SHA256 público do certificado. Mesmo APK
validamente assinado pela upload key não prova compatibilidade com Play App Signing.
Não baixar JKS nem service-account JSON, e não publicar/instalar para testar.

### Configuração atual: fronteira da leitura segura

Não há leitura segura de presença de env vars exposta pelo conector Render atual.
O único workspace listado continua sem confirmação solicitada na etapa anterior;
não se escolheu workspace automaticamente. O app possui GET autenticado
`/api/platform/notifications/crewcheck-installation`, que retorna enabled somente
se configuração completa válida e publicKey quando disponível, sem chave privada;
não há sessão autenticada do usuário disponibilizada neste ambiente para consultá-lo.
O diagnóstico autenticado existente observa somente WEB_PUSH_ENABLED e marca
configuration/installation/delivery como not_observed. Não se extrai token do usuário.

O GET público `/api/notifications/runtime-health` **não é estritamente
observacional**: chama ensureNotificationTable/ensureCommuteTables/ensureSchedulerHeartbeatTable.
Não foi chamado para tentar inferir configuração, nem foi usado como teste de
produção. `render.yaml` é blueprint em fonte, não evidência da configuração viva.
Assim, não há confirmação atual de presença/validade VAPID nem de transporte
implantado. Corrigir permissões do navegador sozinho não resolve esse bloqueio.

### Mapa dos produtores existentes (leitura, sem ativação)

| Produtor/fonte | Transporte atual real | O que falta para página/app fechado |
| --- | --- | --- |
| lifeConcierge.ts:scheduleLifeRemindersForToday, acionado por LifeConciergePanel | Hidratação, movimento e estudo do contexto local: CrewCheckPremium.scheduleNotification → AlarmManager no wrapper ou setTimeout da página no browser | Browser fechado perde timer. Preferências/contexto são locais, sem produtor de rotina persistido e revalidado no servidor; inscrição PWA não converte esse timer em Web Push. |
| Home:saveRadarSnapshot / useOperationalRadarPulse | Compara ocorrência/portão e publica aviso canônico; Pulse→native.notify/new Notification enquanto JS executa | Sem execução em background não busca novo Radar nem produz evento. Falta produtor server-side com os mesmos gates e fonte/ocorrência; não iniciar polling/provedor nem copiar o classificador de Home. |
| Home:useOperationalWeatherPulse / useWeatherLandingMonitor | Monitores JS e cache atual, avisos Pulse/sistema durante página viva | Mesma lacuna de produtor persistente; não transformar meteo antiga em alerta push. |
| server.mjs:runCriticalWeatherMonitorCycle | Monitor meteorológico existente, opt-in/canary/lease e dedupe próprios; envia Telegram diretamente | Não chama outbox Web Push. Candidato de integração deve consumir a decisão existente e revalidar consentimento/frescor, sem ativar canary ou multiplicar fetches. |
| /api/alarm/schedule → safeScheduleJob → runSchedulerCycle/dispatchClaimedJob | Fila SQL existente, owner atual/revinculação/dedupe/cancelamento, Telegram e canais de chamada existentes | Lista permitida não inclui Web Push. Não adicionar mobilePwa à string de canais nem reutilizar mensagem arbitrária do cliente como evento confiável. |
| registerCommuteMonitor → runCommuteMonitorCycle | Monitor de transporte persistido, origem/destino/apresentação, atualiza trânsito, cooldown/fingerprint e Telegram do vínculo atual | Falta adaptador do evento validado para outbox Web Push; monitor ativo sem Telegram não produz aviso PWA. Não chamar rota externa para testar, nem ligar outro scheduler. |
| Conversa Concierge/pernoite | Webhook/consulta autenticada e sendTelegramMessage em resposta; consultas de hotel/pernoite usam snapshot/histórico | Não comprova agenda proativa de pernoite ou canal mobile. Não foi identificado produtor genérico de aviso proativo de pernoite para Web Push no caminho auditado. O relato de funcionamento não identifica sozinho qual desses caminhos disparou. |
| server/concierge/briefing-preferences.mjs | Contrato de apresentação desconectado, submissionAllowed:false | Não há ativação/UI/persistência/agendamento decorrentes desse contrato; não anunciar briefing em background entregue. |
| BIDS bidsProducer | Scheduler existente→outbox Web Push persistida, origem/eligibilidade/preferências revalidadas | CURRENT_BIDS_ALERT_CAMPAIGN null; não é produtor de rotina e não será ativado como atalho de teste. |
| Compliance/mudanças de escala/folga | Alguns avisos locais explicitamente systemNotification:'never'; filas free-day seguem held/OFF | Preservar política; não converter todo publishCrewCheckNotice em push. |

### Proposta de conexão canônica — NÃO implementada/ativada

1. Reusar o cadastro/worker/consentRevision, `enqueueCrewCheckPush`,
   `dispatchPersistentPush`, outbox na crewcheck_telegram_state e ciclo servidor
   existente. Não criar nova fila, broker, credencial, timer servidor ou duplicar
   o motor de alertas. Primeiro candidato pequeno: adaptador de uma decisão já
   produzida pelo monitor de transporte, após revisão do binding de owner desse
   monitor; sem novo fetch de rota. Rotina Life só depois de um snapshot
   autenticado de preferências/contexto com revisão/expiração, atualmente ausente.
2. O opt-in mobilePwa e cadastro são necessários, mas a escolha BIDS não equivale
   a consentimento para hidratação/meteo/transporte. Reusar preferências canônicas
   por conta e switches específicos existentes; mapear/confirmar explicitamente
   cada categoria. Todos não concede permissão nem habilita categorias novas.
   Revogação, logout/recriação e edição do evento cancelam/invalidam pendentes.
3. Definir eventKey estável por produtor+ocorrência+versão+slot, derivado de IDs
   canônicos e hash limitado ao contrato160, sem PII. Usar dedupe já existente
   owner/eventKey/installationId/consentRevision. A versão de fonte e de preferências
   entram no sourceContext; revisar sua imutabilidade ao reutilizar a função de
   enqueue, cujo update atual é específico de preferencesRevision BIDS. Não
   reativar accepted/uncertain nem usar relógio atual como novo ID a cada ciclo.
4. O dispatcher atual recebe verifyContext BIDS: inserir outra categoria na
   outbox sem estender essa validação seria incorreto. A extensão deve despachar
   a validação para o adaptador de categoria permitido, mantendo BIDS intacto e
   bloqueando categoria desconhecida. Revalidar owner atual, fonte, revisão,
   consentimento, instalação, quiet hours, deadline e cancelamento sob os mesmos
   locks antes do claim/envio. A versão de evento nova invalida a antiga pendente.
5. Envelope continua genérico CrewCheck e /app; sem itinerário, saúde, hotel/quarto
   ou coordenadas na tela bloqueada. A informação detalhada fica no app autenticado.
   Aceitação do provider, processamento local e clique continuam distintos de
   entrega/leitura. Não prometer exactly-once nem dedupe entre alarme Android
   legado e PWA: os alarmes locais ainda não têm ledger de owner/cancelamento.
6. Gates de teste da futura integração: produtor não é executado com OFF;
   opt-out/categoria não consentida/fonte vencida/owner trocado/revisão antiga
   bloqueiam; concorrência duplica zero envios; revogação antes do cutoff cancela;
   resultado incerto não reenvia; edição de fonte cancela versão velha. Fixtures
   e MySQL descartável primeiro, CI/revisão e só então um teste real específico
   autorizado. Nenhum desses gates autoriza ativar transporte em produção agora.

### Política de relevância por categoria antes de alterar120s

| Categoria | Regra proposta para definição/revisão, sem mudar runtime |
| --- | --- |
| Despertador/saída | Manter janela120s existente até especificar validade vinculada ao alarme/APZ e cancelamento; não tocar aviso atrasado depois da ação/apresentação ou reativar soneca. |
| Portão/status/trânsito | latest source+ocorrência/rota atuais e deadline operacional explícito. Substituir/suprimir versão ultrapassada; uma notificação atrasada não pode recomendar trajeto/portão desatualizado. |
| Meteorologia | Fonte atual, estação/voo e validade do boletim; decisão do avaliador canônico, sem alargar limiares ou reaproveitar cache vencido. |
| Hidratação/movimento/estudo | Slot escolhido pelo usuário, quiet hours e contexto atual; expiresAt deriva do fim do slot/relevância, ainda a definir/aprovar. Não usar120s universal nem inventar prazo médico. |
| Hotel/pernoite/briefing informativo | Ocorrência/estadia e revisão atuais, prazo de utilidade explícito; cancelar quando mudar hotel/estadia/evento. Não incluir quarto/endereço em lock screen. |
| Compliance/folga/roster com never/OFF | Continuar interno ou held até autorização e fonte apropriadas; sem promoção automática para push. |

Essa proposta define os requisitos que faltam; não cria transporte nativo nem
afirma que Android/PWA estejam corrigidos em aparelho. A política120s e as filas
existentes continuam intactas neste candidato.
