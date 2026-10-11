# Adapter nativo de pernoite — preparado, OFF

Esta mudança prepara o contrato Android e o transporte JSON. Não instala o
endpoint no WebView, não conecta o adapter ao editor e não emite uma sessão
nativa autorizada. O editor continua calculado/não programado. Os testes usam
device, armazenamento e identidade sintéticos; nenhum alarme é programado num
aparelho. Não há alteração de permissões, versões, assinatura ou publicação em
lojas. Não foram encontrados AGENTS.md ou skills locais em .agents/skills neste
checkout/ambiente.

## Operações e limites de confirmação

`StayAlarmEngine` é o núcleo Java executado nos fixtures. O driver real
`StayAlarmAndroid` usa AlarmManager, PendingIntent, SharedPreferences e
NotificationManager. `StayAlarmBridge` é um endpoint JSON comum, **sem**
JavascriptInterface e sem instalação em MainActivity. A factory JS recebe um
transporte explicitamente fornecido e só existe com enabled, capacidade nativa
compatível e leitores de conta/sessão. Nenhum import/constructor automático na UI.

Identidade conta+pernoite mantém action/component/data/requestCode fixos. O data
URI contém SHA256 da identidade, independente de horário/modo. O journal inclui
revisão monotônica, operationId, epoch da sessão nativa, instante absoluto, APZ,
modo e estado. Request velho falha por revisão; retry do mesmo comando atual
mantém uma única identidade. IDs de operação reutilizados com outro conteúdo são
rejeitados. Cancelamento preserva tombstone para não ressuscitar após reboot.

Prepare/commit do journal ocorre antes da API do Android; commit final e readback
ocorrem depois. Falha de OS, disco ou resposta resulta em unknown, nunca em
boolean de sucesso. API e disco não formam uma transação única: pendências são
reconciliadas usando a mesma identidade. AtomicReplace refere-se à substituição
de um PendingIntent no scheduler, não a uma transação distribuída com disco.

A confirmação `native-api-and-journal-completed` significa que as chamadas
nativas terminaram sem erro e o estado foi persistido/revalidado. Não confirma
alarme presente em uma consulta do OS (AlarmManager não oferece esse recibo por
job), notificação vista, som ouvido, despertar ou execução física. Respostas têm
deliveryConfirmed:false. Epoch nativo opaco é capturado nas capacidades e exigido em cada request/receipt; uma requisição enfileirada antes de reautenticar a mesma conta não recebe o epoch novo automaticamente. A factory exige protocolo/key/operationId/instante/
revisão/ack correspondentes e descarta respostas após troca de conta ou sessão,
inclusive logout/relogin na mesma conta. Token de sessão web não é serializado.

## Reboot, edição, revogação e entrega

Receiver privado recebe boot, package-replaced, clock/timezone e concessão de
exact-alarm. Recuperação roda fora da thread principal; restaura somente jobs
futuros confirmados, do dono/epoch válidos e com permissões atuais. Instantes
absolutos não se deslocam com timezone. Relativo recebe o novo instante calculado
pela APZ confirmada; absoluto conserva o instante escolhido, com validação APZ.
O driver não infere pickup, hotel, contrato ou horário de escala.

Cancelamento tenta remover PendingIntent/AlarmManager e a notificação daquele
job antes do recibo durável. Inspeção não agenda um alarme antes de cancelar.
Revogação **detectada**, expiração da sessão ou troca de epoch cancela/bloqueia.
Concessão de exact-alarm coloca jobs antigos em blocked; não reativa preferência
sem nova confirmação explícita. Cancelled/blocked/expired/delivery-unknown não
são restaurados automaticamente. O host futuro deve reconciliar em resume e em
mudanças de autenticação/permissão. Não há API que ofereça histórico durável de
toda revogação transitória POST_NOTIFICATIONS enquanto o processo esteve morto;
não alegamos cobertura desse intervalo sem validação/integração do host.

