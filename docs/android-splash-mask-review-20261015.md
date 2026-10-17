# P2 — preservar a arte no splash Android12+

Base exata: `2286c88ffed330246f1c39bed5ad7bb4d64e7851`.
O HEAD e a árvore do candidato local são registrados em `review-manifest.json`
no pacote Library; o commit é criado no clone isolado depois dos testes, sem
incluir materializações geradas. Não houve push/dispatch após o Forbidden anterior.

## Correção

O tema v31 agora referencia `crewcheck_splash_icon.xml`: InsetDrawable com27%
de cada lado e bitmap fill da arte canônica. PNG512×512 não é recortado,
redesenhado ou substituído. O fundo e overlay #1040 permanecem preservados.
MainActivity preparado tem o mesmo SHA256 do candidato anterior:
`a4ccb1b4e3f3176809c7e253c92d1bc0fa5c248b4db65b7023008fbc48941853`.
Nenhuma guarda, watchdog, permissão, assinatura, package ou regra de notificações mudou.

Referência oficial consultada15/10/2026:
https://developer.android.com/develop/ui/views/launch/splash-screen
Com fundo: quadro240dp/círculo160dp; sem fundo:288dp/192dp. Assim, a diagonal
de todo o quadrado precisa caber no círculo: `sqrt(2)*(1−2*inset) <= 2/3`.
O inset mínimo para os cantos é26,43%;27% deixa46% do quadro para a imagem.
16,67% reduz apenas a largura ao diâmetro e ainda recorta os cantos.

## Evidências executadas

- Regressão renderiza a referência geométrica antes/depois nas duas dimensões.
  PNG canônico byte-idêntico;158568 pixels pintados da fonte fora da área segura
  antes,44200 com inset insuficiente1/6 e **zero** com27%. É teste conservador
  do círculo seguro, não reprodução pixel-exata de toda máscara/OEM Android.
- A comparação foi inspecionada: asa e moldura completas após o inset; a arte
  fica menor, como consequência explícita de preservar o quadrado inteiro.
  PNG entregue é render técnico em Chromium; não é screenshot de aparelho.
- Preparação canônica em clone limpo, self-heal, approved-brand-assets,
  startup-lifecycle19casos, UI PWA e matriz de permissões PASS. TypeScript PASS;
  Vite16,63s PASS com aviso preexistente de chunks grandes.
- Gradle8.13/SDK36/BuildTools35: compileDebugJavaWithJavac,
  processDebugResources, compileReleaseJavaWithJavac e processReleaseResources
  PASS em25s,32tarefas executadas. Sem assinatura ou empacotamento de APK.
- AAPT2 compilou a referência inset→bitmap original. Teste do XML binário
  extraído do arquivo release confirmou fração real0.26999998092651367
  (26.999998%), geometria segura. Não é apenas regex de fonte.
- Guardas MainActivity e fonte PWA foram preservadas. Sem edição de
  Home/financeiro/Pulse, editor de pernoite ou implementações Wake/MyCrewCare.

## Limites e bloqueios

Não há emulador/system-image instalado nem `/dev/kvm`; nenhum dispositivo físico
foi conectado/instalado ou recebeu permissão. Cold/warm start nativo, máscara real
OEM e continuidade de transição permanecem não validados. O Android distingue
cold/warm do hot resume, em que o splash do sistema não aparece; testes de lifecycle
web não substituem esses cenários nativos. Não se declara atualização instalada.

Assinatura oficial não está disponível localmente; o gate de assembleRelease
anterior permanece válido e não foi removido. GitHub identidade retornou Forbidden
na etapa anterior; não se repetiu acesso negado nem se tentou outra rota.
Nenhuma credencial, assinatura debug substituta, publicação, envio real ou
permissão nova foi criada. Produção, transporte push e configurações permanecem
fora desta correção visual. A política120s de notificações continua intacta.

## Próxima prioridade Wake: ownership e menor delta, sem implementação

Coordenação informou owner MyCrewCare `01a129e4-f6fa-71e1-b271-e3e5ac9f9014`,
HEAD `de3771d5621a73d291aafda5987f40dca0cb92c4`, contrato
`docs/mycrewcare-concierge-wake-handoff-off.md`: hall−90min com café/−60sem,
manual preservado e origem/fuso/frescor/ausência explícitos. Esse commit/documento
não existe no clone local; este resumo é evidência fornecida pela coordenação,
não revisão do conteúdo integral. Nenhum fetch para contornar Forbidden.
SSO real e agendamento não foram entregues por esse contrato.

Mapa local lido: PR992 integra o editor contextual; `shared/stay-edit-plan.mjs`
faz cálculo puro por conta/estadia/APZ no hotel confirmada;
`PresentationStayManagerView`/`StayHotelAlarmPreview` já preservam Auto, relativo
e absoluto; `scripts/stay-editor/apply.mjs` é o dono do materializador do card
HotelsView em Home. `client/src/lib/stayEditorStore.ts` guarda a escolha local.
O adapter de alarme permanece desconectado, sem replace/cancel nativos confirmados.
Owner Home/financeiro permanece `01a14131-659f-75b9-a79d-dda202cd301b`.

Menor patch proposto para próxima frente, após obter/revisar o contrato exato:

1. MyCrewCare mantém a sugestão/reconciliação offline e a proveniência; não
   duplicar nem recalcular regras90/60 em Home. Mapear café confirmado como true,
   false ou desconhecido; desconhecido não significa sem café. Hall confirmado
   não pode ser inferido de pickup/APZ da escala/decolagem.
2. Um pequeno presenter compartilhado consome o resultado já reconciliado e
   a escolha atual do editor. Manual/absoluto salvo vence sugestão; estado cancelado
   não é reativado. Ausência de referência/fuso válido/frescor mostra indisponível,
   sem hora inventada. Preservar data, virada de dia e fuso no cálculo canônico.
3. Sob coordenação com o owner de Home, alterar somente o trecho HotelsView
   no materializador já existente: mostrar horário e procedência no card; toque
   e teclado abrem `openStayProgramEditor(event)` para o ID exato, usando o editor
   existente. Não editar toda Home materializada nem criar outro painel Wake.
4. Textos distinguem **sugestão**, **referência do hall confirmada**, **escolha
   salva** e **alarme programado com confirmação nativa**. O último estado não
   existe nesta integração e não pode aparecer por salvar/mostrar um horário.
5. Validar contrato/reconciliador do owner e presenter juntos com fixtures:
   café true/false/desconhecido, fonte/fuso/frescor ausentes, manual preservado,
   conta/estadia trocadas, cancelamento, virada de data/DST e retorno ao card.
   Somente depois coordenar delta do materializador e seus testes com Home.

Nada dessa proposta Wake foi implementado nesta frente P2.
