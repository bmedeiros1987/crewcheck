# CrewCheck v14.3.66 — boot estável

## Escopo

Hotfix P0 restrito ao boot Web/PWA/Android wrapper:

- remove o watcher legado que chamava `window.location.reload()` ao detectar versão diferente;
- preserva o coordenador seguro de Service Worker, que atualiza sem reload forçado durante uso ativo;
- usa a logo canônica local `/icons/crewcheck-icon-v2.png` desde o primeiro frame do splash;
- pré-carrega a logo e reserva 96×96 px para evitar piscada/layout shift;
- bloqueia animação/transição da imagem durante o boot;
- adiciona regressão dedicada para impedir retorno de reload automático, watcher legado e `unregister()` destrutivo.

## Proteções

Não altera parser, motor canônico da escala, continuidade, regulamentação, financeiro, Radar, Saída Inteligente ou regras de localização.

## Validação

O workflow `CrewCheck v14.3.66 stable boot` executa `npm ci`, `npm run build` e a regressão `regression-v14-3-66-stable-boot-logo.mjs` sobre a fonte preparada final.
