# Proposta separada: cor e microinterações compartilhadas

Proposta para uma próxima PR; nenhuma mudança global de tema ou animação está incluída na #1204.

1. **Poucos tokens semânticos.** Mapear superfície, texto, texto secundário, borda, ação, foco, informação, sucesso, risco e pendência nos temas claro/escuro. Reutilizar a paleta existente: ciano/azul para ação e informação, verde para sucesso, vermelho para risco e neutro para desconhecido. Amarelo/âmbar continuam exclusivos das alterações de escala. Tokens não tornam dado pendente em confirmado.
2. **Piloto pequeno em primitivas.** Propor estados de repouso, hover quando houver ponteiro, pressionado, foco e disclosure em um botão e um card compartilhados. Conferir ownership real antes de editar: Radar #1198, footer #919, finanças #1200, segurança #1201 e CrewCierge #1203. Migrar uma superfície por PR após revisão; preservar handlers, navegação e preferências. Evitar seletores globais que redimensionam todos os spans e novos overrides em cascata.
3. **Movimento somente como resposta.** Transições de cor/opacidade de120–180ms e feedback de pressão de80–120ms, com transform mínimo apenas quando não deslocar conteúdo. Expandir detalhes sem animar altura. Feedback de atualização acontece uma vez por ação; sem pulsação, brilho, carrossel ou animação contínua. Sem timers por card, novas bibliotecas ou trabalho extra a cada frame. Preferir propriedades de composição e cancelar efeitos ao desmontar.

`prefers-reduced-motion: reduce` elimina deslocamentos, escalas e animações; estado final e feedback textual/foco aparecem imediatamente. Contraste mínimo de4,5:1 para texto e3:1 para controles/indicadores, incluindo foco e todos os estados. Cor nunca é o único sinal. Validar fonte100/200%, teclado, touch, temas e dispositivos modestos; medir frames, ausência de layout shift e estabilidade do scroll antes de ampliar o piloto.

Primeira decisão solicitada: aprovar a paleta e os estados do piloto em uma pequena matriz visual. Só depois abrir uma PR independente de tokens/primitivas e coordenar migrações com os owners. Sem merge/deploy ou refatoração global implícitos nesta proposta.
