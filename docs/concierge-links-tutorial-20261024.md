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

O browser pessoal permanece reservado ao teste WhatsApp e não foi usado. Após autorização específica, Chromium headless isolado testou o App completo construído: Menu → Concierge, tutorial, 320/390px, claro/escuro, preferência real de texto a 200% (fonte 28px sobre raiz14px), rolagem acima da barra fixa e Enter expandindo/focando a mesma seção canônica. Zero desafios e leituras de status automáticas; nenhum erro de página. Contraste do botão acima de12:1 e outline de3px. Capturas foram inspecionadas. Não certifica aparelho físico ou Safari/iOS. O harness regression-concierge-links-tutorial-browser.cjs gera relatório/capturas locais reproduzíveis; revisão independente final continua necessária. A instalação adicional de Playwright na CI foi recusada pelo controle por possível uso/custo extra e foi removida; nenhuma alternativa de instalação foi executada.

CI deste incremento mantém raw/prepared, TypeScript e Vite. A validação visual usa somente o browser headless isolado já existente no ambiente local, com conta fictícia; não adiciona dependência à aplicação/CI, não usa Chrome pessoal nem serviços reais. O pipeline completo de assets OCR tem validação separada; localmente pode usar exclusivamente modelos já existentes verificados pelo manifesto, sem baixar dados. Sem ativação, ambiente, credenciais, permissões, custos, envio, merge de PR ou deploy.

A CI herdada semântica exigia o literal Compreensão/Natural; a expectativa agora aceita também a descrição conservadora, sem remover seus casos funcionais. Executar essa suíte isoladamente após o pipeline moderno completo também revelou falha de idempotência na main d7c43258 sem alterações: reaplicar só v14408/v14411 remove hooks modernos de pernoite/POI/radar. Não corrigimos nem alteramos servidor/preparadores desses hooks nesta UX. Essa suíte permanece na ordem original do workflow Web; não foi adicionada à nova CI pós-build, onde a reprodução da main demonstrou contexto incompatível. A validação do workflow herdado exato é necessária.
