# Fundação de Escalabilidade do CrewCheck

## Estado
Documento vivo para conduzir a preparação do CrewCheck para crescimento progressivo sem aumento imediato de infraestrutura.

## Objetivo
Permitir que o produto cresça de forma mensurável e segura, preservando a hospedagem atual e preparando adaptadores para uma migração futura à AWS.

## Arquitetura-alvo incremental

```text
Frontend Web/PWA
      |
      v
API CrewCheck
      |
      +--> JobQueue ----------> Worker de PDF
      |
      +--> CacheProvider -----> Radar / METAR / TAF
      |
      +--> FileStorage -------> PDFs e artefatos temporários
      |
      +--> DatabaseProvider --> usuários, escalas e tarefas
      |
      +--> NotificationProvider -> Telegram / demais canais
```

As interfaces acima não devem depender diretamente de AWS, Redis ou outro fornecedor. A implementação inicial pode usar os recursos já disponíveis. No futuro, os adaptadores poderão apontar para SQS, ElastiCache, S3 e RDS.

## Ambientes

### Homologação
- Branch: `staging`.
- Uso: validação funcional e visual.
- Deve exibir identificação clara de ambiente.
- Não deve compartilhar segredos nem dados sensíveis de produção.

### Produção
- Branch: `main`.
- Uso: usuários reais.
- Recebe apenas mudanças homologadas.
- Build Android/AAB somente manual e após checklist.

## Observabilidade mínima

Endpoints obrigatórios:

- `/health/live`: processo em execução.
- `/health/ready`: aplicação pronta para receber tráfego.
- `/health/dependencies`: dependências essenciais e degradações.

Toda requisição deverá receber `requestId`. Logs devem ser estruturados e sanitizados, sem senhas, tokens, CPF integral, chaves, conteúdo integral de PDF ou dados privados desnecessários.

Métricas mínimas:

- uptime;
- memória utilizada;
- duração das requisições;
- taxa de erros por rota;
- tarefas pendentes e em processamento;
- tempo médio de processamento de PDF;
- saúde das integrações externas;
- quantidade de respostas servidas por cache.

## Fila persistente

Uma importação de PDF não deve manter a requisição aberta durante todo o processamento.

Fluxo:

1. validar usuário, tipo e tamanho do arquivo;
2. armazenar arquivo temporário ou referência segura;
3. criar tarefa persistente;
4. responder com identificador da tarefa;
5. worker processa com concorrência limitada;
6. salvar resultado ou erro sanitizado;
7. permitir consulta de status;
8. remover arquivo temporário conforme política de retenção.

Estados sugeridos:

```text
pending -> processing -> completed
                    \-> failed
                    \-> retrying
                    \-> cancelled
```

Requisitos:

- idempotência;
- limite de tentativas;
- timeout;
- recuperação após reinício;
- lock para impedir processamento duplicado;
- prioridade futura sem reescrever a interface.

## Cache compartilhado

O cache deve ser consultado antes de qualquer API externa e possuir TTL por categoria.

Sugestões iniciais:

| Categoria | TTL inicial |
|---|---:|
| Aeroportos e dados fixos | 30 dias |
| Hotéis e endereços verificados | 30 dias |
| TAF | até a próxima emissão |
| METAR | 20 a 30 minutos |
| Voo distante | 10 a 15 minutos |
| Voo próximo da operação | 1 a 3 minutos |
| Portão e terminal | 1 a 3 minutos |

Também deve existir proteção contra várias requisições simultâneas para a mesma chave, evitando o chamado efeito de manada.

## Limites de proteção

Parâmetros devem ser configuráveis por ambiente:

- tamanho máximo do PDF;
- quantidade de uploads por usuário e janela;
- quantidade de logins por IP e janela;
- concorrência máxima de PDFs por instância;
- timeout por provedor externo;
- circuito temporariamente aberto após falhas repetidas;
- limite de atualizações de radar e meteorologia.

## Testes de capacidade

Progressão inicial:

```text
10 -> 25 -> 50 -> 100 usuários simultâneos
```

Cenários:

- login e leitura da escala;
- vários uploads de PDF;
- consultas repetidas ao mesmo voo;
- falha de uma API externa;
- reinício com tarefas pendentes;
- lentidão do banco;
- múltiplas mensagens do Telegram.

Registrar:

- requisições por segundo;
- p50, p95 e p99 de latência;
- memória máxima;
- CPU quando disponível;
- taxa de erro;
- tamanho máximo seguro da fila;
- custo e consumo por funcionalidade.

## Critérios de migração para AWS

A migração não deve depender apenas do número total de contas. Avaliar quando ocorrer um ou mais sinais:

- CPU sustentada acima do limite seguro;
- memória frequentemente próxima do teto;
- latência p95 incompatível com uso operacional;
- fila crescendo sem recuperação;
- limite de conexões do banco;
- necessidade real de múltiplas instâncias;
- indisponibilidade afetando usuários pagantes;
- custo atual próximo de uma solução gerenciada equivalente.

## Ordem de implementação

1. request ID, health checks e logs estruturados;
2. limites de upload e rate limiting;
3. fila persistente para PDF;
4. cache compartilhado de radar e meteorologia;
5. painel administrativo de saúde;
6. homologação separada da produção;
7. testes de carga;
8. adaptadores de armazenamento e notificações;
9. decisão baseada em métricas sobre expansão de infraestrutura.

## Regra de lançamento

Nenhum novo AAB será produzido somente por pressão de calendário. O build de produção dependerá de homologação, checklist de regressão, confirmação de `versionCode`, assinatura correta e ausência de bloqueadores críticos.