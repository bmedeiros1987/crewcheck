# Despertador: seleção contextual de meios e telefone

Base revisada: main a65c24f8e3c51bfb3b5fbdf4e7377612e3b57169 (PR1000 já publicada). Esta mudança exige revisão independente e CI terminal antes de merge; não houve novo deploy.

No Despertador, a escolha inicial herda Menu → Notificações. Desmarcar a herança permite selecionar meios e salvar uma escolha local por conta e programação. Salvar não altera alarmes existentes ou o padrão central. Qualquer edição bloqueia a ativação até salvar. Uma solicitação pendente da mesma programação bloqueia outra ativação. O armazenamento contém apenas versão, identificador canônico da conta, hash de programação/instante e canais; nenhum telefone, destinatário ou texto de escala.

Somente mensagem Telegram pode solicitar agendamento neste fluxo, com configuração e vínculo da conta confirmados pela resposta autenticada. O pedido usa o vínculo derivado pelo servidor, sem destinatários do armazenamento legado. Combinações são preferências pendentes: o normalizador da fila aceita combinações, mas o dispatcher atual não executa essas combinações. Ligação Telegram permanece pendente de franquia/autorização; ligação telefônica permanece pendente de número verificado e disponibilidade/autorização por conta. Não se inventou verificação nem multicanal. Aceitação não comprova entrega ou despertar.

O atalho no Despertador abre Menu → Notificações → Ligação · número e disponibilidade. O telefone usa a preferência canônica já existente e o mesmo salvamento com owner/revision. Fica oculto por padrão, mostrando apenas os dois últimos dígitos; trocar de conta fecha sua edição. Cadastrar não verifica o telefone, envia código ou habilita chamadas. Telegram usa o usuário vinculado ao bot, não esse número.

Validação local: TypeScript raw/preparado, build, modelo por conta/alarme, UI real do Despertador preparado, central, preferências BIDS (claro/escuro e texto ampliado), projeção de preferências, handlers de preferências/autenticação, segurança da fila e regressões sintéticas de folga. HTTP/transportes são simulados; zero envio real, pedido de permissão ou ativação paga. Imagens de revisão são fixtures sintéticas, não prova de aparelho, produção ou recebimento.

Não modifica main.tsx, stay-alarm-host-runtime, editor de pernoite, native/Android/watch nem implementa as PR997–999. Não muda flags, credenciais, planos ou serviços. BIDS oficial continua não verificado; entrega com aplicativo fechado e entrega física continuam não comprovadas.

## Correções da revisão de ae6ac2cd

A troca de conta recebida por `storage` agora invalida e recarrega a escolha local, inclusive A → B → A sem remontagem. O escopo resolvido fica associado à conta, `eventId` e instante: mudar a programação não emite `ready:true` usando o escopo anterior. Um teste React 18/jsdom retém o hash para observar essa transição.

O botão e o handler exigem histórico de alarmes em estado `ready`. Uma trava por referência é invalidada no início síncrono da consulta, antes da atualização React, e fica fechada em erro ou troca de conta. O teste da UI preparada mantém a consulta retida, invoca diretamente o handler, falha a consulta e depois retorna um alarme pendente com antecedência de 75 minutos para uma preferência de 90 minutos: nenhuma segunda solicitação passa. Transportes simulados; nenhuma mensagem ou chamada real.
