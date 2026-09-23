# ADR — CrewCheck Android native/offline-first e retirada da WebView

Status: **APROVADO COMO DIREÇÃO ARQUITETURAL**  
Escopo inicial: compartilhamento de PDF + fundação de persistência nativa  
Objetivo final: o aplicativo Android não depender de WebView nem do site público para operar.

## Contexto

O CrewCheck Android atual funciona como um wrapper de uma aplicação Web/PWA, ainda que já empacote parte do shell para resiliência. Isso mantém duas fragilidades incompatíveis com o objetivo do produto:

1. falhas de WebView/cache/site podem impedir a abertura da experiência principal;
2. recursos nativos, como receber um PDF por compartilhamento, precisam atravessar uma ponte JavaScript antes de chegar ao motor da escala.

O site público poderá deixar de existir no futuro. O aplicativo, portanto, precisa continuar útil mesmo quando nenhuma interface Web estiver disponível.

## Decisão

O Android será migrado incrementalmente para um aplicativo **nativo e offline-first**.

A rede será usada para sincronização, APIs e dados dinâmicos. Ela não será requisito para:

- abrir o aplicativo;
- abrir a última escala válida;
- consultar FlightDeck/linha do dia e escala já sincronizada;
- receber um PDF compartilhado;
- processar uma escala localmente quando o parser nativo estiver concluído;
- consultar dados locais já persistidos;
- fornecer o snapshot local ao CrewWatch.

O endereço de um site Web não faz parte do contrato funcional do aplicativo nativo.

## Princípios

### 1. Fonte operacional única

A escala canônica continua sendo um único modelo. UI nativa, PWA, TV, Watch e backend não podem criar versões semânticas diferentes da mesma escala.

### 2. Local-first, sync depois

Toda escrita que puder ser concluída localmente é persistida primeiro no dispositivo. A sincronização remota é assíncrona e idempotente.

Falha de rede não apaga nem substitui uma escala local válida.

### 3. Sem rewrite cego do parser

O parser atual possui um corpus grande de regressões e regras de continuidade/APZ/journeyId. Ele não será reescrito integralmente de uma vez.

A versão nativa do parser só substitui o parser atual quando produzir o mesmo modelo canônico e os mesmos fingerprints para o corpus aprovado.

### 4. WebView é camada transitória

Nenhuma nova funcionalidade crítica deve ser criada exclusivamente dentro da WebView.

Durante a migração, ela pode existir apenas como fallback temporário para superfícies ainda não portadas. O gate final exige remoção completa da dependência da WebView para a operação principal.

## Fases

### Fase 0 — entrada e persistência nativas

Status: **iniciada nesta branch**.

- SharedPdfInbox em armazenamento privado Android;
- PDF compartilhado sobrevive a cold start, login e recriação da Activity;
- ACK somente após importação canônica concluída;
- PWA adota o mesmo contrato persistente de claim/ACK;
- arquivo compartilhado não é enviado ao servidor apenas para sobreviver a navegação.

Gate:
- compartilhar PDF no APK fechado e aberto;
- reiniciar Activity antes do processamento;
- login/reload antes do processamento;
- arquivo continua pendente até sucesso;
- após sucesso, arquivo é removido.

### Fase 1 — banco local canônico Android

Criar armazenamento local nativo versionado para:

- escala ativa canônica;
- histórico mensal;
- fingerprint/schema/parserVersion/updatedAt;
- preferências operacionais essenciais;
- fila de sincronização pendente;
- último snapshot válido para Watch.

Implementação preferida: Room/SQLite com migrations explícitas.

Gate:
- modo avião: abrir aplicativo e consultar a escala ativa;
- matar processo/reiniciar telefone: escala permanece;
- servidor indisponível: nenhuma tela branca e nenhum pedido de reimportação;
- conexão retorna: fila sincroniza sem duplicar eventos.

### Fase 2 — UI operacional nativa

Migrar primeiro as superfícies que precisam existir sempre:

1. Home / Linha do Dia;
2. Escala;
3. detalhes da programação;
4. FlightDeck;
5. configurações essenciais;
6. estado de sincronização;
7. integração CrewWatch.

Implementação alvo: Kotlin + Jetpack Compose.

As telas consomem o banco/modelo local, não HTML.

Gate:
- nenhuma dessas superfícies exige WebView;
- mesma atividade/data/horários da UI canônica atual;
- modo offline funcional.

### Fase 3 — importação PDF 100% offline nativa

Separar o pipeline em duas etapas:

1. extração de texto/estrutura do PDF no Android;
2. normalização para o schema canônico.

Portar o motor de interpretação em slices test-first, usando fixtures sintéticas/sanitizadas e todos os oracles existentes.

Enquanto a paridade não estiver comprovada, o parser atual continua como fallback de migração; ele não pode ser removido antes do gate.

Gate:
- mesmo PDF -> mesmo período, dias, jornadas, legs, APZ, continuidade e fingerprint;
- CrewRoster/AIMS e casos de fronteira aprovados;
- zero dependência de rede para o PDF suportado.

### Fase 4 — serviços online como adapters

Radar, gates, meteorologia, mapas e Concierge passam a ser adapters opcionais sobre o estado local.

Offline:
- exibir último dado válido com timestamp quando fizer sentido;
- nunca inventar status atual;
- recursos exclusivamente online mostram estado indisponível sem bloquear escala/FlightDeck.

### Fase 5 — remoção da WebView

Só acontece quando:

- Home, Escala e FlightDeck estão nativos;
- importação PDF funciona offline;
- autenticação/sessão e banco local estão nativos;
- atualização/sincronização são nativas;
- compartilhamento PDF é nativo;
- Watch usa snapshot local nativo;
- testes físicos de cold start, offline e reinstalação estão verdes.

Nesse ponto, MainActivity deixa de carregar qualquer URL Web para a operação principal e o módulo WebView pode ser removido.

## Contrato do compartilhamento de PDF

O compartilhamento é uma entrada transacional:

    Sistema operacional
          |
          v
    Shared PDF Inbox (durável)
          |
          v
    Parser / importador canônico
          |
          +--> falha/cancelamento: mantém item pendente
          |
          +--> sucesso local: persiste escala
                    |
                    +--> ACK
                    |
                    +--> remove PDF temporário
                    |
                    +--> sincroniza backend quando possível

Nunca:

    receber -> disparar evento -> apagar arquivo -> torcer para a UI processar

## O que significa "site fora do ar"

A retirada do site público não implica necessariamente desligar APIs/backend. O app deve usar um endpoint de API configurável e independente da existência de páginas HTML.

Mesmo que o backend esteja indisponível temporariamente, a última escala válida e as funções locais básicas continuam operacionais.

## Critério de produto

O usuário compartilha um PDF, abre o CrewCheck e usa o sistema. Ele não administra cache, não apaga dados, não escolhe novamente o mesmo arquivo e não precisa saber se uma informação veio de banco local, sincronização ou rede.
