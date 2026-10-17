# Wake — cálculo/editor por pernoite, sem card ou programação

Base exata: `7c596b22f947107a1bdb4ca4fd5ceb80878d4665`, inset Android aprovado
estaticamente pela revisão independente segundo a coordenação. O HEAD desta
frente é registrado no manifesto do pacote; somente commit local, sem push/PR,
dispatch, merge/deploy ou publicação. A base Android/PWA e o inset são preservados.

## Ownership e arquivos reservados

Antes de editar: nenhum delta concorrente nos arquivos de cálculo/editor no
checkout principal. Histórico lido: editor de pernoite integrado na PR992;
regras de seleção/cancelamento em shared/stay-edit-plan e store version2 já
existentes. Clone isolado em /tmp/crewcheck-wake-review evita sobrescrever a
frente Android e os outros writers do workspace.

Esta frente reserva apenas:

- shared/stay-edit-plan.mjs e sua declaração .d.mts;
- shared/stay-editor-store.mjs;
- client/src/components/v1391/PresentationStayManagerView.tsx;
- client/src/components/v1391/StayHotelAlarmPreview.tsx;
- scripts/regression-stay-edit-plan.mjs,
  regression-stay-editor-persistence.mjs e regression-stay-editor-browser.mjs;
- este relatório de revisão.

client/src/lib/stayEditorStore.ts e stayEditorNavigation.ts foram lidos e
reutilizados sem alteração. Nenhum delta proposto em Home, scripts/stay-editor,
materializador do card, financeiro, Pulse, Android, providers, fila ou adapter
de alarme. A preparação canônica gera Home no clone apenas para build/QA;
esse resultado gerado não integra o commit/patch.

Home/card mantém owner `01a14131-659f-75b9-a79d-dda202cd301b`.
MyCrewCare mantém owner `01a129e4-f6fa-71e1-b271-e3e5ac9f9014` e seu contrato
informado de3771d5621a73d291aafda5987f40dca0cb92c4. Esse commit/documento não
está disponível localmente; não foi buscado por outra rota após Forbidden.
Não se duplicou seu consumidor/reconciliador nem se integrou SSO/fatos remotos.

## Comportamento

No editor existente, escolha explícita por pernoite: com café, sem café ou não
informado. A escolha descreve a intenção do usuário; não confirma que o hotel
oferece café. Não se deriva café de hora, duração, hotel, escala ou pickup.

Auto usa apresentação no hall do hotel confirmada manualmente, data e fuso
explícitos, menos 90 min com café ou 60 min sem café. Os dois padrões são editáveis
independentemente e salvos por conta neste aparelho. O cálculo continua no motor
existente, com DST, virada de data, conta/estadia e validade já protegidos.
Sem escolha com/sem café, Auto pede confirmação; não usa 90 silenciosamente.
Sem hall confirmado/fuso válido, não inventa horário. Decolagem/check-in/pickup
não são promovidos a referência do hall.

Relativo individual e horário exato prevalecem sobre os dois padrões. Mudar café,
padrão ou referência não sobrescreve horário exato salvo. Relativo mantém os
minutos escolhidos e recalcula pela referência confirmada. Troca de pernoite,
retorno e reload mantêm cada escolha somente no item/conta corretos. Cancelado
não é reativado. Prévia é **calculada; não programada** — salvar não agenda nada.

Persistência mantém versão2, adicionando defaultWithoutBreakfastMinutes e
breakfastPlan. O defaultLeadMinutes já existente é preservado, inclusive quando
personalizado. Campo novo ausente usa 60; escolha de café ausente/inválida fica
unknown. Migração não cria fato de café nem importa alarmes antigos.
Chamadores legados do cálculo que não fornecem breakfastPlan conservam sua
antecedência configurada; isso não é interpretado como prova de café. O editor
novo sempre passa a escolha explícita, inclusive unknown.

## Falha de isolamento encontrada e corrigida

Um teste antes da correção reproduziu clique no handler antigo no mesmo tick
de auth-changed: o listener já atualizava owner.current para B, mas o handler
ainda capturava padrões de A e podia salvá-los em B. Agora salvar padrão,
pernoite e cancelamento conferem token e conta capturados no render, além das
guardas existentes. Nenhum token é persistido por esta alteração. O teste executa
os três handlers antigos após A→B e exige ausência de qualquer registro novo B.

## Testes e evidência

- Baseline: 28 testes puros existentes passaram.
- Testes adicionados falharam antes da implementação: sem café ainda usava 90;
  default 60 e escolha desconhecida não estavam representados.
- 33 testes puros por execução passaram em UTC, America/Sao_Paulo e
  Pacific/Auckland. Incluem 90/60 editáveis, manual preservado, falta de hall,
  rejeição de pickup, três fusos de hotel e data anterior; os gates DST e
  cancelamento anteriores foram mantidos.
- Browser real Chromium: editor e navegação existentes, eventos/contas/API
  sintéticos, larguras 390/1280, claro/escuro, texto 150% e altura reduzida.
  Preservados controles de layout e controle negativo de rolagem. Passaram:
  seleção explícita desconhecida/com/sem, edição dos dois defaults, ida/volta,
  reload, troca de pernoite, atualização da referência após manual, cancelamento,
  troca de conta e handlers antigos no mesmo tick. Zero requests de escrita.
- TypeScript raw/preparado e build Vite passaram; build final 11,21s, aviso
  preexistente de chunks grandes. Uma primeira tentativa de browser iniciou
  antes de dist/index.html existir; a execução foi refeita após build concluído.
  Não se alterou runtime ou gate para superar essa falha de setup.

Logs, patch e manifesto registram o momento dos testes em relação ao commit.
Capturas do harness permanecem internas; não são prova física ou de dados reais.

## Limites e próxima coordenação

Sem alarme real, pedido de permissão, nova credencial, mensagem/chamada paga,
SSO ou leitura de produção. O card ainda não mostra este horário; sua pequena
integração futura pertence à coordenação com Home, reutilizando o cálculo/editor.
O adaptador nativo ainda não confirma replace/cancel por pernoite. APK assinado,
transporte push efetivo e cold/warm físico permanecem pendentes da frente Android.
Library e GitHub continuam com os bloqueios anteriores; não foram repetidos
uploads ou tentativas de acesso negado nesta etapa.
