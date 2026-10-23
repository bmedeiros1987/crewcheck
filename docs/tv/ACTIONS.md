# Builds de TV no GitHub Actions

Workflow: `.github/workflows/tv-packages.yml` — **TV demo packages and Android TV emulator**.
PR: [#702](https://github.com/bmedeiros1987/crewcheck/pull/702), dependente de #698 → #699 → #700.

## O que o workflow produz

| Plataforma | Artefato | Finalidade e limite |
|---|---|---|
| Android / Google TV | `CrewCheck-TV-Android-DEMO-debug` com APK e AAB debug | ID `online.crewcheck.tv.demo`, certificado debug. APK para testes; AAB debug não deve ser enviado ao Play. |
| Android TV emulado | `CrewCheck-TV-Android-emulator-evidence` | Relatório de instrumentação, lint, imagem e identificação do emulador. Não equivale a Google TV/TV física homologada. |
| LG webOS | IPK em `CrewCheck-TV-LG-IPK-Samsung-UNSIGNED-DEMO` | ID `online.crewcheck.tv.demo`; empacotado pelo CLI oficial 3.2.5, para Developer Mode. Precisa instalar e validar em TV real. |
| Samsung Tizen | WGT em `CrewCheck-TV-LG-IPK-Samsung-UNSIGNED-DEMO` | ID `CrewChkDm1.Player`; contêiner ZIP **sem assinatura**, sem validação do SDK Samsung. Não instala antes da assinatura apropriada. |

Todos usam dados fictícios, indicam demonstração e têm IDs separados do produto. Não pareiam contas reais nem habilitam backend. O pipeline não usa certificados existentes do app de celular e não faz publicação, release GitHub, migration ou deploy. Cada conjunto de pacotes inclui commit e SHA-256; retenção de 14 dias no Actions.

## Como executar e baixar

1. Abra [o PR #702](https://github.com/bmedeiros1987/crewcheck/pull/702) e a aba **Checks**. Alterações nos caminhos relevantes executam o workflow automaticamente.
2. Abra **TV demo packages and Android TV emulator** e espere os jobs terminarem. Leia a falha de cada job, não apenas a presença de um artefato: o APK é preservado mesmo quando a etapa posterior de emulador falha.
3. No resumo da execução, em **Artifacts**, baixe o pacote desejado e extraia o ZIP de transporte do GitHub. Confira `BUILD.txt` e `SHA256SUMS.txt`.
4. Depois que este workflow existir na branch padrão, também será possível usar **Actions → workflow → Run workflow**, escolhendo a branch. Enquanto estiver apenas no draft, use os checks do PR; não é necessário mesclar para testar.

## Instalação para teste

Android TV, com ADB conectado ao aparelho/emulador:

```sh
adb install -r CrewCheck-TV-DEMO-debug.apk
adb shell am start -n online.crewcheck.tv.demo/online.crewcheck.tv.TvActivity
```

A chave debug do runner é temporária: builds de execuções diferentes podem exigir remover a demonstração anterior antes da instalação. Não reutilizar essa identidade/chave como app de produção.

LG, com CLI oficial e Developer Mode configurados:

```sh
ares-install --device minhaTV online.crewcheck.tv.demo_0.1.0_all.ipk
ares-launch --device minhaTV online.crewcheck.tv.demo
```

Confirme o nome efetivo do IPK baixado. A sessão Developer Mode e o alcance da rede são requisitos de instalação; não são contas da loja.

Samsung: usar o SDK e Certificate Manager oficiais para criar/selecionar perfil Samsung com os DUIDs necessários. Empacotar/assinar os assets do mesmo commit com esse perfil conforme `STORES.md`; inspecionar assinaturas e testar a instalação. O WGT sem assinatura não é evidência de compatibilidade ou de certificação Samsung.

## Validação automatizada Android

JDK 17, Gradle 8.11.1, AGP 8.9.2, SDK alvo 35. A instrumentação abre o APK instalado em Android TV API 31, observa conteúdo no WebView, envia D-pad nativo para abrir Mês e Back para voltar a Agora. Depois captura a tela do app e os logs. O teste não substitui fluxo real de pairing, suspensão de hardware, comportamento de vários fabricantes ou qualidade de loja.

Não há chave de release na execução de PR. Para uma futura entrega de loja: gates #530/#607, backend/entitlement/providers homologados, IDs definitivos e certificados específicos, workflow de release separado com acesso restrito e testes físicos. O sucesso destes jobs não libera automaticamente produção.

Referências oficiais: [CLI LG e instalação](https://webostv.developer.lge.com/develop/tools/cli-installation), [comandos LG](https://webostv.developer.lge.com/develop/tools/cli-dev-guide), [CLI Samsung e assinatura](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/command-line-interface.html), [Android TV](https://developer.android.com/training/tv/get-started/create).
