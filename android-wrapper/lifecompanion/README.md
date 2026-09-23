# CrewLife Companion Samsung

O Companion isola a integração de bem-estar do aplicativo operacional CrewCheck.

## Arquitetura

Samsung Health -> CrewLife Companion (`com.crewcheck.life`) -> provider local protegido por assinatura -> CrewCheck Mobile -> CrewWatch.

Nenhuma série bruta é exposta ao CrewCheck. O provider entrega somente um resumo local com:
- passos do dia;
- sono recente e sleep score quando disponível;
- minutos de atividade, calorias e distância;
- Samsung Energy Score quando disponível.

O Companion não envia estes dados ao servidor.

## SDK Samsung

O repositório público não redistribui o binário da Samsung.

1. Baixe **Samsung Health Data SDK v1.1.0** no portal oficial:
   https://developer.samsung.com/health/data/overview.html
2. Extraia `samsung-health-data-api.aar`.
3. Coloque o arquivo em:

`android-wrapper/lifecompanion/libs/samsung-health-data-api.aar`

O Gradle detecta automaticamente a presença do AAR e define
`BuildConfig.SAMSUNG_HEALTH_SDK_INCLUDED=true`.

Sem o arquivo, a build continua funcionando em modo scaffold e informa `sdk_missing`.

## Teste no Galaxy

Samsung Health Data SDK requer Samsung Health 6.30.2+ e Android 10+.
Para desenvolvimento, a Samsung permite **Developer Mode (Samsung Health Data SDK)**.
Esse modo é exclusivamente para desenvolvimento/teste.

A leitura inicial pede somente:
- Steps
- Sleep
- Activity Summary
- Energy Score

Todos com acesso de leitura.

## Distribuição

Antes de distribuir, solicite parceria Samsung Health Data SDK e registre:
- package: `com.crewcheck.life`
- SHA-256 do certificado que assina a versão entregue aos usuários.

Se distribuir pelo Google Play com Play App Signing, use o **App signing certificate SHA-256**
do Play Console, não o upload certificate.

Se distribuir diretamente/Galaxy Store com a chave CrewCheck, extraia o SHA-256 do APK/AAB
assinado que será efetivamente entregue.

Samsung exige o registro package + assinatura para uso público; sem isso o SDK funciona
apenas em Developer Mode.

## Privacidade e produto

- recurso opcional;
- consentimento específico do Samsung Health;
- somente resumos locais;
- sem diagnóstico;
- sem avaliação de aptidão para voo;
- sem decisão operacional baseada em saúde;
- sem publicidade, scoring de crédito ou compartilhamento com corretores de dados.

Documentação oficial:
- https://developer.samsung.com/health/data/process.html
- https://developer.samsung.com/health/data/guide/developer-mode.html
- https://developer.samsung.com/health/data/guide/features/data-permission.html
- https://developer.samsung.com/health/data/guide/features/data-types.html
