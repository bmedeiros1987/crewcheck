# Despertador: edição simples e próximo registro confirmado

Base isolada: main `c8944c26e2559e1a3c18dca1c87cb3a9461f1810`.
O incidente da ligação Infobip de19/10/2026 às07:30UTC continua separado:
esta mudança não prova causa, tentativa Voice, recebimento ou despertar.

A tela existente WakeupView passa a apresentar primeiro o próximo Wake pendente
retornado pela consulta autenticada, com horário, data, canal e estado. Depois
vêm horário/dia, a opção de usar a programação atual da escala e uma única
ativação. Canais, antecedência, histórico, diagnóstico e testes ficam em Mais
opções. A edição manual é um agendamento único na data escolhida, usando a fila
existente; não existe repetição semanal implícita nem novo worker/cron.

Editar não muda/cancela jobs existentes. Uma solicitação pendente ou incerta da
mesma programação bloqueia outra. O canal continua sujeito aos gates existentes:
somente Telegram com prontidão da conta pode ativar; Voice e combinações não são
habilitados por aparência, preferência ou cadastro de telefone.

O próximo registro não vem do formulário, preferências, toast ou heartbeat global.
Uma resposta de agendamento precisa coincidir em chave, instante, canal e estado
com a releitura da fila da mesma sessão antes do aviso de confirmação. Erro de
consulta remove a indicação de próximo registro confirmado. Troca de conta
invalida o snapshot e não reaproveita a edição manual de outra conta. Consultas truncadas em100 registros e jobs Wake malformados também ficam não
confirmados; a tela não adivinha o primeiro alarme ausente da resposta. A trava síncrona do envio evita
dois POSTs por cliques repetidos. Aceitação pelo provedor permanece distinta de
entrega, e horários vencidos/incertos não se tornam próximos alarmes futuros.

As datas manuais usam o fuso explicitamente mostrado do aparelho. Datas inválidas,
minutos inexistentes ou ambíguos por mudança de horário são recusados. O modo
pela escala preserva a origem/cálculo existente; não reinterpreta APZ, altera a
escala nem promete reprogramação automática de um job já salvo.

A implementação permanece no finalizador existente
`scripts/bids-default/wakeup-layout.mjs`, que já materializa esta tela após os
geradores históricos. O componente visual e a projeção pura não criam outra
rota, transporte ou implementação de Wake/MyCrewCare da PR872.

Revisão independente e CI são obrigatórios antes de integração. Sem chamada
real, reprocessamento, alteração de permissões/credenciais, publicação ou mudança
dos HOLDs1082/1085/1088/1111/MCC. Fixtures e imagens de teste são sintéticas.

## Review correction after 120adf99

A same-account focus refresh must not advance the authentication session or release
the active submission. Identity transitions (token/user change or logout) still
invalidate callbacks. Read sequence fencing rejects a pre-commit GET after the
post-commit readback; no stale snapshot overwrites the newer job. The browser
regression interleaves focus/POST/readback, delayed pre-commit reads, account change
and logout, retaining the synchronous duplicate-submission guard.

Receipt/readback equality proves a persisted record, not a pending future alarm.
Only a pending future job confirms scheduling. Sent/failed/cancelled/expired/held
remain terminal; uncertain/partial remain uncertain; processing/dispatching remain
in progress. The UI preserves those records and reports the actual category rather
than announcing a scheduled alarm. Pure projection tests now contain 73 assertions.
