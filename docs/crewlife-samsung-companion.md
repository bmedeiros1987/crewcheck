# CrewLife Companion Samsung

## Objetivo

O CrewLife Companion é um aplicativo Android separado, package `com.crewcheck.life`,
que lê automaticamente no Samsung Health apenas os resumos autorizados pelo usuário e
entrega esses valores localmente ao CrewCheck principal.

Fluxo:

`Samsung Health -> CrewLife Companion -> ContentProvider protegido por assinatura -> CrewCheck Mobile -> CrewWatch`

O CrewCheck principal continua sem Health Connect e sem permissões Android de saúde.

## Dados do MVP automático

Somente leitura:

- Steps
- Sleep
- Activity Summary
- Energy Score

O Companion não solicita no MVP:

- pressão arterial
- glicose
- SpO2
- ECG
- dados médicos
- séries brutas de frequência cardíaca
- localização/rotas

O Energy Score continua identificado como **Energy Score da Samsung**. O CrewCheck não
o renomeia como "aptidão", "fitness for duty" ou diagnóstico.

## Privacidade

O resumo local é criptografado com AES/GCM usando Android Keystore.

A comunicação com o CrewCheck usa um `ContentProvider` com a permissão:

`com.crewcheck.permission.LIFE_SUMMARY`

Essa permissão tem `protectionLevel="signature"`, então somente aplicativos assinados
com a mesma chave do Companion podem ler o resumo.

Nenhuma série temporal bruta é enviada ao CrewWatch.

## Baixar o SDK oficial

Baixe o Samsung Health Data SDK v1.1.0 na página oficial Samsung Developer.

Dentro do ZIP, use:

`libs/samsung-health-data-api-<versao>.aar`

Não commitar o AAR no repositório público.

O `.gitignore` em `android-wrapper/lifecompanion/libs` protege esse arquivo.

## Teste local rápido

No macOS/Linux:

```bash
bash scripts/crewlife-samsung-local-test.sh "$HOME/Downloads/samsung-health-data-sdk-1.1.0.zip"
```

O script:

1. extrai temporariamente o AAR;
2. gera `:lifecompanion:assembleDebug`;
3. informa o caminho do APK;
4. remove o AAR do repositório local ao terminar, salvo se `CREWLIFE_KEEP_AAR=1`.

Depois instale o APK no telefone Android.

## Developer Mode da Samsung

Para leitura de dados em desenvolvimento, use o Developer Mode do Samsung Health Data
SDK no telefone de teste.

Developer Mode é somente para desenvolvimento/teste e não deve ser apresentado como
fluxo de usuário final.

## GitHub Actions com o SDK real

Crie um secret de Actions:

`SAMSUNG_HEALTH_DATA_AAR_BASE64`

O valor deve ser o AAR oficial codificado em Base64.

O workflow `CrewLife Samsung companion`:

- sempre valida arquitetura, TypeScript e build debug;
- quando o secret existe, restaura temporariamente o AAR;
- gera APK e AAB release assinados;
- verifica a assinatura;
- apaga o AAR ao final.

O AAR nunca entra no git.

## Parceria Samsung para distribuição

Antes de distribuir o Companion aos usuários, enviar Partnership Request para Samsung
Health Data SDK.

Dados planejados:

- package: `com.crewcheck.life`
- finalidade: wellness/quality-of-life companion
- acesso: read-only
- tipos: Steps, Sleep, Activity Summary, Energy Score
- assinatura: usar o SHA-256 da chave oficial do CrewCheck Companion

Enquanto a parceria não estiver aprovada, o aplicativo deve ser tratado como piloto de
desenvolvimento.

## Separação de responsabilidade

CrewLife é assistente de bem-estar e rotina.

Ele não:

- determina aptidão para voo;
- libera ou bloqueia atividade operacional;
- substitui canal oficial de fadiga;
- faz diagnóstico;
- prescreve tratamento.

A escala canônica continua sendo responsabilidade do CrewCheck principal.
