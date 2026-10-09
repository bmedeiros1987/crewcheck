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

Mensagem: **Já solicitou sua folga de fim de ano?** Ações **Já solicitei** e **Lembrar depois**. 00:00 foi solicitado pelo Bruno, não é horário de abertura declarado pelo PDF e não define cadência. O menor dado necessário para um instante seguro é o fuso aplicável; o ano ainda deve conservar seu grau de evidência.

Confirmação significa declaração do usuário de que enviou a solicitação; jamais `aprovada`. Estado deve persistir no servidor por usuário e edição anual, com janela estável, revisão da fonte e operação idempotente. Atualizar título/link/data da mesma edição não deve apagar confirmação. Nova edição exige identidade explícita nova e começa sem confirmação; duplicar uma edição não pode criar alertas independentes.

Na confirmação, a transação deve gravar estado e cancelar todos os trabalhos pendentes dessa janela/usuário. O despachante precisa checar esse estado e a revisão na transição atômica para envio. Repetir confirmação deve manter cancelamento e retornar o mesmo resultado. Testar confirmação concorrente com edição, exclusão, reconexão e claim do despachante em MySQL real isolado.

`Lembrar depois` precisa persistir escolha explícita com instante futuro dentro da janela e fuso validado; não inventar intervalo. Confirmação posterior cancela essa escolha também. Conta trocada nunca pode reaproveitar decisões ou alarmes do usuário anterior.

## HOLD: ainda não entregue

Este PR exibe informação e link, mas **não implementa** estas duas ações, persistência de confirmação por edição, snooze nem cancelamento em todos os canais. Não mostrar botão que alegue confirmar/cancelar sem essa integração.

O caminho BIDS atual ainda envia diretamente pelo Telegram e não tem claim transacional ligado à edição. O wrapper Android não tem cancelamento de alarmes por janela/usuário nem restauração segura após reinício. ICS é exportação estática: não é possível cancelar automaticamente alarmes já importados. Trabalhos já aceitos pelo provedor ou em voo não podem ser recolhidos; a interface deve informar esse limite sem afirmar cancelamento universal concluído. A fila geral tem corte explícito `dispatching` e resposta de envio em andamento, mas não identifica ainda janela anual de folga.

Não ativar esta janela até integrar estado/claim/cancelamento, revisar os canais realmente suportados e testar em ambiente isolado. Sem notificações reais, novas permissões, custos ou publicação de loja.
