# CrewCheck v14.3.88–v14.3.90 — padronização visual

## Objetivo

Criar um sistema visual único para todas as superfícies internas do CrewCheck. A experiência deve parecer parte do mesmo produto em Web, PWA e APK, preservando a verdade operacional compartilhada com Telegram.

## Princípios obrigatórios

1. **Usuário primeiro:** a próxima decisão do usuário vem antes de informação decorativa ou secundária.
2. **Cronologia primeiro:** Agora, Próximo compromisso e sequência operacional mantêm ordem temporal inequívoca.
3. **Segurança operacional:** alertas confirmados, limites regulamentares e mudanças relevantes aparecem no ponto de decisão.
4. **Uma verdade canônica:** a camada visual não recalcula, duplica nem corrige silenciosamente dados operacionais.
5. **Consistência responsiva:** o mesmo componente adapta densidade e disposição sem virar outra identidade em telas maiores.
6. **Movimento funcional:** animações explicam transição ou resposta; nunca deslocam controles, atrasam ações ou competem com alertas.

## Contrato visual

### Estrutura

- cabeçalho CrewCheck global fixo no topo de todo sistema interno;
- largura máxima e margens laterais definidas por um único container;
- grid de 4/8 px para espaçamento e alinhamento;
- navegação inferior reservada a layouts móveis; desktop usa navegação adequada ao espaço disponível;
- nenhuma barra fixa pode cobrir conteúdo, ação ou mensagem.

### Componentes

- uma família canônica para botões, cards, badges, campos, alertas, modais e estados vazios;
- variantes representam significado, não preferências isoladas de cada tela;
- ícone, título, descrição e ação mantêm alinhamento e hierarquia consistentes;
- hover pode alterar cor, borda, sombra ou elevação, mas não posição ou tamanho;
- mensagens de provedor, chave, stack trace ou falha técnica nunca são exibidas diretamente ao usuário.

### Tipografia e densidade

- escala tipográfica limitada e reutilizável;
- números operacionais podem ter destaque, mas não devem romper o grid;
- textos auxiliares permanecem legíveis sem excesso de caixa alta;
- desktop aproveita largura para organizar conteúdo, sem simplesmente ampliar a interface móvel.

### Movimento e acessibilidade

- transições entre 120 e 240 ms para estados comuns;
- nenhuma animação obrigatória para compreender o estado;
- `prefers-reduced-motion` desativa deslocamentos e reduz transições;
- foco visível, navegação por teclado, contraste e zoom fazem parte do aceite;
- estados não dependem apenas de cor.

## Ordem de migração

1. shell global, cabeçalho, containers, navegação e tokens;
2. FlyDeck, Próxima Programação e Linha do Dia;
3. Escala, Saída Inteligente, Alertas e Menu;
4. Radar, Meteorologia, Regulamentação e demais sistemas internos;
5. conta, configurações, integrações e estados administrativos.

## Gates automatizados

- TypeScript sem erros;
- build Web de produção;
- regressões do motor canônico e da escala ativa;
- contrato estático de tokens e componentes;
- screenshots dos fluxos críticos nas larguras 360, 390/412, tablet e desktop;
- temas claro e escuro;
- ausência de overflow, sobreposição e deslocamento em hover;
- redução de movimento validada.

## Critério de conclusão

O lote só termina quando todas as telas internas usam o shell e os componentes canônicos ou possuem exceção temporária documentada, com responsável e versão de remoção. Nenhuma validação manual será solicitada antes de uma build implantável e dos checks automatizados estáveis.
