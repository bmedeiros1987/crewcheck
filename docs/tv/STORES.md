# Toolchains e envio às lojas — guia de preparação

**Nenhuma loja recebeu este app. Não há pacote assinado com chave de release.** O Actions já compila APK/AAB Android com certificado debug e IPK LG de demonstração; também gera contêiner WGT Samsung sem assinatura. Esses artefatos usam IDs separados e não são submissões de loja. Veja [ACTIONS.md](ACTIONS.md). IDs de produção abaixo são candidatos técnicos, não reservas aprovadas nos consoles. Guarde certificados fora do Git; use os mesmos IDs/chaves para upgrades. Reconfirme políticas no console no momento do envio.

## Google TV / Android TV

- Projeto: `apps/android-tv`; ID candidato `online.crewcheck.tv`, versão 0.1.0/1.
- Toolchain configurado: JDK 17, Gradle 8.11.1 compatível com AGP 8.9.2, Android SDK 35; conferir target SDK vigente para TV antes da submissão. Este ambiente só apresentou Java 8; não há Gradle/ADB/SDK de TV no PATH.
- Manifest: Leanback launcher obrigatório, landscape, touchscreen não obrigatório, Internet, backup desabilitado, cleartext desabilitado. Assets via HTTPS local WebViewAssetLoader, links de navegação externos bloqueados.
- Branding de desenvolvimento: ícone 512 e banner 320×180; validar legibilidade, assets localizados e requisitos finais do Play.

```sh
node scripts/tv-build.mjs android-tv
cd apps/android-tv
gradle :app:assembleDebug
gradle :app:bundleRelease
```

Para release, provisionar `TV_KEYSTORE`, `TV_STORE_PASSWORD`, `TV_KEY_ALIAS`, `TV_KEY_PASSWORD` como secrets de ambiente. Sem keystore o release deve falhar; não criar chave descartável para publicação. Adicionar Gradle Wrapper oficial com checksum quando instalar toolchain, para tornar builds reproduzíveis.

1. Android Studio: instalar SDK e imagem Android TV/Google TV; abrir projeto e corrigir quaisquer incompatibilidades efetivamente encontradas.
2. Instalar debug APK no emulador e em TV real via ADB; testar D-pad, back, QR, suspensão/retorno, offline, revogação, nova versão sobre antiga.
3. Play Console: criar app, reservar ID correto, configurar Play App Signing e upload key; preencher privacidade, suporte, Data Safety, classificação, acesso do revisor e ficha TV.
4. Gerar AAB **assinado** no SHA revisado; enviar para teste interno/fechado com fator de forma TV; examinar relatórios e rejeições.
5. Subir screenshots reais do app instalado, banner/ícones finais e notas; solicitar revisão TV. Só promover após aprovação e teste real.
6. Verificar 64-bit e page-size 16 KB em dependências/bibliotecas empacotadas se aplicáveis; este shell não adiciona bibliotecas NDK próprias, mas a verificação do pacote final é obrigatória.

