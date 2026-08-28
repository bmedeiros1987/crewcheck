# CrewCheck — UX contextual, adaptativa e linkável

## Princípio

O CrewCheck não deve expor a árvore interna de módulos como se ela fosse a tarefa do tripulante. A tarefa nasce do contexto operacional. O sistema deve trazer a próxima ação ao usuário e manter recursos menos frequentes disponíveis por progressive disclosure.

**Contrato de produto:** contexto antes de módulo; a ocasião é o menu; Pulse representa o agora; Escala representa a linha do tempo.

## Experiência adaptativa

O usuário escolhe a densidade da navegação, sem perder capacidade:

- **Essencial:** escala, hoje, alertas e ações operacionais contextuais com baixa densidade visual.
- **Completo:** operação, financeiro, regulamentação e recursos cotidianos.
- **Avançado:** todas as áreas e ferramentas.
- **Personalizado:** famílias visíveis escolhidas pelo usuário.

Ocultar um item da navegação não desativa a função. Um pernoite continua oferecendo `Gerenciar pernoite`; um voo continua oferecendo `Portão e operação`; uma apresentação publicada continua oferecendo `Planejar saída`. A função aparece quando é relevante.

Os filtros/presets da visualização da **Escala** possuem fonte de preferência própria. Há trabalho já aberto para salvar a visualização padrão; esta fundação não duplica esse estado. A integração futura deve consumir a preferência já existente, com presets como Clean/Raw/Operacional/Regulamentação/Financeiro sem criar duas fontes de verdade.

## Navegação contextual

As telas internas devem ser endereçáveis por `?view=<destino>`. Ao sair de uma atividade da Escala para outra superfície, o CrewCheck guarda um contexto mínimo e não sensível (`eventId`, data, voo, origem/destino e tela de origem). O botão voltar retorna à tela que originou a ação quando esse contexto existe; fora desse fluxo, preserva o fallback seguro para Hoje.

A próxima evolução deve levar o `eventId` até os consumidores (financeiro, pernoite, radar e apresentação), para que essas telas abram já filtradas na jornada/evento selecionado, em vez de apenas na próxima programação global.

## Ações por contexto

### Voo

Prioridade sugerida:

1. Planejar saída / chegar à apresentação;
2. Portão e operação;
3. Meteorologia;
4. Ganhos do voo;
5. Limites da jornada;
6. Despertador.

O nível de experiência define quantas ações ficam expostas. As demais ficam em `Mais`; não são removidas.

### Pernoite

Prioridade sugerida:

1. Gerenciar pernoite;
2. Próxima apresentação;
3. Clima do pernoite;
4. Diárias;
5. Despertador.

### Outras atividades

Regulamentação, rotina e retorno à Escala aparecem conforme o tipo e a disponibilidade dos dados.

## CrewCheck Pulse

O Pulse é uma superfície operacional acionável, não um cabeçalho decorativo. Mensagens podem conter uma única CTA contextual. A fundação atual publica, sem alterar o motor da Escala:

- apresentação próxima → `Planejar saída`;
- voo → `Portão e operação`;
- pernoite → `Gerenciar pernoite`;
- outra programação → `Ver escala`.

A fila/prioridade futura deve resolver concorrência entre mensagens por severidade e prazo (crítico > mudança operacional > apresentação > lembrete > informativo), sem repetir a mesma assinatura após dispensa.

## Radar / Staff Travel / Journey Engine

O destino do produto não é apenas replicar um buscador de voos. O objetivo é responder: **como este tripulante chega com segurança à apresentação?**

O Journey Engine deverá calcular de trás para frente a partir da apresentação publicada:

`local atual/hotel → trecho terrestre → aeroporto de origem → voo(s) → eventual conexão/troca de aeroporto → trecho terrestre final → local de apresentação`.

### Contratos do planejador avançado

- horário-alvo é a apresentação, não apenas um aeroporto;
- considerar margem pessoal/configurável e antecedência aeroportuária;
- combinar trechos terrestres e aéreos;
- permitir conexões entre companhias elegíveis e, quando fizer sentido, troca terrestre entre aeroportos;
- perfil de elegibilidade por companhia/acordo (interline/ZED/congêneres) informado pelo usuário ou por fonte autorizada;
- **não** depender de scraping de credenciais, cookies, MFA ou portais corporativos restritos;
- gerar Plano A/B/C;
- pontuar não apenas disponibilidade, mas **resiliência/recuperação**: quantas alternativas permanecem se o primeiro plano falhar;
- oferecer estratégias `mais seguro`, `mais rápido`, `maior disponibilidade`, `menos conexões` e `último voo seguro`;
- acompanhar mudança de portão/status/atraso e reavaliar a margem para apresentação;
- integrar as fontes operacionais autorizadas do Radar/Cirium sem duplicar a correção do PR dedicado ao Radar.

### Score de segurança sugerido

O score nunca deve inventar probabilidade quando não houver dados. Quando as fontes existirem, combinar de forma explicável:

- folga até apresentação;
- quantidade de alternativas posteriores;
- tempo e risco das conexões;
- necessidade de troca de aeroporto;
- status/atraso operacional;
- disponibilidade staff informada por fonte permitida;
- deslocamento terrestre e trânsito;
- confiabilidade/frescor das fontes.

## Guardrails de engenharia

Esta camada é de UX/orquestração. Não deve alterar por efeito colateral:

- parser AIMS/CrewRoster;
- `canonicalRoster`/identidade de jornadas;
- regras RBAC/ACT;
- motor financeiro;
- fixtures/oráculos oficiais.

Mudança necessária nesses motores deve ocorrer em PR dedicado, com oráculo e auditoria própria. A preparação de fontes deve materializar esta camada por último e falhar fechado se as âncoras esperadas desaparecerem.

## Próximos slices

1. Propagar `eventId` do contexto para Radar, Financeiro, Pernoite e Apresentação e filtrar a tela no evento certo.
2. Unificar visualmente ganhos/diárias sem apagar contratos financeiros distintos.
3. Consumir o PR existente de visualização padrão da Escala e oferecer presets de densidade.
4. Evoluir Home/Hoje para timeline diária personalizada e widgets ordenáveis.
5. Criar fila/prioridade real do Pulse com eventos de escala, rota, radar e clima.
6. Projetar Journey Engine multimodal em serviço isolado, começando por planejamento terrestre até a primeira apresentação e depois adicionando itinerários aéreos autorizados.
