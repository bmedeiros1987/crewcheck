# StayAlarm local durável — candidato de teste isolado

Esta fatia mantém o scheduler/receiver existente e não adiciona permissões, serviço,
polling ou sender. Produção continua com `PREPARED_HOST_ENABLED=false`.

O APK debug usa o applicationId já isolado `com.crewcheck.app.mcctest`. Somente
esse pacote pode instalar o host de teste. Uma programação só ganha autoridade
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
O pacote de teste precisa ser exatamente `com.crewcheck.app.mcctest` e debug;
o receiver de produção recusa autoridade durável enquanto o gate permanecer OFF.
Nenhum desses testes sintéticos substitui a matriz física do novo APK.

O caminho real de logout via `auth-changed` preserva o escopo antes de detectar
credencial ausente. O fixture de commit malsucedido também modela o comportamento
de SharedPreferences: cache já alterado e disco ainda antigo. Enquanto houver
incerteza, encontrar tombstone em memória exige nova gravação bem-sucedida antes
do ACK; não limpa a quarentena pelo cache. Recibo idempotente de revogação só é
permitido sem autoridade online e com ausência/tombstone durável confirmado.
