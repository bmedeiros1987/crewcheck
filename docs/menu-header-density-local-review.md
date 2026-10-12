# Menu/header: preparação visual local para revisão

Base: `88183e93f711b3c94c0666f633058237876f853b`. Branch local `fix/menu-header-density-20261012`. Sem push, merge, deploy ou publicação Play. PR1023 não foi alterada; HEAD protegido `9a27baf40659543d1e6804c780e777df70e11115`.

O protótipo anterior duplicava a marca e o perfil e reservava largura ao contador Pulse. O candidato usa uma identidade única, de altura natural: avatar/nome e ações, e-mail/plano completos abaixo. Em 320px/200% os detalhes usam a largura inteira. Header/Pulse e header do menu rolam com seu documento/scroller; safe-area do menu aplicada uma vez. O texto necessário mantém a escala escolhida, quebra naturalmente e não usa clamp/ellipsis. Busca exibe “Buscar” e preserva o nome acessível “Buscar função”. O contador Pulse fica no controle de expansão, em outra linha.

O finalizador modifica somente MenuDrawer após a preparação canônica existente; mantém callbacks, consentimento, produtores Pulse e cálculos. A PR1017/orquestrador não foi editada. Arquivos gerados pelo build permanecem no worktree e não integram o commit visual.

## Evidência

Capturas reais do app compilado, conta sintética `SYNTHETIC USER QA`, e-mail `.invalid`, metadados `Administrador · Base BSB · Premium Unlimited`; APIs locais 503, destinos externos abortados, sem dados/avisos/envios reais. Matriz menu 320/390/430 × claro/escuro ×100/200. Contraste dos campos >=5,43:1 claro e >=9,39:1 escuro. Glifos completos, uma identidade, alvos44px, busca, rolagem e foco exato após Escape verificados.

Comparação anterior retirada como evidência: o CSS da referência legível tinha uma concatenação inválida. A nova rodada faz parse com PostCSS, verifica aplicação efetiva no navegador e registra base real, referência contrafactual legível e candidato separadamente. A base real escondia campos em200%; não representa a mesma informação visível. Métricas novas estão no pacote de revisão, não são os ganhos anteriormente declarados.

Revisão adicional: reserva scrollbar simétrica; ações em linha própria até430px/200%; metadados em largura plena; nome com quebra por palavra; gap>=8px entre editor e primeiro favorito; ícone Personalizar24×24 sem encolher. Harness usa cwd/variáveis de ambiente para runner limpo. Capturas registram HEAD/tree, hashes dos bundles e fontes preparadas; exigem HEAD embutido no bundle quando UI_EVIDENCE_REQUIRE_COMMIT=1.

Pulse completo36 cenários passou:320/390/1440 × alturas420/844 × claro/escuro ×100/150/200; aviso crítico longo, últimas linhas acima do rodapé, rolagem, Escape/foco, Enter/recolher/dispensar e desbloqueio. O teste de rolagem herdava smooth-scroll: movimento tornou-se instantâneo, sem relaxar a asserção de visibilidade. Matriz menu responsivo54 passou na versão imediatamente anterior; a mudança final somente remove CSS sem uso e amplia detalhes320/200. O build final repetiu menu12, Pulse320/420/200 e fluxo header/menu24.

Build Vite e TypeScript passaram. Transformação MenuDrawer é idempotente e preserva bytes externos ao seu limite. Tentativas intermediárias de captura durante rebuild foram descartadas; o pacote final usa capturas finalizadas após o build. CI remoto não executado nesta branch local.

## Limites e sequência

Aguardando revisão independente do patch/HEAD e capturas. Nenhuma publicação antes da frente Play. Testes Chromium com safe-area24/20 e viewport reduzido; não comprovam dispositivo Android/IME físico. Logo existente da base preservado; integração da arte aprovadaPR936 e assets nativos ficam fora deste patch. Deploy web não atualiza launcher/splash/drawables de APK já instalado.
