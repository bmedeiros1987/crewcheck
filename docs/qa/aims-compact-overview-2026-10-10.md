# Modo AIMS compacto — candidato para revisão

Pedido de Bruno em 10/10/2026 às 17:13 UTC, esclarecido às 17:14: o modo Documento existente é o Modo AIMS. Um único seletor AIMS agora usa aquela projeção, com cards compactos, mesma legenda e pernoites recebidos na programação. Preferências v1 `document` são normalizadas para `aims`, sem perder o período nem misturar contas. Não existe uma opção Documento paralela.

Tocar numa programação abre todas as atividades do dia, com foco exato por posição mesmo quando IDs se repetem. Voltar/Escape restaura o zoom, a rolagem horizontal e a posição da página. O mês inicia a 100% para leitura; Ajustar continua disponível para ver a extensão completa. Fonte ampliada também aumenta rota e horários. Sufixos publicados como (+1) são preservados no resumo e no detalhe.

## Escopo

Somente apresentação, preferências de formato e regressões de interface. Sem alterações em parser, jornada, cálculos, valores financeiros ou dados da escala. Pernoites não são inferidos pelo renderer. PRs abertos foram consultados antes da implementação; nenhum equivalente encontrado. #975, Play, hotel e notificações permanecem fora do diff. Base: main `5fc76a09`. Sem AGENTS.md ou skills em `.agents/skills` disponíveis neste checkout.

## Referência: bloqueio explícito

A Library confirmou `113584.jpg`, JPEG, 333583 bytes, enviado em 2026-10-10T17:13:24.200102Z; Library ID `libfile_13f7c402bf2c819185336fc1d4ff1941`. Foi usada a rota prepare_materialize e o materializador do skill Library atual neste executor. O download inicial e uma tentativa limitada local falharam. Diagnóstico local: resolução DNS do host indisponível. Nenhum arquivo legível foi obtido e os pixels NÃO foram vistos. O candidato segue os requisitos textuais; não está homologado como correspondência visual literal à referência.

## QA

- TypeScript raw/preparado, build Vite e contratos de preferências.
- Browser com componente real, CSS de distribuição e fixtures sintéticas: 320/390/844/1440 px × claro/escuro × fonte 16/32; mesmas cores da legenda, relógios ampliados, sem overflow da página, todos os eventos e último dia presentes.
- Dia com três pernas e pernoite; três ciclos abrir/voltar com posição e zoom preservados; duplicidade de IDs, teclado/Escape e foco exato.
- Zoom por botões, Ajustar/100%, pan de mouse, gesto de pinça e supressão de clique após arrastar; estado após rerender.
- Meses com 28/29/30/31 dias, troca de mês, filtro de dia, vazio, data desconhecida e troca de conta.
- App compilado completo: 8 casos mobile 320/390 × claro/escuro × preferência 100/200, cabeçalho e safe area, último dia de fevereiro bissexto, retorno exato e recuperação do menu.
- Renderer de detalhe: 20 casos responsivos; histórico isolado por conta. Fluxo existente de importação→confirmação→eventos canônicos→histórico passou.
- Sessão/preferências: convidado, timers, storage entre abas, reset, troca de conta e logout. Espera pelo estado real substitui atraso fixo frágil no teste.

Screenshots públicos usam somente fixtures sintéticas; APIs externas foram interceptadas. Chromium emulado no cloud não substitui QA físico Android. Relatórios JSON e screenshots acompanham o pacote Library, com HEAD/diff/estado de CI. Nenhum merge ou deploy executado. A referência visual indisponível e a revisão independente permanecem gates antes de integração.

## Cobertura de animação após revisão

O teste anterior de ancestral artificialmente animado verificava reposicionamento automático do opener. O contrato agora restaura exatamente os offsets e o zoom anteriores. O cenário translateY(0→−20px), 120 ms, foi restaurado no teste do app compilado em 320 px, tema claro, fonte 200%, tanto em Ajustar quanto em 100%. Depois da animação, verifica offsets/zoom iguais, foco no opener, botão inteiramente entre cabeçalho e rodapé com 12 px de folga, e cabeçalho imóvel. Somente teste/documentação mudam neste follow-up; código de produção permanece idêntico ao HEAD revisado 94332ab2491b11ff0bceb5b68abb42e259d345f6.
