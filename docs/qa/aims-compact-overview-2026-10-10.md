# CrewCheck AIMS — disposição e texto concisos

Pedido de Bruno em 10/10/2026 às 17:13 UTC, esclarecido às 17:14 e repriorizado às 17:46: o modo Documento existente é o único CrewCheck AIMS. A leitura rápida vem da hierarquia e do texto, sem usar quantidade de dias ou zoom como critério principal.

O resumo mantém código, APZ quando aplicável, intervalo publicado e aeroportos. Conexão/Solo é separado de APZ. Sem títulos de tipo repetidos, descrições longas ou botões “Ver detalhes” em cada card. Pernoite recebido na programação aparece como faixa curta de aeroporto e intervalo, mantendo o roxo aprovado; voos e folgas conservam a legenda atual. Colunas contínuas, divisórias finas e textos operacionais sem quebras arbitrárias. A coluna pode crescer para preservar um código longo; nada é truncado para fazê-la caber.

Tocar abre todas as atividades do dia, com foco exato por posição mesmo quando IDs se repetem. Voltar/Escape restaura o zoom e a rolagem horizontal/vertical da escala e da página. Quando o detalhe foi aberto a partir do filtro externo de dia, Voltar também retorna ao mês completo. Preferências v1 `document` normalizam para `aims` preservando período e isolamento por conta. Não há opção Documento paralela.

Controles de zoom existentes preservados, início a 100% sem escala artificial para espremer oito dias. Fonte ampliada aumenta rota e horários. Sufixos como (+1) continuam publicados intactos. O fuso informado é visível; quando ausente, permanece “não informado”. A área da escala tem rolagem nativa em ambos os eixos e altura limitada para não cobrir as barras.

## Escopo

Somente apresentação, preferências de formato e regressões de interface. Sem alteração de parser, jornadas, cálculos, valores financeiros ou dados da escala. Pernoites não são inferidos pelo renderer. PRs abertos foram consultados antes da implementação; nenhum equivalente encontrado. #975, Play, hotel e notificações fora do diff. Base main: `5fc76a09e568de215b7a0b6cec9a50c9fa139fa7`. Sem AGENTS.md ou skills em `.agents/skills` disponíveis neste checkout.

## Referências e limite de evidência

A referência inicial é `113584.jpg`, enviada às 17:13 UTC. Seu download inicial e uma tentativa limitada neste executor falharam; nenhuma tentativa posterior foi feita nessa referência.

As novas referências autorizadas do comparativo são `113584(1).jpg` e `113588.jpg`, enviadas às 17:37 UTC. Para cada uma, Library confirmou o nome e forneceu a preparação; materializador oficial atual, destino local privado, tentativa inicial e uma tentativa limitada falharam com `library file transfer failed: download failed`. Diagnóstico separado: `gaierror [Errno -3] Temporary failure in name resolution`. Falha técnica, sem negação de download. Não existe arquivo local legível, e este executor NÃO examinou os pixels.

Um revisor informou ter examinado as duas novas imagens: a primeira mostra CrewCheck, a segunda tem o rótulo Escala AIMS; marca Crewtopia não visível. Os ajustes seguem esses achados textuais e a prioridade explícita do usuário. Não se declara correspondência visual aprovada neste executor. Imagens de referência e pacote de revisão permanecem privados, sem links Library publicados no PR.

## QA sintético

- TypeScript raw/preparado, build Vite e contratos de preferências.
- Componente real e CSS de distribuição: 320/390/844/1440 × claro/escuro × fonte 16/32. Cores iguais à legenda; horários ampliados; nenhum overflow da página ou quebra arbitrária de código/horário; todos os eventos e último dia presentes.
- Fixture 02/10 com três voos completos na vertical. Fixture 03/10 com voo, pernoite curto e nova jornada no mesmo dia. Dados são sintéticos, com prefixo QA e sem identidade de usuário.
- Sequência explícita de leitura: `QA3280 / APZ 08:35 / 09:23–11:09 / BSB → VCP`; `QA3281` mantém Conexão/Solo separado de APZ; faixa `GRU · 08:58–21:53` preservada.
- Dia com três pernas e pernoite; três ciclos abrir/voltar preservando offsets e zoom; duplicidade de IDs, teclado/Escape e foco exato; filtro externo de dia retorna ao mês.
- Ajustar/100%, botões, pan de mouse, pinça e supressão de clique após arrastar; estado após rerender; meses 28/29/30/31, troca de mês, vazio, data desconhecida e conta.
- App compilado: 320/390 × claro/escuro × preferência 100/200. Canvas inteiro entre cabeçalho e rodapé, safe area, último dia de fevereiro bissexto, retorno exato e recuperação do menu.
- Ancestral artificialmente animado translateY(0→−20px), 120 ms, em 320/claro/fonte 200%, Ajustar e 100%. Após a animação: offsets/zoom iguais, foco no opener, botão inteiramente visível com 12 px de folga, cabeçalho imóvel.
- Renderer de detalhe e histórico: regressões responsivas, isolamento por conta; fluxo existente importação→confirmação→eventos canônicos→histórico. Sessão/storage: convidado, timers, abas, reset, conta e logout.

Screenshots e dados de QA são sintéticos; APIs externas interceptadas. Chromium emulado no cloud não substitui QA físico Android. Pacote privado acompanha HEAD, diff, relatórios, logs e snapshot de CI. Sem merge/deploy. Revisão independente do novo HEAD e gate visual continuam pendentes.
