# PR936: marca aprovada e rodapé legível em200%, preparação local

Base/checkpoint aprovado:6ceabe26db26725a2800d16e5052dbe53e82b4d7. Branch separada `fix/brand-footer-accessibility-20261012`. Não altera esse checkpoint e não publica. A composição anterior6ce+#1023 foi validada pelo revisor independente; a revisão deste novo delta permanece necessária.

## Autoria e escopo

Arte entregue pelo produto e arquivo/CSS de entrada reaproveitados da PR936, HEAD e8d9782eeaa93a6a3a0518f60f82480479911a9f. Não foi gerada nova marca. PNG512×512RGBA preservado byte a byte:3656d39df50e32094211ef737c0237a26308e7e742bcccc855a87150f47a638c. O gerador é o patch original936; o CSS original de entrada recebe apenas cache/versionamento e apresentação transparente da marca canônica. Polimento FlightDeck da936 não integra este delta.

O finalizador existente chama a integração de assets depois da preparação. V2/V3 copiam o mesmoPNG; os aliasesSVG antigos embutem essePNG, em vez de redesenharem a arte antiga. URLs de marca recebem token baseado noSHA, incluindo favicon, cabeçalho, boot, auth, PDF/share e manifest/atalhos. Precache inclui as URLs exatas utilizadas e os nomes de shell/runtime recebem sufixo de marca. O cache independente de PDFs e os handlers de instalação/ativação/fetch/mensagens ficam intactos.

O rodapé mantém os cinco destinos, ordem e handlers. Em200% e largura<=900px usa três colunas em duas linhas, com FlightDeck ocupando duas colunas na primeira linha. Não reduz fonte, corta palavras ou oculta labels. O frame continua medindo a altura real para clearance; fallback CSS cobre a altura maior em renderizações de componentes sem esse frame.

## Android/Play

O recurso legado de boot `crewcheck_logo_neon.png` usa os mesmos bytes aprovados; `ic_launcher.xml` vira alias do recurso `crewcheck_icon_site` que o Gradle já gera. Phone/Wear/Watchface já têm tasks que copiam os PNGs canônicos: entram na conferência de fontes, sem mudanças de versão, SDK, signing, providers ou credenciais.

O asset512PNG e SVG de listing são preparados para revisão; não houve envio à loja. A fonte936 possui cantos transparentes/arredondados e sua adequação final ao canvas de listing deve ser conferida pela frente Play, sem alegar nova arte ou aprovação de upload. Especificação oficial: https://developer.android.com/distribute/google-play/resources/icon-design-specifications — listing e launcher são ativos diferentes; o Play aplica máscara/sombra. Não foi instalado novo SDK: Android SDK não configurado neste ambiente, então não há AAPT/APK/AAB novo validado aqui.

Web/PWA requer atualização do cache/cliente; não muda launcher, roundIcon ou boot/splash nativos de APK já instalado. Esses recursos exigem build, empacotamento e instalação de novo APK; uploads de listing têm ciclo separado. Aceitação física Android, máscaras de launcher, Wear/watchface e listing final permanecem na frente Play.

## Evidência/CI

Harness de fluxo agora confere hashes também ao término. A matriz responsiva completa54contextos+2contraprovas permanece obrigatória, incluindo paisagem/tablet;12casos de perfil não a substituem. Registro TypeScript salva comando, exit code real e SHA. Próximo checkpoint não retém contador intermediário19casos. Capturas/bundles seguem vinculados ao commit exato; nova validação após build canônico, sem concorrência de preparação com captura. As instruções de origem e limites não são autorização de publicação: revisão independente e sequência Play permanecem obrigatórias.
