# Sequência publicada após sobreaviso

Base isolada: main `1435afd4b12cfc263be9fb7b519bf4117c03e64a` (composição #944, catálogo #943 e localização #942). Nenhuma publicação neste trabalho.

## Causa reproduzida

O motor canônico preserva HSB 02:00–02:40 e ASB 02:40–04:00 como dois eventos, mas `nextFlight`/`selectNextRosterEvent` seleciona apenas o primeiro ativo/futuro. A Home padrão e o slot `next` personalizado exibiam somente esse evento. A seleção singular continua válida; o novo painel projeta os sucessores disponíveis da mesma publicação, sem alterar o motor ou agrupar juridicamente jornadas.

A fixture real do motor demonstra 40 minutos publicados de HSB e 80 de reserva. Esses valores não são tempo realizado nem limite legal. O painel de produção não exibe prazo regulatório.

## Estados e limites da evidência

- **Programado:** cada evento disponível, com sua data e janela publicada. Defaults canônicos 00:00/23:59 não são tratados como horários publicados quando os campos da fonte estão ausentes.
- **Inferido:** HSB seguido exatamente de reserva/voo na publicação, com janelas completas e sem lacunas/sobreposições na sequência disponível. É apenas compatibilidade com possível acionamento; não confirma telefonema, deslocamento ou início efetivo.
- **Confirmado:** não há produtor de acionamento com origem verificável no contrato atual. A UI declara ausência de confirmação. O projetor aceita confirmação somente com contexto exato conta/versão/evento e fonte explícita, mas nenhum chamador de produção fornece essa evidência. Não há botão que invente confirmação, nem interpretação de um voo futuro como prova de realização.
- **Encurtado entre versões:** apenas uma mudança observada exata do evento, no histórico da conta, na revisão e versão atuais. Data e início precisam corresponder; o fim anterior deve ser posterior. Histórico antigo, outra conta ou correspondência ambígua não entram na UI. Motivo permanece desconhecido.

Descanso/estadia encerra a projeção. Outra data exige journeyId não vazio compartilhado ou horários publicados exatamente adjacentes; isso apenas permite mostrar a sequência, não constitui vínculo jurídico. Eventos no mesmo dia com intervalo são mostrados com vínculo não confirmado. Horários incompletos e sobreposições são explícitos. Nada altera elegibilidade de rota/acionamento HSB, motores regulatórios, remuneração, importador ou cadastro de hotéis.

## Validação

Executar após preparação canônica:

```sh
node scripts/v139/apply.mjs
node scripts/regression-standby-sequence-card.mjs
node scripts/regression-standby-sequence-card-browser.mjs
node scripts/regression-standby-sequence-home.cjs
node scripts/regression-home-standby-departure.mjs
node scripts/regression-departure-location-consistency.mjs
node scripts/regression-positioning-session-isolation.mjs
node scripts/regression-menu-5s.mjs
node scripts/regression-fixed-navigation-headers.cjs
npx tsc --noEmit
npx vite build --configLoader runner
```

No executor Mac, Chromium via `MENU_PLAYWRIGHT_PACKAGE=/Users/marinamoura/.local/pw/package.json`. Browser bloqueia rede externa, service workers e API real; horários, conta, escala e localização são sintéticos. Não há localização usada nos novos testes.

Passaram motor canônico, HSB→reserva→voo, encurtamento, descanso, evento independente, lacunas, sobreposição, horários ausentes, meia-noite, conta, foco, publicação antiga e mudança de jornada. React real em 393px; Home compilada em 393px claro/escuro sem ação de saída aeroportuária no HSB. Catálogo existente passou. Cabeçalhos passaram 18 combinações (320/390/1440px × claro/escuro × texto100/150/200). TypeScript e build passaram (aviso de tamanho de chunk já existente).

Evidências: [Home clara](evidence/standby-sequence/home-light.png), [Home escura](evidence/standby-sequence/home-dark.png), [projeção sintética](evidence/standby-sequence/projection.json). Os PNG foram abertos e inspecionados no executor.

As referências JPEG Library anteriormente fornecidas receberam403; nenhum pixel do usuário ficou disponível no Mac. Não houve bypass. A reprodução é sintética e não prova o conteúdo exato da escala do usuário.

## Revisão e implantação

Possíveis conflitos: `scripts/v139/apply.mjs` e Home gerada (âncoras `FlightCard`, briefing e `OperationalDayTimeline`). O novo finalizador roda depois de `fixed-navigation-headers.mjs`; CSS restrito ao novo painel. Não sobrescreve catálogo #943 nem finalizadores #942. `client/src/lib/publishedSequence.ts` é gerado; a fonte revisável é `scripts/standby-sequence-card/evidence.mjs`.

Draft precisa de revisão independente e CI antes de publicação. Novo APK não é necessário para o wrapper Android que carrega a aplicação remota; conteúdo só chegará após publicação web aprovada e atualização da WebView. Versões com conteúdo embarcado exigiriam distribuição nova; não foram verificadas. Nenhum APK, loja ou deploy foi executado.
