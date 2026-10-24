# StayAlarm local durável — candidato de teste isolado

Esta fatia mantém o scheduler/receiver existente e não adiciona permissões, serviço,
polling ou sender. Produção continua com `PREPARED_HOST_ENABLED=false`.

O debug convencional mantém `com.crewcheck.app.mcctest`; o artefato desta
aceitação usa um identificador exclusivo, descrito ao final. Somente pacotes
de teste admitidos e debuggable podem instalar o host de teste. Uma programação só ganha autoridade
local durável depois de `replace` confirmado e journal em estado `scheduled`.
A autoridade armazena apenas owner/epoch/expiração até APZ; nenhum bearer, token
FCM, segredo ou credencial de sender é persistido.

Fechar a página/processo e expirar o lease online apenas suspendem a sessão.
Logout/auth-expired enviam revoke, gravam tombstone e recovery cancela/bloqueia
jobs do epoch anterior. No reboot/timezone/time-set o receiver existente usa o
journal + autoridade durável para rearmar somente registros ainda scheduled,
do owner/epoch vigente, futuros e antes da APZ.

O artefato `CrewCheck-StayAlarm-Offline-Test` é somente APK debug de teste,
não upload Play. Matriz física obrigatória: programar horário confirmado,
modo avião, tela fechada/processo removido, reboot antes/depois de desbloqueio,
Doze, timezone/time-set, editar/cancelar, logout A→B e provar zero alerta antigo.

## Correções após revisão dos três P1

Revogação explícita usa o escopo persistido quando a sessão curta já terminou;
o transporte conserva owner/epoch ao suspender. Um pedido antigo não revoga uma
sessão online mais nova. Só há recibo `revoked` após tombstone com leitura de
confirmação; falha retorna rejeição/unknown. A incerteza de persistência bloqueia
entrega em todas as instâncias do processo, inclusive o owner online. Recovery
continua tentando cancelar/bloquear os registros, sem prometer persistência após
reinício se tanto o journal quanto a gravação da revogação falharem.

A identidade verificada da mesma conta reutiliza o epoch local vigente. Mudança
real de conta precisa tombstonar a autoridade anterior antes de aceitar a nova.
Uma resposta atrasada de autenticação não modifica autoridade de geração nova.
Cancelamento incerto também revoga/quarentena o fallback antes de retornar,
sem permitir que resposta de epoch antigo revogue a conta atual.

O gate de API compila agora as três classes novas e executa contraprovas do host
real com Android Uri/JSONObject e dispositivos falsos: logout após expiração e
restart, reauth A→A, A→B, falha antes de pending-cancel e falha do tombstone.
O pacote de teste precisa ser o `.mcctest` debug existente ou a variante de
aceitação debug com marcador sintético exato;
o receiver de produção recusa autoridade durável enquanto o gate permanecer OFF.
Nenhum desses testes sintéticos substitui a matriz física do novo APK.

O caminho real de logout via `auth-changed` preserva o escopo antes de detectar
credencial ausente. O fixture de commit malsucedido também modela o comportamento
de SharedPreferences: cache já alterado e disco ainda antigo. Enquanto houver
incerteza, encontrar tombstone em memória exige nova gravação bem-sucedida antes
do ACK; não limpa a quarentena pelo cache. Recibo idempotente de revogação só é
permitido sem autoridade online e com ausência/tombstone durável confirmado.

## Entrega sintética sem conta real

O APK67f20cec e anteriores não contêm este painel: o fluxo normal desses builds
exige autenticação real. Eles ficam históricos/HOLD para a entrega sem conta.

O workflow dedicado agora adiciona somente ao APK de teste um marcador e um
manifesto debug temporário. Esse overlay remove MainActivity do artefato e aponta
o launcher para StayAlarmPhysicalFixtureActivity; os arquivos de MainActivity e
dos manifestos existentes não são editados. A CI verifica o launcher, o marcador,
o pacote exato, debuggable e os hashes antes de publicar o artefato.

