# Projeto Atlas — CrewCheck

O Projeto Atlas organiza a evolução do CrewCheck como produto, plataforma e marca da Bruno Medeiros Tecnologia.

## Diretriz central

> O produto pode ser amplo, mas a experiência precisa permanecer simples.

## Prioridades atuais

1. Importação de escala por PDF diretamente no sistema.
2. Envio de PDF pelo Telegram com processamento seguro e confirmação ao usuário.
3. Evolução de importações assistidas somente quando houver autorização, segurança e conformidade adequadas.
4. Estrutura de assinatura justa, sustentável e transparente.
5. Padronização institucional, visual, documental e técnica do CrewCheck.
6. Preservação do parser canônico, regulamentação, autenticação, PWA e integrações existentes.

## Princípios de experiência

- Uma tela deve ter um objetivo principal.
- Informação operacional crítica deve aparecer primeiro.
- Recursos avançados devem existir sem atrapalhar o básico.
- Resumo primeiro; detalhes sob demanda.
- Menus duplicados e caminhos paralelos devem ser eliminados.
- O usuário deve chegar à informação necessária em poucos segundos.

## Canais de importação da escala

### Disponíveis e prioritários

- Upload de PDF no aplicativo/web.
- Compartilhamento de PDF com o PWA/APK.
- Envio de PDF pelo Telegram.

### Condicionados a validação externa

- Importações assistidas por fontes externas autorizadas.

A indisponibilidade de qualquer fonte externa não deve impedir o uso completo do CrewCheck por PDF.

## Privacidade

- O CrewCheck não deve solicitar, transmitir ou armazenar credenciais de sistemas de terceiros.
- Referências públicas devem usar terminologia neutra e funcional.
- Dados pessoais devem seguir minimização, finalidade, retenção limitada e transparência.

## Método BMT

Observar → Entender → Simplificar → Construir → Evoluir continuamente.

## Camada operacional (memória do desenvolvimento)

Esta seção existe para reduzir a fragmentação entre Bruno, ChatGPT e Claude — cada um frequentemente sabe algo que o outro não recebeu (ver `#527`). Não substitui o GitHub (continua sendo a verdade para código/PR/CI); registra o que fica perdido entre conversas, com procedência explícita.

- `PROVENANCE.md` — schema e regras de procedência: como registrar uma afirmação e como saber se ela pode virar oracle.
- `DECISIONS_LOG.md` — decisões do Bruno e mudanças de prioridade.
- `ENGINEERING_STATE.md` — estado atual de issues/PRs/dependências/dívida técnica (ponteiro para o GitHub, não cópia).
- `QA_ORACLES.md` — casos reais confirmados contra PDFs AIMS/CrewRoster, para uso como oracle/regressão.
- `CORPUS.md` — corpus iFlight x corpus AIMS/Crewtopia, e a regra de que material privado nunca entra sanitizado.
- `ARCHITECTURE_CONTRACT.md` — a cadeia canônica (fonte -> parser -> canonical roster -> journeyId -> consumidores) e por que ela já quebrou mais de uma vez quando um consumidor reimplementa sua própria heurística.
