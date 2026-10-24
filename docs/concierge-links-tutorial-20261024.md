# Concierge: acesso aos vínculos e tutorial

Base main d7c43258c30320c40704d5ad72feccef8423df9b, após #1226. PRs/ownership auditados antes das edições; responsáveis WhatsApp 01a167fa-c124-72a0-943e-dee55c8c601b e Notificações 01a16917-e982-74aa-a565-5f9d39dbb008 confirmaram ausência de edição/reserva em Home, tour e navegação. #1203/#1207/#1208 continuam em seus HEADs; nenhuma sincronização da base bloqueada foi tentada. Nenhuma alteração em handlers, estado, consentimento, briefing, scheduler, financeiro, SW ou canais.

## Caminho disponível

Menu → Concierge → WhatsApp e Telegram → Abrir vínculos de WhatsApp e Telegram. O atalho usa a mesma central canônica de Notificações, expandindo e focando Vínculos de canais. Não cria código, consulta status, envia mensagem ou grava preferência sozinho. O usuário mantém as ações explícitas já publicadas. Se houver vínculo, deve conferir o status em vez de gerar outro código. Vínculo não confirma entrega nem ativa avisos.

`openNotificationSettings('phone')` apontava ao número telefônico, não aos vínculos. O novo destino allowlisted `channels` usa o details.cc-notification-channels já gerado por bids-default/wakeup-layout.mjs. O destino phone e view=notifications continuam compatíveis; a intenção de foco só é consumida depois da montagem. Não há outra store de canal ou consentimento.

## Tutorial

O efeito anterior recolocava a tela do passo atual após toda navegação manual; com tutorial aberto, Notificações voltava ao Cockpit. O tutorial agora navega somente por ação explícita (Próximo/Voltar/Ver etapa). O botão de vínculos fecha o tutorial antes de abrir o Concierge. As chaves existentes de dispensa/reinício são preservadas.

Removidas do roteiro as promessas de alertas automáticos, corte fixo de jornada, acompanhamento meteorológico e Life. O roteiro curto aponta a importação/revisão da escala, Concierge/vínculos e manual, sem prometer IA, chamadas, restauração ou entrega. É possível continuar explorando o app enquanto o tutorial está aberto.

## Evidência e limites

Regressão Node executa a ação real do card e o helper canônico, expansão/foco/consumo tardio, phone legado, efeitos reais pré-JSX do tour em três destinos, navegação explícita, renderização React estática, marcação semântica e contratos CSS. Zero rede e gravações nos cenários não explícitos. A versão antiga do tour reproduz RED: navegação indesejada ao Cockpit; nova versão passa. Isso não é certificação visual ou teste completo de React em navegador.

Browser pessoal e headless não foram usados: reservado ao teste WhatsApp. Revisão visual real em 320/390px, texto ampliado, temas e teclado continua gate pendente antes de publicação. CSS usa quebra de texto, botão de largura total/48px, foco visível, tutorial rolável e navegação que pode quebrar linha; esses contratos são testados estaticamente, sem alegar medição de pixels.

CI deste incremento testa raw/prepared, TypeScript e Vite sem browser. O pipeline completo de assets OCR tem validação separada; localmente pode usar exclusivamente modelos já existentes verificados pelo manifesto, sem baixar dados. Sem ativação, ambiente, credenciais, permissões, custos, envio, merge de PR ou deploy.
