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
