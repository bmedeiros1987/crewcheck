# CrewCheck TV — família de apps (piloto, não publicado)

## Estrutura

- `packages/tv-core`: contratos TvSnapshot/TvActivity/TvCalendarDay/TvMonthSummary, projeção do motor canônico existente, freshness, entrada remota e sessão.
- `server/tv`: device authorization, persistência transacional MySQL, rotas e núcleo editorial #694.
- `apps/tv-player`: React/Vite compartilhado, 16:9, Agora/Live, Briefing, Ambient, semana, mês, dia, mudanças e configurações.
- `apps/android-tv`: wrapper Android WebViewAssetLoader com assets locais, sem dependência de toque.
- `apps/samsung-tizen`: manifest do Tizen Web App.
- `apps/lg-webos`: manifest webOS.
- `apps/tv-assets`: ícones derivados do branding existente e banner de desenvolvimento.

Não existe implementação Fire TV/tvOS nesta entrega. Consulte a matriz de plataformas.

## Executar e validar

Na raiz, Node 22.13+:

```sh
npm ci --ignore-scripts
node scripts/tv-test.mjs
npx tsc --noEmit -p tsconfig.tv.json
npx tsc --noEmit
node scripts/tv-server-build.mjs
node scripts/tv-build.mjs web
node scripts/tv-build.mjs android-tv
node scripts/tv-build.mjs samsung-tizen
node scripts/tv-build.mjs lg-webos
```

Os três últimos comandos geram/stageiam **bundles web**, não AAB/APK/WGT/IPK. O build de servidor deve ocorrer depois de qualquer preparação canônica existente e depois do build principal (que pode limpar `dist`). Não editar o artefato compilado manualmente.

Prévia visual: definir `VITE_TV_DEMO=true` e executar `npx vite --config apps/tv-player/vite.config.mjs --host 127.0.0.1 --port 4178`. Dados sintéticos ficam explicitamente identificados; o cliente nunca faz fallback da API real para a demonstração. Nunca publicar um build demo como aplicativo operacional.

## Ativação de homologação

1. Passar os gates de revisão e preparar banco de homologação.
2. Aplicar explicitamente `migrations/20260918_tv_registry.sql` no banco correto. Não foi aplicada a banco real nesta entrega.
3. Gerar o bundle do servidor no mesmo SHA da aplicação canônica.
4. Habilitar `CREWCHECK_TV_ENABLED=true` somente nesse ambiente.
5. Compilar app principal e TV com `VITE_CREWCHECK_TV_ENABLED=true`; a página protegida `/tv-pair` autoriza/revoga dispositivos. A API/origin de produção permanece restrita a `https://crewcheck.online` e origens dos wrappers; homologação exige configurar a allowlist e o pairing origin no bridge, nunca aceitar origem arbitrária.
6. Fazer pareamento com duas contas, escala ativa real, modo Família/Privado, revogação, expiração e queda de rede.
7. Manter flags desligadas na produção até #530/#607 e gates de plataforma.

Não há migration automática, deployment, assinatura ou publicação implícita. Para rollback, desligar flag no servidor; ela é consultada em cada request. O cliente perde a informação em até 15 minutos offline; não existe revogação instantânea sem conectividade.

## Segurança e limites reais

