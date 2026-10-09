# HSB seguido de reserva: investigação e proposta testável

Base isolada: main `50e6b73b2ed536e7aee67d7471a96b1a52c36a7b`. Esta branch contém somente documentação, protótipo de leitura e testes sintéticos; não altera a UI, parser, regulamentação, cálculo financeiro ou PR942.

## Causas verificadas em código

`PersonalizedCockpit` em `client/src/pages/Home.tsx` chama `nextFlight(events)` e o slot `next` renderiza exatamente `<FlightCard event={event}/>`; nenhum sucessor é passado a esse card. `selectNextRosterEvent` em `client/src/lib/canonicalRoster.ts` retorna o primeiro evento ativo, ou apenas o próximo futuro. Antes ou durante HSB 02:00–02:40, o selecionado é HSB mesmo quando a reserva seguinte já está em `events`.

`isWaitingActivation` em `client/src/components/v1432/ManualRegulationView.tsx` classifica HSB e ASB/RES/RSV sem legs como `waiting`, independentemente de sucessores ou histórico. `RosterRegulationBadge` traduz esse resultado para “Aguardando acionamento”. Assim, reserva publicada e HSB podem receber o mesmo texto, que não representa uma análise da sequência.

O teste executa o motor canônico real com duas atividades sintéticas distintas no mesmo dia e comprova que ambas sobrevivem à normalização e à geração. Portanto, a seleção/renderização singular é uma causa reproduzida de card incompleto quando ambas as atividades estão no input. A referência Library `libfile_389eab76c418819187b14a1140e6042a` retornou 403: nenhum JPEG foi materializado ou visto. Sem o roster real autorizado, não está demonstrado se o importador perdeu a reserva no caso concreto.

## Contrato canônico e histórico

`RosterDay` (`client/src/lib/pdfParser.ts`) preserva código, `dutyReport`, `dutyDebrief`, legs, data e texto. `normalizeRosterDays` distingue atividades não aéreas pela data, código e janela; HSB e ASB não são fundidos por terem a mesma data. Cada atividade não aérea recebe `kind: duty` e `journeyId` próprio. Os tempos `startDateTime/endDateTime` não são, por si só, prova de apresentação aeroportuária ou jornada efetivamente iniciada. Quando horários publicados faltam, o motor possui defaults 00:00/23:59: a projeção proposta consulta os campos publicados antes de mostrar duração/horário.

`rosterPublicationReview.ts` mantém histórico por conta, versão, antes/depois e cobertura `completeDates`. O primeiro import e a ausência de cobertura completa são explicitamente desconhecidos. Não se deve deduzir cobertura pelo mês ou apagar ocorrência ausente de uma fonte parcial. Para comprovar encurtamento, correlacionar uma única ocorrência de HSB da mesma conta, data e início publicado com uma observação anterior atribuível; ambiguidades e histórico indisponível aparecem como lacuna. O histórico local de publicação comprova alteração observada, não aceite da empresa ou execução.

## Proposta inicial de evolução

Substituir o input singular do card por uma projeção somente de leitura da programação disponível a partir do evento selecionado. Exibir as atividades disponíveis do dia até repouso/pernoite explícito, com continuidade comprovada através de meia-noite quando houver etapas adjacentes ou a mesma identidade canônica de jornada. Cada linha conserva código, janela publicada, fonte/versão e estado “Publicado”; intervalos e sobreposições permanecem visíveis. A agrupação visual não cria uma jornada jurídica única.

Para HSB 02:00–02:40 → reserva 02:40–04:00 (fim da reserva é fixture sintética, não dado do usuário), mostrar ambas as linhas. HSB usa “Início do sobreaviso”, nunca “Apresentação no aeroporto”. A adjacência com atividade operacional seguinte é um indício de possível acionamento programado; a redução de uma janela anterior é evidência adicional de reprogramação. Nenhuma delas confirma telefonema, deslocamento, presença no aeroporto ou realização. Um evento futuro arbitrário, com intervalo ou sem vínculo, não confirma nem gera indício automático de acionamento.

Estados separados: `unconfirmed`, `possible`, `explicit`. Confirmação explícita requer evidência atribuída à conta, versão e evento, com fonte identificada. Os horários de telefonema, deslocamento e início efetivo de jornada são campos distintos e permanecem ausentes enquanto não confirmados. Uma confirmação de deslocamento não preenche automaticamente apresentação ou início da jornada.

Contagens separadas de janelas **publicadas** de sobreaviso, reserva e voo. Duração desconhecida permanece null. O protótipo não calcula limite agregado, residual, corte ou infração; não aplica teto genérico HSB+reserva+voo nem sinaliza violação de mínimo de sobreaviso porque a janela foi encurtada. Os critérios operacionais/jurídicos informados pelo usuário serão insumos para uma etapa posterior após delimitar fonte, modalidade, tripulação e manual do operador; campo de aclimatação ausente não é confirmação de condição fisiológica.

## Evidência e integração

`scripts/journey-sequence-evidence/prototype.mjs` é um protótipo sem importação na produção. `scripts/regression-standby-reserve-sequence-evidence.mjs` testa o motor canônico real, seleção singular, preservação HSB/ASB, versões/contas, possível vs explícito, horário ausente, meia-noite, eventos futuros separados, contagens distintas e ausência de corte legal. Comando: `node scripts/regression-standby-reserve-sequence-evidence.mjs`.

Uma integração futura deve receber o vetor canônico completo e evidência de versão/conta, reagir ao relógio/importação/confirmação, manter indicadores de fonte e lacunas, e usar o mesmo seletor para determinar a âncora atual. Não escrever `activated` ou mudar `airportAssignment` em função da inferência. Adicionar testes para sequência durante cada transição temporal, revisões parciais/ambíguas, eventos de outra conta, repouso explícito, cancelamento de programação e confirmação revogada.

Potenciais conflitos com a tarefa UI: slot `next` em `PersonalizedCockpit`, `FlightCard`, `Cockpit` e `OperationalDayTimeline` no `Home.tsx` preparado; registro na cadeia `scripts/v139/apply.mjs` se houver finalizador futuro. Esta investigação não modifica esses arquivos. Não foi possível identificar/acessar a tarefa UI específica pelas ferramentas de threads; a coordenação deve partir do executor pai antes da integração visual.
