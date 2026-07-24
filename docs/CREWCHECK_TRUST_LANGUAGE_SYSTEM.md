# CrewCheck — Sistema de Linguagem de Confiança

## Objetivo

Toda mensagem do CrewCheck deve reduzir carga mental. O usuário precisa entender três coisas sem esforço:

1. o que aconteceu;
2. o grau de certeza da informação;
3. o que fazer agora.

A fórmula padrão é:

> **Estado + confiança + próxima ação**

Exemplo:

> Não consegui confirmar o portão agora. O voo continua na sua programação. Vou mostrar o portão assim que houver uma informação confiável; por segurança, confira também o monitor do aeroporto.

## Hierarquia de tom

### 1. Segurança e operação

Tom objetivo, calmo e sem humor.

- nunca minimizar atrasos, bloqueios, descanso, regulamentação ou divergências;
- nunca usar celebração antes de uma confirmação real;
- nunca apresentar estimativa como dado publicado;
- incluir fonte temporal: `atualizado às 14:32`, quando disponível.

### 2. Falha recuperável

Não culpar o usuário e não exibir detalhes técnicos.

Evitar:

> Erro 500. Tente novamente.

Preferir:

> Não consegui atualizar agora. A última informação confirmada continua disponível. Tente novamente em alguns instantes.

### 3. Estado vazio

Estado vazio não é erro. Explique por que está vazio e qual ação resolve.

Evitar:

> Nenhum dado.

Preferir:

> Ainda não há uma escala importada para este período. Importe o PDF ou confirme se a escala automática está conectada.

### 4. Confirmação

Confirmar exatamente o que foi salvo, sem exagero.

Evitar:

> Sucesso!

Preferir:

> Preferência de despertador salva.

Para ações críticas, informar consequência:

> Alerta de apresentação ativado. Você será avisado pelos canais selecionados.

### 5. Espera e carregamento

O texto deve explicar o que está sendo preparado.

- `Conferindo sua escala…`
- `Atualizando trânsito e horário de saída…`
- `Buscando a informação mais recente do voo…`
- `Preparando sua programação…`

Não usar animações indefinidas sem texto. Após demora relevante, mostrar uma saída segura.

## Rótulos de confiança

Informações temporais ou operacionais devem usar um destes estados:

- **Publicado** — veio da escala ou fonte operacional confirmada;
- **Atualizado** — consultado recentemente em fonte externa;
- **Calculado** — produzido pelo CrewCheck a partir de dados confirmados;
- **Estimado** — aproximação sujeita a mudança;
- **Não confirmado** — dado ainda indisponível ou divergente.

Nunca usar apenas cor para transmitir esses estados.

## Linguagem por contexto

### Escala

> Escala conferida.

Somente quando a validação terminar sem divergências críticas.

Quando houver divergência:

> Encontrei uma diferença entre o documento e a programação exibida. Mantive o dado publicado e destaquei o ponto que precisa de confirmação.

### Saída Inteligente

> Saída calculada para 06:40, considerando apresentação às 08:00, trânsito atual e margem de chegada.

Sempre distinguir horário publicado de cálculo do CrewCheck.

### Radar

> Portão ainda não confirmado. Última atualização às 17:10.

Nunca inventar portão, terminal ou status.

### Meteorologia

Para comissários, traduzir primeiro e oferecer o boletim técnico como detalhe. Para pilotos, preservar METAR/TAF e marcar horário de emissão.

### Concierge

O Concierge não diz apenas “não entendi”. Ele orienta com no máximo três caminhos relevantes ao contexto.

Exemplo:

> Não consegui identificar a consulta. Posso conferir sua programação, calcular o horário de saída ou buscar o portão do próximo voo.

Easter Eggs e humor só entram em perguntas pessoais diretas. Nunca entram em mensagens automáticas, falhas, alertas ou situações operacionais críticas.

## Vocabulário proibido na interface do usuário

Salvo em telas administrativas ou diagnóstico autorizado:

- API
- endpoint
- payload
- webhook
- stack trace
- HTTP 4xx/5xx
- parser
- fallback
- token expirado

Traduções recomendadas:

- `serviço temporariamente indisponível`;
- `conexão precisa ser renovada`;
- `não foi possível interpretar este documento`;
- `usando a última informação confirmada`.

## Acessibilidade e microinteração

- não depender apenas de cor;
- botões com verbo e objeto: `Importar escala`, `Tentar novamente`, `Confirmar horário`;
- foco visível;
- alvos de toque adequados;
- respeitar redução de movimento;
- não vibrar por confirmações triviais;
- sons e vibrações apenas quando adicionarem informação real.

## Checklist Guardião da Confiança

Antes de aprovar uma mensagem:

- Está claro o que aconteceu?
- Está claro se o dado é publicado, calculado ou estimado?
- Existe uma próxima ação concreta?
- O texto evita culpar o usuário?
- O sistema está admitindo incerteza quando necessário?
- O humor está fora de situações operacionais, falhas e descanso?
- A mensagem merece a confiança do tripulante?
