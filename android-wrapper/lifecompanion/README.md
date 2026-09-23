# CrewLife Companion Samsung

O Companion isola a integração de bem-estar do aplicativo operacional CrewCheck.

## Arquitetura

Samsung Health -> CrewLife Companion (`com.crewcheck.life`) -> provider local protegido por assinatura -> CrewCheck Mobile -> CrewWatch.

Nenhuma série bruta é exposta ao CrewCheck. O provider entrega somente um resumo local com:
- passos do dia;
- sono recente e pontuação do sono quando disponível;
- minutos de atividade, calorias ativas e distância;
- Samsung Energy Score quando disponível.

O código do CrewLife Companion não envia esse resumo aos servidores do CrewCheck.

## SDK Samsung

O repositório público não redistribui o binário da Samsung.

1. Baixe **Samsung Health Data SDK v1.1.0** no portal oficial.
2. No ZIP oficial, localize:
   `libs/samsung-health-data-api-1.1.0.aar`
3. Copie esse AAR diretamente para:
   `android-wrapper/lifecompanion/libs/`

Não é necessário renomear o arquivo. O Gradle aceita `samsung-health-data-api*.aar`,
detecta automaticamente a presença do SDK e define
`BuildConfig.SAMSUNG_HEALTH_SDK_INCLUDED=true`.

O módulo segue o setup oficial do SDK v1.1.0 com Gson e Parcelize. Como o AAR é copiado
localmente e não vem acompanhado de um POM Maven, os runtimes Kotlin e coroutines usados
pelo próprio binário da Samsung também são declarados explicitamente.

Para não criar uma segunda toolchain Android dentro do CrewCheck, o Companion usa os pins
canônicos já adotados pelo projeto:
- Kotlin / Parcelize: 2.0.21;
- kotlinx-coroutines-android: 1.9.0;
- Gson: 2.13.2.

Sem o AAR, a build de desenvolvimento continua funcionando em modo scaffold e informa
`sdk_missing`. A build de release do Companion falha de propósito sem o SDK.

## Teste no Galaxy


### Helper local

Para evitar copiar o AAR manualmente, use o helper. Se o ZIP estiver em Downloads ou Desktop, basta:

```bash
bash scripts/crewlife-samsung-local-test.sh
```

Se preferir, informe o ZIP explicitamente:

```bash
bash scripts/crewlife-samsung-local-test.sh "/caminho/para/samsung-health-data-sdk-1.1.0.zip"
```

Ele:
- localiza `libs/samsung-health-data-api-*.aar` dentro do ZIP oficial;
- extrai o AAR temporariamente para `android-wrapper/lifecompanion/libs/`;
- executa `:lifecompanion:assembleDebug`;
- mostra o caminho final do APK;
- remove o AAR ao terminar, salvo se `CREWLIFE_KEEP_AAR=1`.

Depois instale o APK mostrado pelo helper com:

```bash
adb install -r "/caminho/mostrado/para/lifecompanion-debug.apk"
```


O Samsung Health Data SDK v1.1.0 exige Android 10+ e Samsung Health 6.30.2 ou posterior.
O SDK não suporta emulador; o teste da integração deve ser feito em aparelho físico compatível.

Para desenvolvimento, a Samsung disponibiliza **Developer Mode (Data Read)**. Esse modo é
exclusivamente para desenvolvimento/teste e permite validar leitura antes do registro público
do package/certificado.

A leitura inicial pede somente:
- Steps;
- Sleep;
- Activity Summary;
- Energy Score.

Todos em modo de leitura.

As chamadas que aguardam o retorno das Futures do SDK são executadas fora da main thread.
Erros resolvíveis da plataforma Samsung Health (instalação, atualização, ativação ou
configuração) são encaminhados ao fluxo oficial de resolução do SDK.


## Uso normal depois da primeira autorização

Depois que o usuário autoriza o Samsung Health uma vez no CrewLife Companion, o Companion deixa de fazer parte do fluxo diário:

1. o Companion continua atualizando o resumo local pelo JobScheduler;
2. ao abrir ou retomar o CrewCheck, o app principal solicita um refresh ao Companion por broadcast protegido pela permissão `signature`;
3. o CrewCheck relê o provider local e atualiza a UI do CrewLife;
4. se o usuário já ativou **Mostrar CrewLife no relógio**, o Android publica o resumo diretamente no Data Layer, sem exigir que a tela CrewLife esteja aberta;
5. quando o relógio pede sincronização, o mesmo fluxo é repetido.

O refresh sob demanda usa `com.crewcheck.life.REFRESH_SUMMARY` e só pode ser enviado por app assinado com a mesma chave, porque o receiver exige `com.crewcheck.permission.LIFE_SUMMARY`.

O Samsung **Energy Score** permanece identificado como Energy Score no relógio; ele não é renomeado para um score de recuperação criado pelo CrewCheck.

## Distribuição

Antes de distribuir, solicite parceria Samsung Health Data SDK e registre:
- package: `com.crewcheck.life`;
- SHA-256 do certificado que assina a versão entregue aos usuários.

Se distribuir pelo Google Play com Play App Signing, use o **App signing certificate SHA-256**
do Play Console, não o upload certificate.

Se distribuir diretamente/Galaxy Store com a chave CrewCheck, extraia o SHA-256 do APK/AAB
assinado que será efetivamente entregue.

Sem o registro exigido pela Samsung, mantenha o Companion restrito ao fluxo de
desenvolvimento/teste.

## Privacidade e produto

- recurso opcional;
- consentimento específico do Samsung Health;
- somente resumos locais expostos ao CrewCheck;
- provider protegido por permissão `signature`;
- armazenamento local cifrado via Android Keystore;
- sem diagnóstico;
- sem avaliação de aptidão para voo;
- sem decisão operacional baseada em saúde;
- sem publicidade, scoring de crédito ou compartilhamento com corretores de dados.

Documentação oficial:
- https://developer.samsung.com/health/data/overview.html
- https://developer.samsung.com/health/data/process.html
- https://developer.samsung.com/health/data/guide/developer-mode.html
- https://developer.samsung.com/health/data/guide/features/data-permission.html
- https://developer.samsung.com/health/data/guide/features/data-types.html
- https://developer.samsung.com/health/data/guide/hello-sdk/app-module.html
