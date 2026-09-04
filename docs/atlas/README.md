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

## Refino visual

Todo pedido de melhoria visual de componente usa o prompt padrão de
[`PROMPT_PADRAO_REFINO_VISUAL.md`](PROMPT_PADRAO_REFINO_VISUAL.md): evolução do componente
atual, identidade rosa→roxo preservada, tokens de tema antes de valores hardcoded, estrutura
de layout intocada e estado preparado validado quando a cadeia `scripts/v*/apply.mjs`
materializa o arquivo.
