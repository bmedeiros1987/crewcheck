# WhatsApp: revisão de integração em 7 outubro 2026

PR 888 permanece draft, sem merge, deploy, alteração de configuração, consulta de dados de usuários ou mensagens reais. Base revalidada: main 81ec0bcd858a0c9f91e7eccb07dada98350f28d8; head remoto inicial ec6ee1727ecbe5c1ae484978f2967d78cfe9bc44. PR890 já integra a main. Checkout independente.

## Mudanças revisáveis

- Integra main na branch existente, preservando preparação com cache/finalizador, fluxo SOS e proteções GPS comum.
- Menu default OFF inclui Amanhã, Escala e Diárias e delega ao motor existente; números continuam disponíveis às seleções POI.
- PDF recebe aviso explícito de indisponibilidade, sem download/importação ou falsa confirmação.
- Cada ID aceito é consumido uma vez no mesmo payload: mensagens repetidas não executam novamente o handler.
- Fixture Wellhub fornece a função real de gate no modo OFF; novo teste de duplicação usa apenas VM e mensagens sintéticas. CI WhatsApp inclui o teste.

## Equivalência e lacunas

| Capacidade | Estado verificável |
| --- | --- |
| Escala/hoje/amanhã/próximo | Adaptador compartilha o motor e snapshot de conta; menu usa comandos canônicos |
| Financeiro | Diárias disponíveis pelo motor existente; equivalência completa de holerite/auditoria não demonstrada |
| PDF recebido | Não implementado: exige transporte de mídia limitado, validação de PDF e importação autenticada idempotente |
| Identidade | Remetente empresarial validado antes do vínculo; email/vínculo/consentimento rechecados antes de resposta privada |
| Isolamento | A/B, troca/revogação/novo vínculo, canal e remetente durante await cobertos por mocks |
| Deduplicação | Memória e INSERT IGNORE; corrigida repetição dentro do payload |
| Idempotência durável | Lacuna: banco ausente/erro retorna aceitação, e claim precede execução; não há fila transacional/retry durável |
| SOS/GPS | Testes atuais de SOS e GPS voluntário comuns passam; funcionalidades SOS WhatsApp não são anunciadas |

## Evidência sintética e limitações

Preparação canônica executada sobre fontes limpas. Testes menu e sender cobrem OFF/ON, receiver incorreto/ausente, binding, mudança de configuração, callbacks e A/B sem APIs reais. Teste novo cobre payload duplicado e replay. Webhook oficial, diagnósticos 130497, SOS (incluindo encerramento exato) e farmácia/GPS passam. Wellhub: 17/18; falha de onboarding de nome captura “Meu plano é silver+”, também reproduzida na main isolada (17/18). Não foi corrigida nesta revisão de transporte.

Node local v24.21.0; CI usa Node22.13.0. Resultado CI do novo patch precisa ser acompanhado após publicação. Não se presume que todas as suítes ou fluxos de produto estejam verdes.

## Plano antes de ativar

1. Revisar o draft atualizado e CI; tratar falha existente Wellhub separadamente.
2. Projetar fila/outbox com claim e conclusão duráveis, retry de consulta seguro e chave de importação por conta/canal/mensagem. Revalidar binding antes de qualquer escrita, além do envio.
3. Implementar PDF atrás de gate próprio: aceitar application/pdf com limites de tamanho, tempo e conteúdo; buscar mídia somente em endpoints permitidos, sem URLs fornecidas pelo usuário; usar parser/importador canônico sem alterar fórmulas; testar replay, troca de conta, parser inválido e recuperação de falhas com fixtures fictícias.
4. Ampliar testes de conteúdo financeiro/escala usando snapshots fictícios de limites mensais, ausência de dados e comparação de resultados Telegram/WhatsApp. Não inventar valores.
5. Com autorização específica, comprovar associação do número BR/UK, phone_number_id/WABA/token/env no ambiente alvo sem expor segredos. Resolver restrição Meta130497 com evidência própria de elegibilidade e entrega, não apenas relatório de aprovação.
6. Só depois de nova autorização realizar validação controlada com destinatário de teste e decidir ativação/rollout. Esta etapa não foi executada.

Bloqueios reais: identidade Meta/ambiente não comprovada, restrição de envio sem comprovação de desbloqueio, importação PDF ausente, idempotência durável incompleta e falha Wellhub preexistente. Nenhuma funcionalidade ativa foi prometida.
