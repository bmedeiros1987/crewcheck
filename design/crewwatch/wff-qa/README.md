# CrewWatch QA · Painel de Voo (mostrador WFF)

Mostrador de QA para Wear OS, no Watch Face Format v1. Ele reproduz a direção **Painel de Voo / O dia no pulso** de `design/crewwatch/crewwatch.html`. Os dados operacionais são fictícios (DEMO), e o mostrador não usa integrações, credenciais nem permissões.

- **ID do pacote:** `com.crewcheck.qa.crewwatch`. Coexiste com o app oficial (`com.crewcheck.app`) e com o mostrador oficial (`com.crewcheck.watch.app`).
- **Assinatura:** variante `debug`, assinada com a chave de debug local do Android SDK. Não é um build de loja.
- **Requisito:** Wear OS 4 ou superior (API 33), o mínimo do WFF. O Galaxy Watch 4 precisa estar atualizado para One UI 5 Watch (Wear OS 4) ou posterior.
- **Isolamento:** este projeto Gradle é isolado. Não entra em `android-wrapper/settings.gradle` nem nos workflows de produção.

## O que vem do protótipo
O gerador abre `crewwatch.html` no Chromium e chama a própria função `painel()` para cada estado. O resultado vira as camadas do mostrador.

| Camada | Origem | No relógio |
|---|---|---|
| Fundo do estado (arco, marcador, topo, faixa de 3 colunas, saúde, atalhos, DEMO) | `painel()` sem os dígitos e sem a linha de data | `PartImage`, uma por estado |
| Placas da hora (HH:MM) | recorte da mesma renderização, por posição e dígito | `Condition` sobre `[HOUR_0_23]` e `[MINUTE]` |
| Data "SEX 20 NOV · 13:09Z" | mesma tipografia do protótipo | `Condition` sobre `[DAY_OF_WEEK]`, `[DAY]`, `[MONTH]`, `[MINUTE]` e a hora UTC calculada de `[UTC_TIMESTAMP]` |
| AOD | arco a 40 %, hora e coluna 1, sem textura (cerca de 4 % de pixels acesos) | `Variant mode="AMBIENT"` |

**Estados** (Personalizar → "Fase (DEMO)"):
- **Automático:** o padrão. Passa por todos os estados, cerca de 4,6 s cada.
- **Fases do dia:** Despertar, Saída Inteligente, Deslocamento, Apresentação, Embarque, Em voo, Conexão, Fim de jornada e Repouso (tema lavanda).
- **Alertas:** Portão alterado, Atraso +25 min, Trânsito · Chega no limite e Trânsito · Vai atrasar.

**Toques:**
- Escala, Saída Inteligente e Alertas abrem o app CrewCheck no relógio (`com.crewcheck.app`).
- Despertador abre o alarme do sistema.

## Limitações deste QA
- **Dados fictícios:** faixa, topo, saúde e arco mostram os dados DEMO do protótipo. Só a hora e a data são reais. Ligar a faixa aos dados do CrewCheck exige slots de complicação alimentados pelo app Wear, fora deste teste.
- **Atalhos:** o WFF v1 só abre um app pelo componente (`Launch`), sem extras. O app Wear escolhe a tela pelo extra `crewcheck_screen` e não tem deep link por tela, então os atalhos abrem a tela inicial do app. Se o app não estiver instalado, o relógio sugere instalar pela Play.
- **Hora UTC:** vem da hora local mais o deslocamento em horas inteiras. Fusos com meia hora mostrariam os minutos locais.
- **Tipografia:** as fontes estão "congeladas" em imagens, renderizadas com a fonte do Chromium onde o gerador rodou (Inter). Por isso o mostrador fica igual em qualquer relógio. Na data, o dia da semana e o mês ocupam espaços fixos, enquanto o protótipo recentraliza a linha. A diferença é de até 1 px.

## Instalar no Galaxy Watch 4
1. No relógio, confira a versão: Configurações → Sobre o relógio → Software. Precisa ser One UI 5 Watch (Wear OS 4) ou superior.
2. Ative as opções do desenvolvedor: Configurações → Sobre o relógio → Software → toque 5 vezes em "Versão do software".
3. Em Configurações → Opções do desenvolvedor, ative **Depuração ADB** e **Depuração por Wi-Fi**. Relógio e computador devem estar na mesma rede Wi-Fi.
4. Em "Depuração por Wi-Fi" → "Parear novo dispositivo", anote o IP, a porta e o código de pareamento. No computador, com o Android platform-tools instalado:
   ```bash
   adb pair IP_DO_RELOGIO:PORTA_DE_PAREAMENTO
   ```
   ```bash
   adb connect IP_DO_RELOGIO:PORTA_DE_DEPURACAO
   ```
5. Instale o APK:
   ```bash
   adb install -r CrewWatch-QA-PainelDeVoo-debug.apk
   ```
   Se aparecer `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, é porque há uma cópia assinada com outra chave de debug. Remova-a e instale de novo:
   ```bash
   adb uninstall com.crewcheck.qa.crewwatch
   ```
6. No relógio, toque e segure o mostrador atual, deslize até o fim e toque em **+ Adicionar**. Escolha **CrewWatch QA · Painel de Voo**.
7. Para fixar um estado, toque e segure o mostrador → **Personalizar** → **Fase (DEMO)**.

Para remover: `adb uninstall com.crewcheck.qa.crewwatch`. O app e o mostrador oficiais não são afetados.

## Regenerar e compilar
Requisitos: Node com Playwright/Chromium, JDK 17 ou superior, Gradle 8.13 ou superior e Android SDK (platform 36, build-tools 35).
```bash
node design/crewwatch/wff-qa/tools/generate.cjs
```
```bash
ANDROID_HOME=/caminho/do/sdk gradle -p design/crewwatch/wff-qa assembleDebug
```
O APK sai em `design/crewwatch/wff-qa/build/outputs/apk/debug/`.

## Validação
O `watchface.xml` gerado foi validado contra as XSDs oficiais do WFF v1 (`google/watchface`, `third_party/wff/specification/documents/1`). A validação usou a mesma chamada do validador oficial: Xerces XSD 1.1 via `SchemaFactory("http://www.w3.org/XML/XMLSchema/v1.1")`. As versões 2, 3 e 4 também passaram.

Para repetir a validação, baixe do Maven Central as mesmas dependências do validador oficial:
- `org.exist-db.thirdparty.xerces:xercesImpl:2.12.0:xml-schema-1.1`
- `xml-apis:xml-apis:1.4.01`
- `org.eclipse.wst.xml.xpath2.processor:2.1.100`
- `java-cup:10k`

Depois rode:
```bash
javac -cp "lib/*" -d out design/crewwatch/wff-qa/tools/WffValidate.java
```
```bash
java -cp "out:lib/*" WffValidate <watchface>/third_party/wff/specification/documents 1 design/crewwatch/wff-qa/src/main/res/raw/watchface.xml
```
