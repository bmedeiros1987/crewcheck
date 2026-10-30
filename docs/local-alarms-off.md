# Alarmes locais agrupados e descanso a bordo — OFF

Status: **desligado**. `LocalAlarmAndroid.ENABLED = false` (nativo) e `INFLIGHT_REST_ALARM_ENABLED = false` (web). A tela não está montada em nenhuma página. Nenhuma permissão nova, serviço, credencial ou custo.

## Por que um agendador novo

O caminho ativo (`scheduleNotification(title, body, epoch)`) só agenda: não cancela nem substitui um aviso específico. A única limpeza que existe é a da conta inteira. Um alarme de descanso precisa ser reprogramado quando a escala muda, e o aviso antigo não pode tocar. Por isso os alarmes vêm em **grupos**, sempre substituídos ou cancelados por inteiro.

## O que entra

- `shared/inflightRestPlan.mjs`: planejador puro. Divide o período de descanso em turnos iguais, de minutos inteiros e com intervalo fixo de troca. A sobra, menor que o número de turnos em minutos, fica no último turno. Gera o alarme do fim do próprio turno e, se o usuário pedir, um alarme em cada troca. Os instantes são absolutos, em ISO com offset; um `HH:mm` solto nunca é interpretado. Horários que já passaram são informados e nunca armados. Mínimo de 30 min por turno, de 2 a 6 turnos, troca de 0 a 30 min e janela de até 20 h.
- `LocalAlarmLedger.java`: diário puro dos alarmes agrupados (`inflight-rest:`, `validity:`, `report:`, `roster-change:`).
  - Substituição tudo ou nada: o diário invalida o grupo antigo **antes** do cancelamento no sistema. Se o sistema não aceitar algum alarme, o grupo fica vazio.
  - Cada alarme fica ligado à **época da cerca de conta** (`NotificationLedger`) e ao **boot** em que foi armado. Logout, troca de conta ou reinício do aparelho invalidam o alarme.
  - O alarme é consumido uma única vez e pode tocar até 20 min atrasado (Doze/alarme inexato). Títulos e textos nunca ficam no diário.
- `LocalAlarmAndroid.java` / `LocalAlarmReceiver.java`: adaptador Android.
  - Dois canais versionados (`crewcheck_local_alarm_v1` com som de alarme e vibração; `crewcheck_local_vibrate_v1` só com vibração). Os avisos simples usam o canal existente.
  - `setAlarmClock` quando já existe permissão de alarme exato. Sem ela, o alarme é inexato e a tela avisa que pode atrasar.
  - O alarme toca de forma insistente até ser aberto ou dispensado.
  - A cerca roda a cada `setNotificationCancellationScope`, mesmo com o recurso desligado; a resposta existente não muda.
- Ponte em `AndroidCrewCheckNative`: `localAlarmCapabilities`, `replaceLocalAlarms`, `cancelLocalAlarms` e `localAlarmGroup`. Todas respondem `disabled` enquanto o recurso estiver OFF.
- `client/src/lib/localAlarms.ts`: revalida cada resposta. Só conta como armado o que o aparelho confirmar exatamente: mesmos ids, horários e canais.
- `InflightRestAlarmView.tsx`: tela para dividir o descanso e programar ou cancelar os alarmes. Renderiza `null` enquanto o recurso estiver OFF.

## Limites conhecidos

- **Reinício:** nada é restaurado após reiniciar o aparelho, porque não há dono verificado no boot (mesma regra do `NotificationLedger`). A tela mostra o que ainda está armado e pede para reprogramar.
- **Sem pedidos de permissão:** não há pedido de permissão nem de alarme exato, e nada passa por cima do "Não perturbe".
- **Sem teste físico:** ainda não houve teste físico em aparelho.

## Antes de ligar

1. Revisão do diff exato e CI verde.
2. Montar a tela (Home ou detalhe do voo) numa PR separada.
3. Teste físico: som e vibração com a tela bloqueada, modo silencioso, Doze, troca de conta e reinício.
4. Só então trocar as duas constantes para `true`.
