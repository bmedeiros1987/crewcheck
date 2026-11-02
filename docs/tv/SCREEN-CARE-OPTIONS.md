# Proteção de tela opcional — prévia 0.1.4

Pedido do usuário: permitir ativar ou desativar a proteção do CrewCheck. Em Configurações > Proteção de tela, o interruptor Ativada/Desativada guarda a preferência local por instalação. A ausência da preferência, valor inválido ou armazenamento indisponível usa o padrão ativado. Só o valor persistido `false` desativa. Não transfere preferência entre dispositivos/contas.

Ativada: mantém os perfis e pausas da 0.1.3. Desativada: sem pausa preta/relógio de proteção nem deslocamento preventivo global do CrewCheck, mesmo após longos períodos sem interação. Os ícones e animações normais não são modificados. Os seletores de prazo e teste ficam indisponíveis, mas o perfil anterior é preservado. Reativar inicia contagem nova, sem dormir imediatamente por inatividade anterior. Um aviso explica o risco de imagem fixa sem impedir a escolha.

O interruptor não modifica o protetor nativo, brilho, energia ou suspensão da LG. Não usa wake locks, vídeo invisível, comandos privados ou input artificial para manter tela acesa. Não promete prevenir ou reverter burn-in. A preferência Desativada não garante que a LG vá manter o painel aceso.

Testes: política para todos os perfis/movimentos, persistência/reabertura, longas inatividades, nova contagem e navegação a validar em pacote/navegador; nenhum teste de navegador mede retenção ou certifica a TV física. DRAFT / NO MERGE; nenhuma habilitação de conta real ou loja.

## Imagem do Render recebida

A captura do usuário mostra 'CrewCheck 2' em Linked Environment Groups, vinculado ao serviço principal 'crewcheck', com valores mascarados. Portanto é um grupo compartilhável e não um serviço chamado CrewCheck 2. O conector Render disponível atualiza variáveis por serviço, não por grupo. A tentativa TinyFish somente leitura não estava autenticada no Render. Nenhuma variável foi escrita, removida ou exposta.

Mudanças em grupo podem desencadear deploys nos serviços vinculados (https://render.com/docs/configure-environment-variables#modifying-a-group). Antes de adicionar qualquer liberação de TV ao grupo, verificar lista completa de serviços vinculados e escopo. Não adicionar enabled=true a um grupo vinculado à produção para contornar a restrição do piloto. A imagem não contém ID ou URL de edição do grupo. Pedir URL da própria página do grupo e a lista de serviços, sem valores; o vínculo real permanece não ativado.
