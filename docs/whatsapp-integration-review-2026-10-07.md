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
| Financeiro | Diárias operacionais (pernoites) pelo motor existente; sem valores monetários inventados; holerite/auditoria não implementados |
| PDF recebido | Integrado localmente atrás de gate independente default OFF; fila, validação, parser canônico e commit transacional testados com fixtures |
| Identidade | Remetente empresarial validado antes do vínculo; email/vínculo/consentimento rechecados antes de resposta privada |
| Isolamento | A/B, troca/revogação/novo vínculo, canal e remetente durante await cobertos por mocks |
| Deduplicação | Memória e INSERT IGNORE; corrigida repetição dentro do payload |
| Idempotência durável | PDF agora usa fila antes do ACK, lease/retry e recibo + snapshot na mesma transação; a dedup do texto mantém seu comportamento existente |
| SOS/GPS | Testes atuais de SOS e GPS voluntário comuns passam; funcionalidades SOS WhatsApp não são anunciadas |

## Evidência sintética e limitações

Preparação canônica executada sobre fontes limpas. Testes menu e sender cobrem OFF/ON, receiver incorreto/ausente, binding, mudança de configuração, callbacks e A/B sem APIs reais. Teste novo cobre payload duplicado e replay. Webhook oficial, diagnósticos 130497, SOS (incluindo encerramento exato) e farmácia/GPS passam. Wellhub materializado: 18/18; harness montado: 17/18, reproduzindo a mesma divergência de montagem na main isolada. Nenhuma regressão nova observada.

Node local v24.21.0; CI usa Node22.13.0. Resultado CI do novo patch precisa ser acompanhado após publicação. Não se presume que todas as suítes ou fluxos de produto estejam verdes.

## Plano atualizado antes de ativar as funções novas

1. Revisar o patch local e publicar na PR888 quando existir autenticação Git suportada, sem novas credenciais neste executor. A PR permanece draft no head remoto anterior.
2. Homologar a fila e as transações em MySQL isolado e revisar concorrência/retention. Os testes atuais usam banco simulado; parser e consultas são reais com fixtures fictícias.
3. Planejar rollout/rollback do modo durável de snapshots: preservar migração somente da própria conta e evitar retorno a cache antigo após novas importações. Gates de PDF/menu não foram alterados no ambiente real.
4. Manter Diárias como consulta operacional; ampliar valores/holerite somente reutilizando produtores financeiros canônicos existentes, sem fórmulas novas nesta fase.
5. A liberação Meta e o envio estão confirmados pelo relato do usuário (13:12 UTC), não são bloqueio. Não solicitar repetição dessa confirmação. Um teste de UMA mensagem foi autorizado posteriormente, mas não foi tentado por falta de caminho suportado com remetente e janela gratuita verificáveis neste executor.

Bloqueios restantes: publicação Git; homologação MySQL real isolada; rollout/rollback do cache; acesso suportado para o teste avulso autorizado. Sem merge, deploy, credenciais novas, mensagens reais ou ativação. Detalhes da implementação e testes: `whatsapp-pdf-design-2026-10-07.md`.
