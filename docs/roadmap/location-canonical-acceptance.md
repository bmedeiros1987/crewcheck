# Localização canônica — contrato e matriz de validação

Refs: #152, #227, #228

## Regra única

Toda funcionalidade que dependa de posição deve consumir a mesma localização real canônica mais recente, recebida por Telegram, Web ou Android.

A ordem padrão é:

1. localização real válida mais recente;
2. localização manual explicitamente escolhida;
3. hotel/pernoite somente quando solicitado naquela consulta;
4. base/aeroporto somente quando solicitado naquela consulta.

Hotel, cidade da escala, base ou aeroporto não podem substituir silenciosamente coordenadas reais válidas. Uma consulta pontual com qualificador, como “academias perto do hotel”, não altera a origem global das consultas seguintes.

## Consumidores obrigatórios

- Academias;
- Farmácias;
- Hospitais;
- Hotéis e Locais Próximos;
- Saída Inteligente, rotas e trânsito;
- CrewCheck Life;
- Concierge;
- qualquer recurso futuro que use latitude/longitude.

## Contrato mínimo da posição

Cada posição canônica deve preservar:

- `latitude` e `longitude` válidas;
- `source` normalizada (`telegram`, `web`, `android`, `app` ou `manual`);
- `updatedAt` verificável;
- `expiresAt` calculado pela política única de validade;
- rótulo resolvido sem cidade fixa;
- indicação transparente da localização usada na resposta.

`live` e `static` são aliases legados de entrada do Telegram e devem ser normalizados para `telegram`. Fontes desconhecidas, coordenadas inválidas e timestamps ausentes devem ser rejeitados.

## Matriz automatizável sem validação manual

1. `live` e `static` normalizam para `telegram`;
2. localização válida permanece disponível dentro do TTL;
3. localização vencida retorna estado `stale`;
4. timestamp ausente ou futuro além da tolerância é rejeitado;
5. cidade/rótulo incompatível não substitui a referência calculada pelas coordenadas;
6. locais são filtrados e ordenados pela distância às coordenadas canônicas;
7. módulos legados não devem interceptar consultas por categoria quando o Concierge canônico estiver ativo.

## Matriz funcional para produção

Compartilhar uma única localização e consultar, em sequência:

1. Farmácias;
2. Academias;
3. Hospitais;
4. Locais Próximos;
5. Saída Inteligente.

Todas as respostas devem usar as mesmas coordenadas sem novo compartilhamento.

Depois, consultar “academias perto do hotel”. O hotel deve valer somente para essa resposta. A consulta seguinte sem qualificador deve voltar automaticamente à localização real.

## Escopo protegido

Esta etapa não altera parser, escala, continuidade, regulamentação, financeiro nem regras de reserva/sobreaviso.
