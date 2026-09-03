# CrewCheck iOS — fundação para TestFlight

Fontes nativas versionadas do target iOS, espelhando o papel de `android-wrapper/`.

O projeto Xcode em si **não** é versionado: ele é gerado por `npx cap add ios`, que
exige macOS + Xcode + CocoaPods. Este diretório é a fonte de verdade do que precisa
ser incorporado ao projeto gerado.

## Arquitetura

O app iOS é um shell Capacitor sobre o **mesmo bundle web de produção**. Nenhuma
regra de negócio é reimplementada em Swift.

```
PDF no Files/Mail  ──▶  Share Extension  ──▶  App Group (caixa de entrada)
                                                     │
                          abre crewcheck://import ───┘
                                                     ▼
                        App  ──▶  CrewCheckNativeBridge  ──▶  WKWebView
                                                                  │
                                    window.__crewcheckIosBridge.receiveSharedPdf
                                                                  │
                                     evento 'crewcheck:native-pdf' (JÁ EXISTENTE)
                                                                  │
                                          handleFile() ──▶ parser AIMS atual
```

Dois contratos são **reutilizados**, não criados:

| contrato | quem já usa | onde |
|---|---|---|
| `crewcheck:native-pdf` + `window.__crewcheckPendingNativePdf` | Android e PWA | `scripts/v14368/apply.mjs`, `client/src/lib/pwaSharedPdfRuntime.ts` |
| `window.CrewCheckNative` | todo o web | `client/src/lib/crewcheckPremiumRuntime.ts` |

O lado web do adaptador é `client/src/lib/iosNativeRuntime.ts`. Ele se instala
sozinho quando detecta o handler `crewcheckIos` e **nunca** sobrescreve uma fachada
já presente.

### Por que a extensão não fala com a WebView

Share Extension e app são processos separados. A extensão grava o PDF no container
do App Group e o app drena essa caixa ao abrir ou voltar ao primeiro plano.

O item só é removido quando a camada web confirma o consumo (`acknowledgeSharedPdf`).
É isso que impede publicação duplicada se o app for morto no meio da importação:
sem confirmação o item continua lá; com confirmação, some. O dedupe *dentro* da
sessão continua sendo do Home, por `shareId`.

## Arquivos

| arquivo | papel |
|---|---|
| `App/CrewCheckNativeBridge.swift` | `WKScriptMessageHandler` do canal `crewcheckIos`; entrega PDF e deep link à WebView |
| `App/CrewCheckSharedInbox.swift` | caixa de entrada no App Group; sanitização de nome, validação `%PDF-`, limite de 20 MB |
| `App/CrewCheckPermissions.swift` | notificações e localização; devolve sempre o resultado real do sistema |
| `App/CrewCheckPushAdapter.swift` | registro APNs + entrega de device token. **Adaptador, não funcionalidade** |
| `App/CrewCheckCalendarAdapter.swift` | somente sondagem de capacidade do EventKit; não cria nem lê eventos |
| `App/Info.plist.additions.plist` | chaves a mesclar no `Info.plist` gerado, com a justificativa de cada permissão |
| `App/CrewCheck.entitlements` | App Group + `aps-environment` |
| `ShareExtension/ShareViewController.swift` | recebe o PDF e deposita na caixa de entrada |
| `ShareExtension/Info.plist` | aceita **exatamente um PDF**; nada de imagem, URL ou texto |
| `ShareExtension/CrewCheckShare.entitlements` | o **mesmo** App Group do app |

## Permissões pedidas, e por quê

| permissão | motivo | observação |
|---|---|---|
| Localização **em uso** | Planejador de Saída e locais próximos | `Always` **não** é pedido: nada no produto exige localização em background |
| Notificações | despertador e alertas de escala | pedida em runtime; o registro em APNs só ocorre **depois** da concessão |
| Calendário — **somente escrita** | publicar a escala no calendário do iPhone | o app não lê os outros compromissos do usuário |
| Face ID | desbloqueio opcional do app | opcional por desenho; recusar não bloqueia o uso |

`UIBackgroundModes` contém apenas `remote-notification`. Sem `fetch` e sem
`location`: esta fundação não executa trabalho operacional em background.

Negar qualquer permissão mantém o app plenamente utilizável — `crewcheckPremiumRuntime`
cai no caminho web quando a ponte responde `false`.

## Gerar e rodar (macOS)

```bash
npm ci
npm run ios:add        # build + npx cap add ios + sync   (só na primeira vez)
npm run ios:prepare    # build + npx cap sync ios          (a cada mudança no web)
npm run ios:open       # abre o workspace no Xcode
npm run ios:doctor     # diagnóstico do ambiente Capacitor
```

Depois de `ios:add`, no Xcode:

1. **App target** — adicione os `.swift` de `ios-wrapper/App/`; mescle
   `Info.plist.additions.plist` no `Info.plist`; use `CrewCheck.entitlements`.
2. **Novo target** *Share Extension* chamado `CrewCheckShare` — adicione
   `ShareViewController.swift`, substitua o `Info.plist` pelo daqui e use
   `CrewCheckShare.entitlements`. Adicione **também** `CrewCheckSharedInbox.swift`
   ao target da extensão: os dois processos compartilham essa fonte.
3. **Signing & Capabilities** nos dois targets: mesmo App Group
   `group.com.crewcheck.app`. No app, adicione *Push Notifications*.
4. Para release/TestFlight, troque `aps-environment` para `production`.

### Verificação rápida no dispositivo

- abrir um PDF no Files → Compartilhar → CrewCheck → a importação existente abre;
- `xcrun simctl openurl booted "crewcheck://import"` → app abre em Importar;
- `crewcheck://admin` → **nada acontece**, por desenho (fora da allowlist).

## Fronteira com o #530

Esta frente **não** toca parser AIMS, `canonicalRoster`, APZ, segmentação de
jornadas, limites regulatórios, financeiro, fixtures ou oracles. A regressão
`scripts/regression-p0-ios-shell-foundation.mjs` trava essa fronteira: ela reprova
se o runtime iOS passar a importar ou referenciar qualquer um desses módulos.

## Limites conhecidos

- O projeto Xcode não é gerado aqui: `npx cap add ios` exige macOS. Os testes deste
  repositório cobrem o adaptador web e as invariantes estáticas das fontes nativas
  (paridade de contrato, App Group, permissões mínimas, ausência de segredo).
  **Compilação Swift e execução em dispositivo ainda não foram exercitadas.**
- Biometria está declarada (`NSFaceIDUsageDescription`) mas o gate de desbloqueio
  ainda não está implementado: entra quando houver decisão de produto sobre onde
  ele aparece na navegação.
- O endpoint de registro de device (`POST /api/platform/devices`) é o alvo assumido
  pelo adaptador de push; ele precisa existir no backend antes de o push funcionar
  de ponta a ponta.
