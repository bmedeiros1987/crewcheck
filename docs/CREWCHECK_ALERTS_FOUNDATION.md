# CrewCheck Alerts — foundation

Este slice é propositalmente isolado do parser/canônico da escala.

## Objetivo

Criar uma linguagem operacional de alertas confiável e personalizável, com distinção explícita entre APZ/apresentação e decolagem, identidade sonora CrewCheck e integração futura com Escala, Concierge, Radar e Saída Inteligente.

## Contratos

- APZ/apresentação e decolagem são conceitos distintos.
- Ausência de APZ nunca autoriza fallback para STD/decolagem.
- A preferência visual do usuário (`APZ`, `Decolagem`, `Ambos`) altera apenas apresentação.
- Categorias iniciais: apresentação, hora de sair, decolagem, pickup, despertador, mudança de escala, portão, reserva/sobreaviso e alerta regulatório.
- Sound cues iniciais: `signature-soft`, `signature-operational`, `signature-urgent`, `signature-wake`.
- A implementação nativa deverá mapear cada cue para assets derivados das músicas-base CrewCheck, sem acoplar a regra operacional ao nome físico do arquivo.

## Próximos incrementos

1. Persistência das preferências por usuário/dispositivo e UI de configuração.
2. Ponte nativa Android com categoria/sound cue e teste de alerta.
3. Canais Android separados por criticidade, com vibração/prioridade adequadas.
4. Reagendamento persistente após reboot/update e tratamento explícito de otimização de bateria.
5. Integração de APZ e decolagem sem fallback semântico.
6. Pickup/Concierge, Hora de Sair e Despertador.
7. Diff de escala Publicada × Executada gerando alertas de mudança.
8. Paridade iOS quando o shell iOS estiver disponível.

## Fora deste slice

- parser/canônico da escala;
- regras de jornada/RBAC/ACT;
- financeiro;
- alteração de fixtures/oracles P0;
- qualquer fallback APZ=STD.
