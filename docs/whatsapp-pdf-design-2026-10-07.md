# Desenho mínimo: PDF WhatsApp (default OFF)

Antes de implementar: manter o parser de escala canônico; não reutilizar o salvamento Telegram atual sem adaptação, pois escreve primeiro no cache em arquivo e depois no banco, sem transação. Isso não garante importação durável nem revalidação de identidade na escrita.

Fluxo proposto: webhook assinado e receiver validado → gate PDF independente → vínculo/consentimento → metadados de mídia por ID (sem URL do usuário) → download limitado sem redirects → magic bytes/hash/tamanho/MIME → parser canônico → revalidação de vínculo → commit transacional de recibo idempotente e snapshot minimizado → atualização do cache só após commit.

Chave idempotente: hash de conta, receiver e message ID; não armazena PDF nem telefone em claro no recibo. Transação exige banco e tabelas existentes e bloqueia vínculo antes de escrever. Sem banco, sem escrita local de fallback e sem afirmação de importação. Duplicate concluído não deve substituir escala mais recente. Mesma mensagem sob conta/vínculo diferente não reutiliza dados privados.

Riscos: credencial de mídia pode conceder acesso além do receiver, portanto validar phone_number_id dos metadados; URLs retornadas precisam de allowlist HTTPS exata e redirects proibidos; content-length não basta (limitar bytes streaming); parser deve rejeitar arquivo não-PDF/sem dias. Compatibilidade de cache compartilhado com escritores Telegram/app exige revisão, pois banco e arquivo não formam uma única transação. Não se garante exactly-once de confirmação de mensagem; confirmação não é parte do commit de escala.

Esta fase não cria tabelas no banco real, não baixa mídia real, não configura gates, nem muda serviços/credenciais. Testes usam metadados, buffers, parser e banco sintéticos. Estado não é funcionalidade ativa.

## Implementação local e limites comprovados

`server/concierge/whatsapp-pdf.mjs` implementa extração segura de mídia, pipeline de importação com gate default OFF, parser canônico em worker terminável (15 segundos, heap 192 MiB) e commit de snapshot/recibo na mesma transação InnoDB. O parser usado é `server/rosterParser.mjs`; as fórmulas e regras de escala não foram copiadas. O extrator de inbound preserva apenas ID, MIME, filename e SHA de documentos; descarta URLs do webhook. O commit não executa DDL e falha sem banco/tabelas existentes.

O módulo ainda não é chamado pelo handler de inbound. Essa conexão exige resolver o cache em arquivo compartilhado e o claim de webhook anterior à execução: hoje uma falha de download/parser/commit pode deixar a mensagem já deduplicada e impedir retry. Conectar apenas o módulo e habilitar uma variável não resolve essas duas falhas. A API requer um construtor de snapshot que use a minimização canônica; nenhum salvamento local de fallback está autorizado ou implementado. Portanto o recebimento de PDF ainda não é uma função de produto disponível.

A transação candidata comprova por fixtures: revogação/troca de conta/novo vínculo antes da escrita, rollback de recibo e snapshot juntos, retry após rollback, dedup concorrente, replay em conexões novas e preservação de escala mais recente. Isso é evidência de contrato e SQL com banco simulado, não execução sobre MySQL real ou prova de configuração em produção. Confirmação por mensagem não integra o commit, e envio externo não é realizado por este módulo.

Próximos passos concretos: transformar os documentos em jobs duráveis ou separar claim/conclusão; tornar leitura e invalidação de cache consistentes entre WhatsApp, Telegram e app; derivar snapshot por funções canônicas preservando preferências; integrar handler com receiver e binding rechecados antes de download/escrita/resposta; executar fixtures transacionais MySQL isoladas antes de considerar ativação. Importações sem dias e erros do parser retornam resultado seguro sem detalhes privados.

Referências primárias para desenho de mídia: [Media API](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/media/media-api) e [Media Download API](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/media/media-download-api). URL de mídia é obtida por ID pela API e download exige autenticação; a allowlist local é propositalmente restrita e deve ser homologada antes de ativar.

## Validação final (Node 22.13.0, mesma versão do CI)

PASS: PDF pipeline/SQL simulado; parser canônico real com PDF fictício e rejeição de conteúdo malformado; menu; payload dedup; sender/binding; status diagnostics; webhook oficial em cópia isolada; SOS; farmácia/GPS. A preparação canônica executou sobre fontes limpas. O parser real preservou o voo fictício BSB→GRU e o período 10/2026; o pipeline sem parser injetado chamou esse mesmo parser em worker antes da confirmação de commit simulada.

Wellhub: 17/18 tanto nesta branch quanto na main isolada em Node22.13.0. Falha preexistente `interrupted name onboarding cannot consume explicit or contextual Wellhub preferences`; nenhuma regressão adicional foi observada nessas suítes. CI remoto do patch não executou porque a publicação Git continua bloqueada pelo helper ausente; workflow local acrescenta testes de pipeline e parser real.

Entregas permanecem locais e na Library. Nenhuma mídia, banco, mensagem ou dado de usuário real foi acessado; não houve merge, deploy, serviço novo, ativação, alteração de credencial ou de variável no ambiente.
