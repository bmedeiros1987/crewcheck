# Edição de pernoite e despertador por APZ no hotel

Esta draft prepara o editor de programação e a prévia do despertador. Não programa
alarmes, não consome MyCrewCare em produção e não altera Home ou o apply reservado
à PR990. A base inicial é o HEAD revisado da PR991; a base de integração será seu
merge real `6209a29eeee137a00fad598859d422dbe317fafa`.

## Referência do despertador

O único referencial relativo permitido é a APZ no hotel confirmada, com data e
fuso explícitos, menos a antecedência. APZ da escala, decolagem, check-in/out e
pickup não a substituem. O contrato da PR951 fornece hotel/reserva e pickup;
ele não fornece APZ no hotel nem confirma equivalência pickup/APZ. Portanto a
função de planejamento rejeita todo candidato de APZ do provedor nessa versão.
Não há import do painel, hook, runtime ou controlador da PR951, nem mudança em
suas chaves/fences desligadas.

Uma APZ salva continua preenchida como solicitado. A APZ da escala não preenche
pernoites (guarda da PR991 preservada). Data e fuso são confirmação manual para
esta prévia. Nunca usamos o fuso do aparelho para resolver horários do hotel.
Conversões locais rejeitam datas inválidas e minutos ambíguos/inexistentes no DST.

## Modos e preferências

- Auto: opção transparente, APZ no hotel confirmada menos a antecedência padrão
  configurada. Não contorna fonte, consentimento, permissão ou proteção desligada.
- Relativo: antecedência padrão, individual de 90/60 min ou personalizada. Mudança
  da APZ recalcula com a mesma antecedência individual.
- Absoluto: instante escolhido com data/fuso; mudança da APZ mantém a escolha e
  recalcula a diferença. Horário igual/posterior à APZ ou passado gera aviso.
- Sem APZ: relativo exige entrada manual. Absoluto pode mostrar a escolha, mas
  não inventa diferença e não fica apto a agendamento.
- O horário final é exibido como calculado, com data e fuso, nunca como programado.
- Mudar padrão é ação separada. Overrides relativos e escolhas absolutas permanecem.

O padrão e as novas escolhas de alarme **ainda são prévias desta sessão**. Não são
persistidos como novo contrato de servidor. A edição existente de hotel/quarto/
APZ usa a API existente e diferencia cache local de sincronização confirmada.
Não anunciar persistência global ou programação efetiva antes do contrato abaixo.

## Identidade, edição e navegação

`openStayProgramEditor(event)` é a futura ação explícita do card de pernoite.
Ela carrega somente IDs no Navigation Context existente e vincula sua intenção
à sessão autenticada em memória. O editor abre o item indicado, sem selecionar
outro silenciosamente quando o item desaparece. Seu retorno deposita o mesmo ID
para HotelsView. Home ainda precisa chamar esse helper e consumir esse retorno;
não alegamos o fluxo completo de Home entregue enquanto esse encaixe está reservado.

O preenchimento prioriza associação explícita `rosterEventId`. O fallback legado
por data só é permitido com aeroporto exato e candidato único; dois pernoites
na mesma data/local bloqueiam salvar em vez de escolher uma linha arbitrária.
Rascunhos individuais preservam campos manuais, inclusive vazios e escolhas
absolutas, ao trocar item e ao atualizar a escala. Mudança de intervalo mantém
os ajustes e pede revisão. Descartar edição é explícito. Troca de sessão limpa
rascunhos e invalida respostas antigas; a API legada ainda tem efeitos de cache
próprios, que não são tratados como prova de isolamento server-side nesta draft.

## Idempotência e limite do dispositivo

O plano puro utiliza identidade estável de conta/escala/item; modo, APZ e
antecedência não criam novos IDs. Uma alteração pode propor update do mesmo job
pendente. Jobs cancelados/terminais não são reativados; processamento em curso,
duplicatas ou revisão obsoleta pedem resolução explícita. Não executamos nenhuma
dessas propostas nem chamamos `/api/alarm/schedule`.

O bridge nativo atual tem `scheduleNotification(title, body, epochMillis)`, mas
não oferece replace/cancel por identidade nem resultado transacional verificável.
Seu boolean pode indicar apenas postagem para a UI thread. A implementação web
é um timer de aba e não comprova alarme em segundo plano. Não usaremos esse bridge
para alegar idempotência ou programação efetiva. A fila Telegram é server-side e
também não comprova programação no aparelho. É necessário um contrato revisado de
substituição/cancelamento/resultado antes de integrar programação por pernoite.

## Validação e escopo visual

Testes puros em UTC, America/Sao_Paulo e Pacific/Auckland cobrem identidade,
item atual, remoção, revisão, isolamento de conta, campos manuais vazios,
procedência/frescor de pickup separado, bloqueio de fontes falsas de APZ, modos,
defaults/overrides, virada de data, fusos/DST, diferença em tempo real, conflitos,
permissão/capacidade, idempotência e cancelamento.

O browser usa o componente real e um lançador sintético que chama o helper real,
API/conta/escala fictícias e CSS do próprio componente, em 390/1280 px. Testa
toque/seleção/retorno, APZ salva, ausência de fallback da escala, edição, modo
absoluto, diferença, padrão separado, atualização, remoção e troca de conta.
Intercepta todas as escritas e exige zero saves/alarmes. Isso não é teste de Home,
Android físico ou programação de alarmes.

A Library resolveu o JPEG privado, mas a materialização falhou neste executor.
Não lemos seus pixels e não afirmamos comparação visual com ele. Nenhuma captura
privada está no Git ou nos artefatos; capturas desta draft são sintéticas.
