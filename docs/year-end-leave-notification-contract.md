# Folga de fim de ano: fonte e bloqueios

Fonte inspecionada pelo analista do parent: Library `libfile_d373259b27688191bf0452ee40581a98`, **Folga de Fim de Ano_2026_2027_Cabine.pdf**, página 1. Isto não é fonte para datas BIDS.

## Dados verificáveis

- Público: Cabine. Janela 15/09–20/10; encerramento 23:59 improrrogável.
- Ciclo 2026/2027 consta no nome do arquivo. Ano 2026 da janela é inferência, não declaração explícita do corpo.
- Hora de abertura e fuso ausentes. Não converter a meia-noite, UTC ou fuso do aparelho por convenção. Nenhum instante foi criado.
- Formulário oficial: https://docs.google.com/forms/d/e/1FAIpQLSehDGJW8pRXXb5j5HbMw0-NSF5Q8nVS7Yb9EwzTqOBhhBllXA/viewform?usp=dialog
- Portal SAB, somente conta @latam. Não submeter nem autenticar nesta tarefa.
- E-mail confirma recebimento, permite edição até fechamento. Preenchimento não concede folga. Análise 10/11, escala 25/11.

## Pedido do Bruno e contrato para revisão

Mensagem: **Já solicitou sua folga de fim de ano?** Ações **Já solicitei** e **Lembrar depois**. Nenhum horário de início foi solicitado. 00:00 não consta como abertura no PDF e não será usado por convenção. O menor dado necessário para um instante seguro é o fuso aplicável; o ano ainda deve conservar seu grau de evidência.

Confirmação significa declaração do usuário de que enviou a solicitação; jamais `aprovada`. Estado deve persistir no servidor por usuário e edição anual, com janela estável, revisão da fonte e operação idempotente. Atualizar título/link/data da mesma edição não deve apagar confirmação. Nova edição exige identidade explícita nova e começa sem confirmação; duplicar uma edição não pode criar alertas independentes.

Na confirmação, a transação deve gravar estado e cancelar todos os trabalhos pendentes dessa janela/usuário. O despachante precisa checar esse estado e a revisão na transição atômica para envio. Repetir confirmação deve manter cancelamento e retornar o mesmo resultado. Testar confirmação concorrente com edição, exclusão, reconexão e claim do despachante em MySQL real isolado.

`Lembrar depois` precisa persistir escolha explícita com instante futuro dentro da janela e fuso validado; não inventar intervalo. Confirmação posterior cancela essa escolha também. Conta trocada nunca pode reaproveitar decisões ou alarmes do usuário anterior.

## Fatia implementada para revisão

`Já solicitei` chama rota autenticada, confere `sub` contra o perfil atual e grava declaração no armazenamento JSON existente. Transação serializa perfil, estado do ciclo e cancelamento de todos os canais da fila existente com prefixo exato de ciclo/usuário. A repetição conserva `submittedAt`. Uma conta recriada não herda declaração antiga. O despachante de trabalhos de ciclo toma os mesmos locks antes do corte de envio. Chaves `cycle:` não podem ser criadas pela rota genérica de agendamento. Nenhum instante desta janela é autorizado: `schedulingAllowed` permanece falso.

A tela só mostra confirmação após resposta do servidor; falha/offline mantém estado sem sucesso inventado. Respostas anteriores à troca de sessão são descartadas. `Lembrar depois` está desabilitado e a rota rejeita esse comando até existir fuso/instante explícito. A confirmação não significa concessão da folga.

Claims BIDS também passam por lock de janela e registro JSON durável antes do envio. Seleções alteradas/removidas são rejeitadas; resultado desconhecido é retido sem nova tentativa automática. Repetição de criação jamais faz edição implícita; exclusão grava tombstone contra recriação pela chave antiga.

## HOLD: ainda não entregue

A garantia de cancelamento cobre somente trabalhos **vinculados** ao ciclo na fila do servidor, em todos os seus canais. Não cobre alarmes locais legados Android nem ICS já importado. Envios em voo/aceitos não podem ser recolhidos: a resposta informa esse limite. Não habilitar lembretes reais antes de integrar cancelamento local, verificar fonte/ano/fuso e revisar testes reais MySQL/Android.

O novo teste CI usa MySQL 8.4 descartável por UNIX socket sem rede, reutilizando o padrão QA existente. Provedores, destinatários e contas são fictícios. O host macOS não dispõe de Docker/MySQL/SDK Android; o gate passou em 79f22bff antes/depois da preparação, inclusive collation mista, replay e exclusão de conta. HEADs posteriores exigem nova validação. A limpeza de decisões, tombstones, claims e trabalhos na exclusão de conta foi integrada ao finalizador de fontes e passou no teste MySQL de 79f22bff; precisa de revisão antes de ativar em produção.

Sem notificações reais, novas permissões, custos ou publicação de loja.

O receiver Android usa o mesmo limite de tolerância de 120 segundos da fila para rejeitar alarmes sem instante conhecido, futuros ou expirados. O teste Java usa a classe de produção, sem tocar permissões/aparelho; não simula AlarmManager, restauração após boot ou cancelamento por conta. Alarmes aproximados atrasados além desse limite são descartados, sem entrega garantida.

Em 79f22bff, Android signed store bundles passou incluindo o teste Java da classe real e compilação. Não houve publicação Play nem teste físico de AlarmManager, boot, cancelamento ou entrega. A confirmação por ciclo usa o bearer atual, rejeita ausência de token e descarta resposta de sessão antiga; o novo teste browser cobre offline/reconexão, persistência após remount e cookie antigo.