- QR contém somente código humano temporário; segredo de polling separado. Aprovação exige bearer de conta existente, nunca identidade enviada no corpo. Código expira em 5 minutos; consumo único; polling mínimo 5 segundos.
- Credencial opaca escopada `tv:read`, hash persistido, validade de 24 horas, sem credencial principal na TV. Logout e revogação cortam acesso no servidor. Nova sessão/expiração exige novo pareamento; **renovação/rotação automática ainda não implementada**.
- Default Família: sem nomes, número de voo, rota, hotel, quarto, PDF, saúde ou financeiro. IDs que contêm voo/rota são substituídos por referências locais à versão da projeção no modo Família. Privado não autoriza dados fora do contrato.
- Snapshot privado e token apenas em memória. Cache de sessão Família é descartado ao trocar vínculo; não restaura acesso em cold launch. Offline usa último snapshot da sessão por no máximo 15 minutos, sempre com horário/freshness, depois oculta. Revogação recebida limpa tudo imediatamente.
- Registry MySQL usa uma linha com lock transacional e limites de cardinalidade para piloto; não é arquitetura de escala ilimitada. Necessita homologar rollback, concorrência multi-instância e falha de banco. Rate limit usa endereço da conexão, não confia em `X-Forwarded-For` arbitrário; atrás de proxy compartilha limite conservador.
- TV reutiliza `buildCanonicalRosterEvents`/`selectNextRosterEvent`. Não altera parser/APZ/journey. A projeção bloqueia APZ sem correspondência com campo publicado, pois existe fallback legado APZ=STD no core de origem; isso precisa permanecer registrado no P0.
- Escala ativa deve ser única por conta. Ausência/ambiguidade é indisponível, nunca escolha silenciosa de revisão. A integração de continuidade entre meses deve ser homologada com o corpus P0 antes do piloto real.
- Saída Inteligente, gate/Remota, clima, mudanças e ticker têm contratos/componentes, mas **não estão ligados aos providers reais nesta entrega**. Permanecem indisponíveis fora da demonstração até projeções autorizadas com proveniência/validade.
- Notícias: gateway server-side testado com fontes sintéticas, allowlist, dedupe, timeout, cache 15 min e descarte após 24 h. Endpoint entregue retorna feed vazio até validar fontes/termos e entitlement server-side. Não há rss2json nem ranking externo com dados da escala. Falta circuit breaker por fonte e validação comercial dos candidatos #694.
- #690 permanece dependência para planos/quick actions reais do Crewcierge. O ticker aqui é apresentação de strings canônicas, não novo agente conversacional. Entitlement Premium real permanece pendente; não ativar comercialmente antes dele.
- TVs domésticas: sem auto-start, power control, watchdog 24/7, voz do controle ou background permanente prometidos.

## Estado de validação

2026-09-18: testes comportamentais locais, TypeScript do app e TV, build Vite compartilhado e staging de três plataformas executados. Prévia sintética em navegador, Live/mês em 1920×1080 e 1280×720; navegação por setas/Enter/Escape e retorno por inatividade observados. Isto não é homologação física, teste de loja, backend real nem prova de CI remoto verde.

Pendências de release: SDKs nativos, pacotes assinados, emuladores, TVs físicas, MySQL real, conta/roster reais, regressão canônica preparada completa, entitlement e providers externos, acessibilidade em TV, revisão de loja. O PR #693 continua separado; não mesclar seus fallbacks/APIs RSS ao novo player.

Refs #686 #687 #689 #690 #693 #694 #530 #607.

## Evidências desta entrega

PRs draft empilhados: [#698 core/API](https://github.com/bmedeiros1987/crewcheck/pull/698) → [#699 player](https://github.com/bmedeiros1987/crewcheck/pull/699) → [#700 plataformas](https://github.com/bmedeiros1987/crewcheck/pull/700). Revisar/mesclar nesta ordem, somente após os gates; nenhum foi mesclado.

- CI TV aprovado no commit `265a9d2e7e8b2c3ff34a3f02d63fda313e283eab`: [execução 35303904210](https://github.com/bmedeiros1987/crewcheck/actions/runs/35303904210). Inclui 17 testes, TypeScript TV, bundle servidor e staging web Android/Tizen/LG. Artefatos não são pacotes nativos assinados.
- Gate multicanal aprovado no CI do core `e123e9e0d8a730d15d6af9f0c1dc710da9d79e74`: [execução 35303904907](https://github.com/bmedeiros1987/crewcheck/actions/runs/35303904907).
- Preparação completa, TypeScript e 17 testes TV também passaram localmente na árvore preparada. A integração foi corrigida para preservar as âncoras dos scripts legados de preparação.
- Divergência local registrada: `regression-v14-3-74-for-cgh.mjs` acusa duas jornadas em 01/08 onde espera uma, tanto no core TV quanto no main original `78b1dc1ba5e36a282e76d6d96a9506bffda8b323`, com dependências instaladas sem scripts. O CI multicanal com seu fluxo normal passou. Não alteramos parser, fixture nem expectativa para contornar o resultado; a diferença de preparação/ambiente precisa ser investigada no P0 antes de liberar piloto operacional.

CI verde nesses recortes não fecha #530/#607 e não comprova backend real, entitlement, feeds licenciados ou hardware.
