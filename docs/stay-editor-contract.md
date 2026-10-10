# Editor contextual de pernoites e despertador pela APZ do hotel

Base: main 6306923d9583ceb78e768bddb0334372af48c18b, após PR990/991.
MyCrewCare951 permanece desligada. Não houve merge, deploy ou permissão nova.

## Fluxo materializado

O finalizador `scripts/stay-editor/apply.mjs`, depois de wellhub-hours, altera
somente HotelsView: toque/teclado no card ou ação de edição abre
PresentationStayManagerView com ID explícito; retorno consome esse ID e foca
seu card. Se removido/duplicado, não escolhe outro item. Nenhuma alteração na
seção de academias, fórmulas, geração da escala ou horários publicados.
O gerador produz a integração em Home; mudanças geradas não são gravadas
integralmente no diff da PR.

## Persistência e migração

Dados locais versionados por ID autenticado da conta, neste aparelho:
padrão 90 minutos, hotel/quarto, APZ com data/fuso/procedência/confirmação,
modo Auto/relativo individual/absoluto e cancelamento da preferência.
Salvar padrão é independente de salvar o pernoite. Overrides são preservados.
A conta não é derivada do token nem gravamos credenciais. Logout/troca de conta
limpa a sessão do editor; somente o ID da conta ativa pode carregar/gravar seus dados.
Falha de armazenamento é apresentada, sem alegar sucesso.
Não há sincronização dessas novas preferências entre aparelhos ou com servidor.

Cadastro legado é apenas candidato quando a API autenticada retorna vínculo
único com evento ou data/local sem ambiguidade. Preservamos seu lead válido.
Seu horário tem origem antiga desconhecida e exige confirmação explícita como
APZ no hotel; não inferimos fuso/data nem adotamos cache offline sem conta.
Nenhum alarme legado é importado ou reativado. Alteração do intervalo da escala
preserva os ajustes e exige revisão/confirmacão de APZ; horário absoluto preserva
instante e fuso originais, sem ajuste silencioso.

## Origem e cálculo

APZ no hotel informada/confirmada manualmente, nunca APZ de escala, check-in,
decolagem ou pickup. Auto aplica padrão; relativo individual aplica antecedência
à APZ confirmada; absoluto guarda instante, data e fuso próprios. A prévia mostra
hora/data/fuso e diferença em tempo real (04:00 para APZ05:30 = 1h30 antes).
APZ desconhecida não inventa diferença; horário igual/posterior/passado é advertido.
Escolher outro hotel desconfirma a APZ, sem trocar seu valor automaticamente.

## Limite seguro de programação

`shared/stay-alarm-adapter.mjs` define substituição atômica e cancelamento
confirmado por identidade conta+evento. Mocks verificam atualização sem duplicação,
serialização com operação em andamento, cancelamento e falhas/ack inválido.
Não está ligado a nenhum canal real. O bridge atual scheduleNotification usa
requestCode baseado também no horário, não oferece replace/cancel por pernoite,
e o boolean não confirma execução. O timer web de aba não prova alarme de fundo.
Nenhuma permissão é solicitada/ampliada, nenhum alarme ou mensagem real é enviado.
Cancelar marca a preferência local; cancelamento de alarmes antigos do aparelho
não é alegado. Edição/importação não reativa preferência cancelada.

## Evidências e limites de QA

Contratos puros: identidade, seleção atual/remoção, revisão, isolamento de conta,
manual vazio, fonte pickup separada, APZ falsa bloqueada, modos, overrides,
virada de data/fusos/DST, diferença, conflitos, capacidade/permissão/idempotência.
Persistência: reload, contas distintas, padrão separado, legado sem confirmação,
registro corrupto, quota e tombstone de cancelamento. Adaptador somente mocks.

Browser extrai HotelsView, Brand e BottomNav reais da versão preparada, usa
PresentationStayManagerView real e CSS da build de produção. Eventos/conta/API
são sintéticos e escritas de rede interceptadas exigem zero. Exercita toque,
retorno contextual, edição, confirmação da origem, reload, cancelamento,
importação e remoção. Claro/escuro, fontes 100/150%, 390/1280px, viewport reduzida,
safe-area simulada, cabeçalhos/menu fixos e primeiro/último item acessíveis.
Controle negativo reproduz rolagem anterior do documento e deve falhar geometricamente.
Não equivale a aparelho físico, teclado nativo ou garantia absoluta de layout.

O JPEG privado Library não pôde ser materializado no executor anterior.
Não afirmamos comparação visual ou leitura dos pixels. Artefatos de CI são
exclusivamente sintéticos; a revisão Library contém texto, fontes e links.

Após reload dentro do editor, apenas um marcador de origem separado por conta
permanece na sessão. Nenhum pernoite é selecionado automaticamente; Voltar
retorna à lista atual. O ID em memória só restaura o retorno durante a mesma
navegação. O adaptador exige now finito; ausência, NaN e infinitos bloqueiam
programação antes de qualquer chamada nativa.
