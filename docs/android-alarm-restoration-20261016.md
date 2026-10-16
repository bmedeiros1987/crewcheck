# Restauração local do alarme nativo, OFF — 16/10/2026

Este candidato restaura código existente das evidências textuais das PRs997–999; não reimplementa o motor nem ativa alarmes. Base local2286c88ffed330246f1c39bed5ad7bb4d64e7851. Não inclui Wake/fuso3828acd7 nem afirma a composição final solicitada. A branch é independente, para revisão e futura composição com os arquivos exatos.

## Origem e recuperação verificável

Library stay-native-adapter-review.md/libfile_74445ed4180481919edabec2321e44f8 v2: diff completo histórico seguido pela correção de corrida no claim. CrewCheck-PR998-review.md/libfile_6d5dd8c023a88191a318bb2802c55c88 v2: host completo seguido pelo fix de cancelamento incerto. CrewCheck-PR999-review.md/libfile_77268ed563448191bfa5c35194b3f226 v1: lease/lifecycle seguido pelo fix account+epoch. Diferenças foram lidas como conteúdo textual autorizado, não por acesso GitHub. Todos os patches de fonte aplicaram com git apply --check. Não foram incluídos workflows dos drafts nem sua fixture de browser incompatível com esta base, que já usa relógio fixo. A ordem correta aplica o owner fix de999 depois de sua base, em vez de repetir o equivalente998 antes da alteração da lease.

Os relatórios de11/10 registravam drafts OFF; estado remoto atual não foi reconsultado. Principais referências históricas:997/28ca060f,998/7add154f,999/427f45aa. Recurso de splash usa XML já preservado no checkout: inset27%, arte aprovada intacta. Reaproveita #1040/boot-progress, sem novo watchdog/timer.

## O que foi concretamente conectado

MainActivity instala host somente no WebView principal; listener exige HTTPS crewcheck.online, frame principal e origem atual. Port→autenticação HTTPS→capabilities→factory→controller/editor tem ligação existente restaurada. Identidade do payload/localStorage não concede autoridade; server/me valida antes de fornecer lease derivada da expiração verificada. Token não é salvo pelo host. Account+epoch, geração, journal e recibos correlacionados protegem edição, logout, importação, cancelamento incerto e resposta atrasada. Engine/driver/receiver/bridge e fixture reais foram recuperados.

PREPARED_HOST_ENABLED e PREPARED_OVERNIGHT_LEASE_ENABLED continuam false. A condição native physicalValidationApproved não é escrita por esta mudança. Factory sem port permanece indisponível e o editor continua cálculo, não programação. Nenhuma permissão nova, cron/infra, credencial, custo, notificação real ou publicação. Driver é notificação genérica, não despertador sonoro persistente. Autoridade retomável após processo morto/reboot continua uma questão de produto/contrato; não basta ligar flags.

## Validação nova

59 testes JS em UTC, America/Sao_Paulo, Asia/Tokyo; Java real:64 engine+21 sessão; bridge JSON24+admissão34 com Android15/API35 e WebKit1.14.0 oficiais pinados. Sem dispositivo, rede real de auth ou scheduler real. TypeScript e Vite passam; navegador real390/1280 usa fixtures, bloqueia rede externa e verifica zero writes. Java/recursos release reais compilam com Gradle8.13, SDK36 e Build Tools35; constantes OFF foram verificadas na classe compilada.

Correção do diagnóstico anterior: preparação canônica gera generateCrewCheckOfflineAssets copiando dist, e shouldInterceptRequest serve assets existentes antes da rede. Logo, APK PODE incorporar o editor web corrigido. /api/ permanece remoto e recursos ausentes podem recorrer à rede. Igualdade SHA256 do index dist e do asset gerado foi conferida; não se afirma autonomia de serviços Aiven/Render.

## Toolchain e acesso

Cache inicial ausente. Reutilizadas distribuições oficiais já autorizadas: Gradle8.13 SHA25620f1b1176237254a6fc204d8434196fa11a4cfb387567519c61556e8710aed78; platform-36_r02.zip SHA1 2c1a80dd4d9f7d0e6dd336ec603d9b5c55a6f576; build-tools_r35_linux.zip SHA1 2cfaa0bbb2336e9ec18ed3ecea84fa2e2af607bc. Sem sdkmanager --licenses ou gravação de aceite. AGP avisou que platform-tools não tem licença aceita e não foi instalado; compilação Java/recursos prosseguiu sem ele. Se essa instalação passar a ser exigida, é um gate separado: android-sdk-license para Android SDK Platform-Tools. Java21 local contém os módulos reais; launchers temporários javac/jlink/jmod/jimage usam esses módulos, sem stub ou download JDK alternativo. npm precisou de cache em /tmp porque ~/.npm não é gravável.

Download3828: helper suportado retornou genericamente download failed. DNS dos hosts externos apresentou EAI_AGAIN/Temporary failure in name resolution; downloads oficiais via proxy configurado funcionaram. Uma única repetição da MESMA rota Library falhou. Não foi obtido status HTTP: causa do download não foi conclusivamente classificada como HTTP403 ou somente DNS. Não há prova de negação da autorização Library, mas também não se presume acesso bem-sucedido. Nenhuma outra rota foi usada para recuperar esse ZIP; o Forbidden GitHub anterior continua intocado.

## Gates separados e próximo passo

Não gerar chave debug/substituta, não desinstalar/limpar dados, não instalar/publicar. Signing release segue obrigatório e ausente. Manifest preparado:com.crewcheck.app/144110/14.4.11, não prova versão/certificado do aparelho. Upload certificate da política não prova Play App Signing.

Para concluir composição: disponibilizar bytes/bundles exatos de3828 e predecessores; verificar hash e ancestralidade; aplicar este delta de alarme sobre essa branch mantendo Wake/fuso e resolver somente os conflitos de editor/preview/adapter. Repetir regressões integradas e build da composição. Home/materializer/financeiro/Pulse/MyCrewCare não pertencem a este commit. Dados fonte/pickup e fuso de exibição não podem ser reinterpretados pelo adapter. Assinatura compatível e teste físico específico continuam gates posteriores.
