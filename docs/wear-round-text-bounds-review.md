# Wear round text bounds — 2026-10-14

Bruno confirmou que o relato é do relógio físico (Galaxy Watch 4). A captura
115199.png foi reconhecida pela Library, mas as duas transferências autorizadas
falharam (`library file transfer failed: download failed`). Nenhum pixel foi
inspecionado. Esta correção trata defeitos reproduzíveis do app Wear; não atribui
o relato original a uma tela específica nem confirma defeito do watch face.

## Diagnóstico e mudança

- A margem anterior de 10% horizontal/12% superior não contém um retângulo no
  círculo. Em 390 px, o canto (39, 47) fica a aproximadamente 215 px do centro,
  acima do raio de 195 px. O padding no conteúdo rolável também não protege
  linhas que passam pelo topo durante a rolagem.
- O viewport agora usa um quadrado inscrito no círculo, com folga de um pixel,
  calculado pela dimensão real da janela. O padding e o clipping ficam na
  ScrollView; telas retangulares mantêm suas margens proporcionais anteriores.
- Cabeçalho, horários de escala e badge deixam de impor altura fixa ao texto.
  Textos operacionais podem quebrar e crescer com a rolagem, sem corte por um
  número fixo de linhas. Font padding protege acentos e descendentes.
- Botões de navegação dividem a largura disponível; cartões, métricas e ações
  usam uma coluna quando a área útil é menor que 150 dp ou fontScale > 1.2.
  Cores, contraste, tipografia em SP e algarismos tabulares são preservados.
- O modo ambiente compacto prioriza horário e valor operacional, sem depender
  de rolagem. O horário adapta de 24 a 38 SP, em uma linha; o valor usa duas
  linhas com reticências. O orçamento vertical real remove detalhes opcionais
  e, se necessário, limita o valor a uma linha. A tela ativa mantém o texto
  completo disponível.

## Testes e revisão local

`gradle -p android-wrapper :wear:testDebugUnitTest :wear:lintDebug`

- 54 testes JUnit: 46 existentes, quatro de geometria/política responsiva e quatro
  de layout Android com Robolectric 4.14.1/API 35 e gráficos nativos.
- TextViews reais medidos em telas redondas 192/227 dp, fontes 1.0/1.2/1.3/1.5/2.0 no ambiente (1.0/1.3/1.5 nas telas ativas),
  textos sintéticos longos em estados operacionais, escala, botões e ambiente.
  Verificações: limites horizontais, altura suficiente, quebra, acesso ao texto
  completo por rolagem, conversão SP do Android e ambiente sem rolagem.
- Geometria cobre dimensões de 160 a 450 px, incluindo 390/450 px, janela não
  quadrada e tela retangular.
- Controle negativo: os três testes de layout falham com o MainActivity da base,
  por espaço vertical insuficiente; o candidato passa.
- Lint Debug sem erros; contratos existentes
  `regression-crewwatch-premium-consolidated.mjs` e
  `regression-watchface-premium-layout.mjs` passam; `git diff --check` passa.
- Revisão do diff: somente módulo Wear, seus testes e este documento. Nenhum
  provider/fonte de portão, sincronização, parser, consentimento, web ou versão
  de publicação foi alterado. Os arquivos de #1041/#1042/#1043 foram conferidos
  via GitHub e não se sobrepõem. #1042 foi integrada durante a investigação;
  os módulos Wear/watch face permanecem idênticos na main atualizada.

## Revisão independente e contraprova adicional

Um revisor independente confirmou corte de 9 px no ambiente em 227 dp/font1.2,
com CHANGED/headline longo e portão curto B123, no HEAD inicial dd8e381f. A
contraprova externa falhou antes e passou depois da correção: a altura medida
agora governa a conservação de eyebrow/gate; o limiar horizontal sozinho não
basta. O cenário integra os testes permanentes, ampliados até fontScale2.0.
Não foi encontrada outra regressão comprovada na revisão independente.

O CI completo do HEAD inicial dd8e381f terminou com 10 workflows: nove SUCCESS
e um SKIPPED condicional (Manus). O checkout efetivo foi o merge sintético
8d56bde3a9d6059a6f70e1ed8a433a8dc66c034d, árvore idêntica à do HEAD
3b4b78cc3c47e9f108d7adde2db23a02efc37340. Esta matriz pertence ao HEAD inicial;
o follow-up recebe nova execução e não herda a afirmação de CI aprovado.

## Limites e aceite pendente

O runtime local usa SDK 36/build-tools 35.0.0, Gradle 8.13 e Java 21. A execução
exigiu configuração local de proxy, truststore e cache gravável, fora do repo.
Robolectric isola `AmbientModeSupport.attach`, dependente do runtime Wear do
dispositivo; mede a apresentação ambiente, sem testar seu ciclo de vida físico.

Não houve emulador Wear completo, hardware Galaxy Watch 4, instalação física,
teste de moldura/gestos/TalkBack ou rasterização WFF. Os testes do watch face
existentes verificam contratos estáticos; não comprovam legibilidade física ou
ausência de corte no mostrador. A revisão independente também é sintética.

Para relacionar a correção ao relato original, a menor informação restante é:
o texto excede dentro do app CrewCheck (Agora/Alertas/CrewLife/Escala) ou no
mostrador CrewCheck Flight Deck? A captura continua indisponível.

PR deve permanecer draft. Não houve merge, deploy, dispatch de publicação,
loja, instalação em relógio ou alteração de fontes de portão.
