# Wake por etapas: relógio, confirmação e fallback preparados OFF

Complemento da mesma PR1114. A primeira etapa fda26469 teve CI próprio aprovado.
Não é nova PR, nova rota, integração MyCrewCare ou correção comprovada da ligação
histórica. Um teste manual bem-sucedido de ligação Telegram ou Infobip comprova somente
esse caminho explícito, não a criação de um job futuro nem sua execução automática.

## O que existe nesta etapa

A WakeupView existente mantém horário/data explícitos, opção pela escala e próximo
registro realmente consultado no servidor. Não há repetição semanal implícita.
Mais opções separa alarme local, fallback por falta de confirmação, ligação direta
e mensagem direta. Mensagem Telegram continua usando exclusivamente o fluxo
existente e sua confirmação persistida; desmarcá-la não cancela um job salvo.

Alarme local, relógio externo, Já acordei sincronizado e chamadas automáticas
permanecem indisponíveis na UI por capacidades hard OFF. Salvar/editar preferência
não muda isso. O teste manual é explicitamente diferente do agendamento automático.
Não se afirma que o provedor está indisponível por causa desse gate de UI.

O módulo `shared/wakeupCycle.mjs` implementa um protocolo puro preparado. As
fixtures usam recibos e armazenamento CAS em memória, sem transporte, worker,
bridge, fila offline instalada ou banco real. O construtor não é um endpoint de
ativação, e seus recibos assumem adaptação/autenticação já validada. A implementação
real precisa de criação única por conta/ocorrência e transação com releitura; não
pode recriar uma instância vazia para contornar uma execução anterior.

## Semântica simulada

- Soneca: adia o toque local apenas com recibo local. Só o recibo do servidor muda
  o deadline do fallback. Offline, a janela anterior pode continuar valendo.
- Dispensar/Parar som: silencia o toque, sem afirmar que o usuário acordou.
- Já acordei: ação explícita. Recibo local offline fica pendente. O fallback só é
  suprimido após o servidor confirmar a mesma ocorrência/revisão/dispositivo/ação.
- A frase da UI é “Ligar se não recebermos sua confirmação até X”, com data/hora
  da prévia e informação inequívoca de que o recurso ainda não está habilitado.
- Ligação/mensagem diretas são etapas distintas no horário, não uma inferência de
  falta de resposta. A política preparada é conservadora: uma tentativa Voice por
  ocorrência, compartilhada entre direto/fallback. Desconhecido não libera outra.

A chave inclui conta, ocorrência, revisão do plano, etapa e canal, com componentes
codificados sem ambiguidade. Sequências são independentes por dispositivo; dois
aparelhos não confundem seq1 de A com seq1 de B. Recibo e plano vinculam todas as
opções, não só o horário: mudar preferência não autoriza fallback ou chamada.

Reserva CAS não autoriza envio. `beginWakeDispatch` revalida escopo, revisão,
deadline, confirmação e orçamento antes de persistir `dispatching`. ACK recebido
entre reserva e despacho cancela só o fallback ainda não despachado. ACK posterior
não promete recolher uma chamada em andamento. Soneca concorrente pode deferir a
mesma reserva, invalidando o worker antigo. Callbacks duplicados não duplicam
efeitos. Timeout fica incerto e só é reconciliado com referência estável do
provedor; não retorna a estado elegível por retry automático.

Mudança de escala/fuso/conta invalida a revisão anterior. Revisar o plano exige
recibo de revogação local e nova confirmação; qualquer efeito aceito, em despacho
ou incerto obriga reconciliação antes de abrir outra revisão executável.

## Android e limites físicos

O [contrato AlarmClock](https://developer.android.com/reference/android/provider/AlarmClock)
permite solicitar criação no relógio externo. Ele não fornece o recibo explícito
de acordado usado neste desenho; abrir o relógio ou observar seu próximo alarme
não serve como confirmação. O manifesto atual não declara SET_ALARM e a bridge
atual não expõe essa integração. Nenhuma permissão foi adicionada.

Para controle de ocorrência e ações, a opção a avaliar é alarme próprio com
[AlarmManager.setAlarmClock e PendingIntent](https://developer.android.com/develop/background-work/services/alarms).
Há código anterior em PR872 (`CrewCheckWakeScheduler`/`CrewCheckWakeAlarmActivity`)
que deve ser coordenado e revisado, sem importar seu MyCrewCare opcional nem criar
outro scheduler paralelo. Esta PR não o compõe, não o ativa e não altera Android.
Novo APK, revisão do host/recibos, elegibilidade Play e validação física continuam
necessários. A permissão de alarmes exatos já declarada não prova concessão no
aparelho. Não se presume áudio, tela bloqueada, reboot ou bateria testados.

[Force-stop no Android15](https://developer.android.com/about/versions/15/behavior-changes-all#stopped-state)
cancela PendingIntents. O modelo marca local como indisponível para reboot,
force-stop ou revogação; não restaura automaticamente nem promete entrega
universal. Um opt-in de fallback anteriormente persistido no servidor não é
criado nem silenciosamente apagado por esse evento local.

## Dependências antes de liberar

Web: revisão e CI desta PR, sem equiparar simulação a recurso nativo funcionando.
Android: composição revisada do módulo existente, contrato de recibos e APK;
nenhum contorno de MCC/1082/1085/1088/1111 ou permissão nova implícita.
Servidor: estado durável por ocorrência, ACK autenticado e dispatcher coordenado
com a fila existente, correlação do provedor e reconciliação de resultado incerto;
sem novo cron pago e sem habilitar chamadas nesta mudança. Aparelho: confirmar
som/bloqueio/processo/bateria/reboot, conta/fuso e ações, antes de liberação.

Incidente Voice: preservar investigação separada. O código canônico manual e o da
fila diferem no fallback de voz configurada após HTTP400; a comparação sintética
reproduziu essa diferença sem rede. Não há prova de que tal resposta/configuração
ocorreu às07:30. Ainda faltam job/recibo correlacionados e login no portal existente.

## Review corrections after 120adf99

A failed Voice dispatch consumes the occurrence attempt across later plan revisions.
Informative edits can still be represented, but the failed call slot and its original
key carry forward, blocking both direct and fallback call execution for that occurrence.
Invalidation only withdraws confidence; `local.everConfirmed` preserves the obligation
to revoke a previously armed ticket. Revision requires an explicit old-revision
revocation receipt even after roster/timezone invalidation, reboot or force-stop. A
new arm receipt does not cancel the prior alarm. All capabilities remain OFF.

Revocation is matched to the old account/occurrence/revision, device, stable native
`ticketId`, scheduled ring instant and complete old plan binding. An arm receipt
without a ticket ID cannot establish a confirmed local alarm. A revocation from a
different device or ticket, even with matching plan scope, cannot authorize replacement.
The synthetic lifecycle suite now contains 149 assertions; none activates a native adapter.
