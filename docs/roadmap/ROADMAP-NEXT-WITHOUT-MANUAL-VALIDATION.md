# Próximos avanços sem validação manual

## Etapa 4 — Localização canônica

Automatizável agora:

- contrato único de fontes e validade;
- normalização `live/static` para `telegram`;
- rejeição de fonte desconhecida, coordenada inválida e timestamp ausente/futuro;
- filtro e ordenação por distância;
- inventário dos handlers e TTLs duplicados;
- teste estático contra cidade fixa e interceptações paralelas;
- documentação do comportamento esperado por consumidor.

Exige validação em produção depois:

- sequência real Telegram → Farmácias → Academias → Hospitais → Locais Próximos → Saída Inteligente;
- confirmação do rótulo/cidade mostrado ao usuário;
- precisão prática da geocodificação e das rotas.

## Etapa 5 — Radar econômico

Automatizável sem usuário:

- inventário de chamadas por provedor;
- deduplicação por voo/data/origem/destino;
- política de cache por estado do voo;
- backoff e circuit breaker;
- contrato para seguir qualquer voo;
- regressões com respostas simuladas.

Exige validação externa depois:

- comportamento com dados reais dos provedores;
- alertas de portão/status em produção.

## Etapa 6 — FlyDeck cronológico

Automatizável sem usuário:

- modelo de dados cronológico;
- ordenação determinística;
- deduplicação de eventos;
- textos pt-BR e respaldo “consulte sempre a escala oficial”;
- testes de continuidade e virada de meia-noite.

Exige validação visual depois:

- legibilidade em aparelhos reais;
- densidade de informação e hierarquia dos cards.

## Etapas 7 e 8

Automatizável sem usuário:

- testes de assinatura e idempotência do webhook Asaas;
- auditoria de rotas, permissões, estados vazios e mensagens técnicas;
- matriz de checks por módulo.

Validação manual fica reservada apenas aos pontos que dependem de produção, aparelho, localização física, conta externa ou julgamento visual.