O painel nativo usa contas fictícias A/B, um evento fictício e preferências locais
com namespace próprio. Não abre WebView, autenticação ou escala real. Não pede
permissões nem cria conta/credencial. Continua usando o mesmo engine, AlarmManager,
receiver e protocolo de revogação; não é prova da integração autenticada nem de
push remoto. A instalação fica a cargo do operador, somente após pedido específico.

Roteiro curto para o operador, depois de autorizar instalação:
1. Abra o app de teste separado e selecione a conta fictícia A. Se o painel indicar
   acessos insuficientes, pare e informe; este roteiro não autoriza novas concessões.
2. Escolha7min, confira horário/APZ fictícios e toque Confirmar teste. Só prossiga
   se aparecer scheduled. Ative modo avião, bloqueie a tela e remova o app dos
   recentes. Registre se apareceu uma única notificação e em qual horário.
3. Repita editando/cancelando e alternando A→B/logout: nenhum alerta antigo deve
   aparecer. Reboot, Doze e mudança de fuso exigem rodadas próprias; forçar parada
   nas Configurações é um estado separado, sem garantia de entrega.

Fonte e data aparecem como evento fictício salvo, sem anunciar dado operacional
atual. Produção, Play e sender remoto continuam OFF/fora desta entrega.

## Instalação lado a lado da aceitação

O artefato dedicado usa agora `com.crewcheck.app.stayaccept<RUN_ID>r<ATTEMPT>`,
atribuído somente ao build debug pelo init script temporário. Não modifica o
applicationId de produção nem o `.mcctest` existente; cada execução/tentativa
produz um pacote separado para evitar exigir atualização sobre outro debug com
certificado diferente. O host aceita esse formato apenas em debug e com o marcador
sintético exato. O painel mostra o identificador real do pacote.

A CI verifica o manifesto final, launcher e ausência de authorities de outro
pacote; `apksigner verify` precisa passar e o recibo inclui o fingerprint público
do certificado. Não há chave persistente nova, troca de certificado de produção,
instalação automática, desinstalação, limpeza de dados ou concessão de permissões.
O erro relatado no artefato anterior ainda não tem causa confirmada no aparelho.
Esta variante apenas oferece uma rota independente, sem alterar esse app anterior.

## Diagnóstico de acessos do pacote separado

Instalação/abertura não significa concessão de notificações ou alarmes exatos.
O artefato12578257185 mostrou somente um estado agregado insuficiente no aparelho;
o print não permite afirmar qual acesso falta. Nenhum alarme foi programado.

O painel passa a mostrar separadamente: serviços Android, notificações do app,
POST_NOTIFICATIONS (Android13+), alarmes e lembretes exatos (Android12+) e canal
Teste local CrewCheck. O mesmo snapshot sustenta o guard `permitted()`: qualquer
negação ou leitura não verificada continua bloqueando programação e entrega.
Atualizar diagnóstico apenas relê esses estados; não pede grants nem agenda.

Somente após autorização específica do operador para este app de teste: em
Configurações → Aplicativos → CrewCheck Teste Offline Isolado → Notificações,
permitir notificações e conferir o canal Teste local CrewCheck; em Acesso especial
a apps → Alarmes e lembretes, permitir somente esse app se a opção existir.
Os nomes dos menus variam por fabricante. O identificador exibido no painel deve
corresponder ao app selecionado. Não conceder localização/arquivos/contatos,
desativar segurança, autorizar sobreposição ou excluir otimização de bateria.

Depois de voltar, atualizar o diagnóstico e confirmar um novo horário futuro.
A autorização de notificações não programa nem envia nada sozinha. O alarme só
existe após confirmação explícita e recibo scheduled; prontidão de capacidades
não prova entrega. Bateria/carregamento e demais condições físicas precisam ser
registrados como condições do ensaio, sem usar exceção de bateria como atalho.
