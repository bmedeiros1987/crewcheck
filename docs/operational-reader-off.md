# Leitor compartilhado no ciclo Telegram existente — OFF

Cadeia desta fatia: main d7c43258 → #1217/9f719717 → #1231/e4c30390 → #1232/e68df215 → esta branch. PR baseada em `feat/radar-operational-history-off`, não main. Além do teste do HEAD exato raw, a cadeia inteira é composta por merge normal com a main fixada `3d506335ff7a293a9eb6c199682f5d88764d5039` em checkout QA local e CI. Nenhum merge QA é publicado em main ou nos drafts anteriores.

`server/concierge/operational-history-reader.mjs` adapta o leitor SQL #1231 para os dois callbacks já previstos pela #1217. `runSchedulerCycle` entrega a mesma função ao produtor e ao dispatcher existentes, sem novo timer, classificador, fila, outbox, transporte ou esquema. O adapter não muda o conteúdo do histórico nem força locks silenciosamente: preserva now/lockSource do caller. Sua configuração é fechada na criação; job/request options não elevam enabled.

`OPERATIONAL_HISTORY_ENABLED`, `TELEGRAM_OPERATIONAL_CHANGE_ENABLED` e o gate de captura Radar continuam literais false. O leitor shipping retorna null antes de DB/opções e o produtor permanece disabled. Jobs forjados no namespace reservado continuam cancelados pelo dispatcher OFF. Status segue sem prova temporal própria; o leitor só fornece histórico de portão. Callback Radar #1232 continua limitado à consulta autenticada já existente do app. Nenhum trigger autônomo foi criado e nenhuma consulta upstream foi executada.

Não há UI ou alteração de consentimento. O opt-in por assunto no Concierge permanece com o owner da #1229, ainda não publicada; esta fatia não reserva nem edita seus hunks. TTS/Infobip, financeiro, Home, bootstrap e dados/ambiente reais não são alterados. Antes de qualquer ativação ainda é necessário concluir os gates/revisões da cadeia, integrar consentimento pelo próprio usuário e identificar trigger/fonte autorizados sem app. Não há entrega física comprovada.

## Testes e composição

O harness MySQL existente executa a função `runSchedulerCycle` extraída do shipping, com produtor, adapter de leitura e dispatcher reais habilitados exclusivamente na fixture. Somente relógio SQL NOW(3), componentes não envolvidos e transporte são falsos, no banco/socket QA já guardados e container sem rede. Preserva captura Radar original, oito writers, restart, dedupe, revisão/ticket, locks e contraprova RR. O primeiro ciclo deve planejar e enviar um evento, e o segundo não repete. Duas contraprovas retiram a ligação do leitor separadamente no planner/dispatch, apenas na cópia da função em teste, exigindo SCHEDULER_READER_WIRING. Não há knob de teste no runtime.

O workflow existente roda raw no HEAD da branch; depois compõe a main fixada e executa build completo, TypeScript, prepared, MySQL, browser e safeguards na árvore composta. Conflito de merge falha como gate, sem resolução automática ours/theirs. Configuração de identidade Git é exclusivamente do checkout efêmero QA e não produz push. A composição não equivale a integrar/publicar.

## Revisões anteriores: investigação, não bypass

#1217: comentário6371328410 informa running em9f719717 desde a solicitação, sem erro nem receipt. Todos os workflows/checks GitHub Actions desse HEAD terminaram; não existe check-run do Codex ou job associado exposto que possa ser passado ao rerun oficial de Actions. Não foi publicado pedido duplicado nem alterado o comentário do bot. A documentação oficial https://learn.chatgpt.com/docs/third-party/github descreve @codex review como solicitação; não expõe retry da mesma execução running. Os metadados disponíveis não permitem diagnosticar causa interna ou forçar término.

#1231: receipt6382641432 e summary6382501141 da rodada concluída não possuem SHA; REST reviews só vincula o parecer anterior do bot a259ec68f e a resposta do próprio autor ae4c30390. Não há check-run Codex/identificador de execução público para recuperar a associação. Não foi aceito como aprovação exata. Como essa rodada estava completed, foi solicitada uma nova revalidação específica de e4c30390, sem alterar o HEAD e sem duplicar execução running. Parecer/recibo novo continua gate independente.