Fontes: [criar app TV e manifest](https://developer.android.com/training/tv/get-started/create), [qualidade TV](https://developer.android.com/docs/quality-guidelines/tv-app-quality), [distribuição](https://developer.android.com/training/tv/publishing/distribute).

## Samsung Tizen TV

- Projeto: `apps/samsung-tizen/config.xml`; bundle em `dist/samsung-tizen`.
- IDs candidatos: package `CrewChkTV1`, application `CrewChkTV1.Player`. Gerar/confirmar os IDs oficiais no SDK e mantê-los em upgrades.
- Toolchain: Tizen Studio + Samsung TV Extension + Samsung Certificate Extension. Não encontrado neste ambiente.
- Piso experimental no manifest: Tizen 7.0; bundle compilado para Chromium 87. Compatibilidade por ano/modelo **ainda não comprovada**. Não selecionar toda a base instalada no Seller Office.
- Privilégio Internet, allowlist HTTPS CrewCheck, CSP, sem background. Return 10009 é tratado pelo player. Validar Exit/long press e lifecycle na TV.

```sh
node scripts/tv-build.mjs samsung-tizen
tizen build-web -- dist/samsung-tizen
tizen package -t wgt -s CrewCheckTV -- dist/samsung-tizen/.buildResult
```

1. Criar perfil Samsung TV no Certificate Manager, author + distributor. Incluir DUID das TVs de teste; fazer backup seguro do author certificate.
2. Habilitar Developer Mode na TV, conectar pelo Device Manager, permitir instalação e instalar o WGT assinado. Emulador isoladamente não comprova TV física.
3. Testar cold start, QR, setas/OK/Return/Exit, cache, indisponibilidade, fontes e encerramento pelo sistema. Não impedir screensaver indevidamente.
4. Samsung TV Seller Office: cadastrar app, categoria, países/modelos testados, suporte/privacidade, imagens, descrição e instruções de acesso ao revisor.
5. Carregar WGT assinado, executar validação e submeter certificação. Corrigir os defeitos apontados e reenviar com versionamento adequado.
6. Só registrar suporte aos modelos/anos testados e aprovados.

Fontes: [config.xml e privilégios](https://developer.samsung.com/smarttv/develop/guides/fundamentals/configuring-tv-applications.html), [certificados](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/creating-certificates.html), [registro no Seller Office](https://developer.samsung.com/tv-seller-office/guides/applications/registering-application.html).

## LG webOS TV

- Projeto: `apps/lg-webos/appinfo.json`; bundle em `dist/lg-webos`; ID candidato `online.crewcheck.tv`, versão 0.1.0.
- Toolchain: webOS CLI oficial, Simulator/Emulator adequado ao alvo, aplicativo Developer Mode na TV e conta LG. Não encontrado neste ambiente.
- Assets: `icon.png` 80×80, `large-icon.png` 130×130; ícone 400×400 para Seller Lounge. `resolution` 1920×1080. Back 461 controlado pelo player, relaunch automático pelo sistema.
- Bundle compilado para Chromium 87: delimitar versões de webOS somente após testar o engine correspondente. Magic Remote não é requisito; setas devem bastar.

```sh
node scripts/tv-build.mjs lg-webos
ares-package dist/lg-webos
ares-setup-device
ares-install --device <tv-configurada> <arquivo.ipk>
ares-launch --device <tv-configurada> online.crewcheck.tv
```

1. Instalar toolchain oficial e configurar TV pelo Developer Mode. Não confundir expiração de sessão de desenvolvimento com distribuição comercial.
2. Empacotar IPK e instalar em TV física; testar lançamento, Back, Enter, Magic Remote, suspensão, troca de app, relaunch, rede e revogação.
3. LG Seller Lounge: cadastrar app, ID/versão, países, aparelhos alvo, ícones e screenshots, privacidade/suporte, classificação, autoavaliação e instruções ao revisor.
4. Subir pacote no fluxo de submissão vigente do portal e completar validação/certificação. O fluxo de assinatura/distribuição da LG deve ser seguido no portal; não reutilizar certificado Tizen ou presumir que um IPK de Developer Mode esteja aprovado para loja.
5. Tratar reprovações e validar o binário final antes de anunciar disponibilidade.

Fontes: [appinfo e tamanhos de ícone](https://webostv.developer.lge.com/develop/references/appinfo-json), [CLI](https://webostv.developer.lge.com/develop/tools/cli-dev-guide), [Seller Lounge](https://seller.lgappstv.com/).

## Fire TV e Apple TV

Fire TV: potencial reaproveitamento de TV Core e shell Android em aparelhos Fire OS compatíveis, mas não foi compilado/testado. Exige auditoria das APIs por modelo/OS, SDK, controle remoto, autenticação e Amazon Appstore. Não presumir que todo produto Fire TV execute o mesmo runtime. [Teste/instalação oficial](https://developer.amazon.com/docs/fire-tv/installing-and-running-your-app.html).

tvOS: compartilhar contrato JSON e design tokens; renderer nativo SwiftUI/UIKit, URLSession e Keychain em projeto próprio. Este ambiente Windows não fornece Xcode, assinatura Apple nem simulador. Não entregar uma pasta Swift fictícia como suporte concluído. Exige Mac/Xcode, App ID/provisioning, foco Siri Remote, TestFlight, Apple TV física e App Store Connect. [Frameworks tvOS](https://developer.apple.com/tvos).

## Checklist obrigatório por plataforma

- [ ] ID definitivo, versão e upgrade path registrados.
- [ ] Toolchain e dependências fixados; build do SHA revisado.
- [ ] Pacote instalável e assinatura/distribuição apropriada comprovados.
- [ ] Emulador/simulador e TV física identificados por modelo/OS.
- [ ] Pareamento real com contas A/B e isolamento; revogar/expirar/logout.
- [ ] Toda navegação sem toque, foco visível, Back/Exit sem bloqueio.
- [ ] Offline com idade explícita, reconexão, limite de cache, retorno após suspensão.
- [ ] Fatos iguais ao canônico; APZ ausente nunca vira STD.
- [ ] Privacy/entitlement, termos dos feeds e ausência de secrets no bundle.
- [ ] Screenshots do pacote final, ícones/banner, ficha da loja, privacidade, suporte e acesso do revisor.
- [ ] Gates #530/#607 liberados; revisão de loja concluída; evidência de aprovação anexada.

Até todos os itens aplicáveis terem evidência, registrar **experimental / não publicado**, nunca “suportado”.
