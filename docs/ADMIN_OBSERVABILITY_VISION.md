# CrewCheck Admin — observabilidade e controle operacional

Objetivo: tornar a Central Admin suficiente para diagnóstico diário sem depender de logs externos, chat ou acesso direto à infraestrutura.

## Princípios

- acesso exclusivo de administrador;
- nenhuma senha, token, segredo, chave ou código temporário exibido;
- dados pessoais minimizados e pseudonimizados por padrão;
- trilha de auditoria para ações administrativas;
- linguagem operacional para o administrador, com detalhe técnico apenas quando necessário ao diagnóstico;
- nunca expor esta profundidade nas telas comuns do tripulante.

## Módulos prioritários

### Saúde do sistema
- versão em produção e horário do último deploy conhecido pelo app;
- banco, e-mail, notificações, mapas, radar, meteorologia e filas/scheduler;
- status saudável/degradado/indisponível com último erro sanitizado;
- latência e última verificação bem-sucedida.

### Webhooks e eventos externos
- timeline única de eventos recebidos;
- filtros por categoria, status, intervalo e identificador de correlação;
- assinatura válida/inválida, recebido/processado/ignorado/falhou;
- horário do provedor e horário de processamento;
- motivo de falha sanitizado;
- payload nunca exibido bruto quando puder conter dados pessoais ou segredos.

### Entrega de e-mail e notificações
- accepted/sent/delivered/deferred/bounced/rejected;
- domínio do destinatário e identificador pseudonimizado;
- correlação entre solicitação de recuperação e evento de entrega;
- últimas falhas e taxa de sucesso;
- reenvio administrativo apenas quando seguro e auditado.

### Usuários e autenticação
- existência/status da conta sem revelar senha ou credenciais;
- último login, sessão ativa, e-mail verificado, Telegram vinculado, plano e estado da assinatura;
- bloqueios e tentativas de recuperação recentes;
- ações de suporte específicas e auditadas, sem edição direta de segredo.

### Operação CrewCheck Vivo
- jobs agendados, última execução, próxima execução, falhas e retries;
- alertas emitidos por categoria e canal;
- deduplicação/silêncio/respeito aplicados;
- capacidade de executar health-check seguro.

### Integrações operacionais
- configuração presente/ausente sem mostrar o valor da chave;
- última chamada bem-sucedida, último erro e fallback ativo;
- quotas/budget quando aplicável;
- testes sanitizados sob demanda, sem dados reais de usuário quando desnecessários.

## Segurança e auditoria

Toda ação mutável do Admin deve registrar: administrador, ação, alvo pseudonimizado, horário, resultado e motivo. Segredos, códigos temporários, tokens e payloads sensíveis nunca entram na auditoria.
