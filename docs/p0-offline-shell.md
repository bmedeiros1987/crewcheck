# P0 offline shell

Este slice cobre somente a fundação do shell offline da issue #260.

- registra `client/public/sw.js` no boot sem bloquear a aplicação;
- mantém o coordenador de atualização existente e nunca força `window.location.reload()`;
- prepara `/`, `/index.html`, manifest, ícone e assets same-origin referenciados pelo HTML;
- navegação offline cai para o último shell válido;
- chamadas `/api/` e `/auth/` não entram no cache do shell;
- publica estado `online/offline` no runtime para uma UI posterior;
- não altera parser, continuidade, regulamentação, financeiro, Radar ou Saída Inteligente.

A persistência da última escala válida, bundle local Android e indicador visual pertencem aos próximos slices da #260.