Receiver compara revisão+instante com o journal, dono/epoch, permissões e janela
de120s; ignora envelopes antigos, futuros, após APZ ou atrasados. Uma claim
durável precede NotificationManager: crash/erro depois dela mantém resultado de
entrega desconhecido e não repete a tentativa. Isso troca retry por proteção
contra notificação duplicada; pode perder uma tentativa após crash. O driver
publica somente texto genérico privado no canal crewcheck_alerts **já existente**.
Canal ausente/bloqueado recusa programação. Não configura canal/som, full-screen
ou serviço de áudio e não promete comportamento de despertador audível.

## Bloqueios exatos para ativação

1. Aparelho Android autorizado e testes físicos de idle/Doze, reboot, clock,
   permission/channel revocation, edição/cancelamento concorrentes, processo
   morto e áudio/visibilidade. Mocks/API compilation não substituem isso.
2. Host nativo confiável para emitir/renovar/revogar verifiedOwnerId,
   verifiedOwnerEpoch e verifiedOwnerExpiresAt. Não existe writer nesta PR;
   payload JSON/localStorage não constitui autoridade. Gate
   physicalValidationApproved começa false, sem setter exposto.
   Toda alteração de owner/epoch/gate/lease deve usar
   StayAlarmEngine.updateTrustedOwner, incluindo revogação/logout. A entrega
   revalida owner e permissões depois do claim durável e imediatamente antes de
   notify, dentro da mesma seção crítica. Se a revogação completar primeiro,
   entrega é suprimida; se notify executar primeiro, logout posterior não desfaz
   a tentativa. A integração desse contrato no host ainda não existe e é
   requisito de ativação. Verificação de credencial/rede fica fora do lock.
3. Transporte com origem e frame verificados, como WebMessagePort/listener com
   allowlist do app. Não registrar o endpoint como JavascriptInterface global
   acessível a iframes. Conectar leitura de conta/sessão e lifecycle/reconcile
   somente depois de revisão física/de segurança. Nenhuma origem é liberada aqui.
4. Se o requisito for áudio persistente/full-screen de despertador, há trabalho
   separado de produto/plataforma/política. Nenhuma permissão nova foi adicionada
   e esta implementação é um trigger de NotificationManager, sem promessa de
   alarme audível. iOS não possui bridge no repositório e não é adaptado por um
   timer web.

## Evidência reproduzível

`node --test scripts/regression-stay-alarm-android.mjs
scripts/regression-stay-editor-persistence.mjs scripts/regression-stay-edit-plan.mjs`
executa38 testes JS: recibos malformados/boolean, correlação, epoch web, OFF,
confirmação, modos e serialização, além dos contratos existentes.

`node scripts/regression-stay-alarm-native.mjs` compila/executa o núcleo Java
real com57 assertivas e fake Device/Store/Owner: reboot, OS/disco, CAS, tombstones,
revogação, dono/epoch, receive atrasado/duplicado e corrida replace/cancel.

`STAY_ANDROID_API_JAR=/path/android-all.jar node scripts/regression-stay-alarm-api.mjs`
compila driver/receiver/endpoint reais contra classes API35 (Android15), sem APK,
e executa o JSON endpoint real na JVM com24 assertivas e fake device, incluindo filterEquals dos Intents Android reais para identidade estável/contas distintas. O jar
Robolectric fica temporário no runner, fixado por URL/SHA256 no workflow. Não é
um Android runtime físico ou teste do AlarmManager real. Cloud local usa ECJ
porque possui JRE, mas não javac; CI usa JDK17. O build Android existente valida
o source set do app; nenhuma publicação em loja é disparada por esta tarefa.

## Fontes oficiais

Mesmo PendingIntent substitui o alarme anterior; reboot exige restauração.
canScheduleExactAlarms deve ser observado; revogação cancela exact alarms e
concessão envia broadcast. [Android: schedule alarms](https://developer.android.com/develop/background-work/services/alarms).
Identidade de PendingIntent usa o intent filtrado, não seus extras;
[PendingIntent](https://developer.android.com/reference/android/app/PendingIntent).
Chamadas set/cancel não confirmam entrega física;
[AlarmManager](https://developer.android.com/reference/android/app/AlarmManager).
