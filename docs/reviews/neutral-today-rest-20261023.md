# Neutro no dia atual e rótulos curtos

Base main: `71f1878495293160079b2a0fad876365e7ec2fdd`. Branch nova: `fix/neutral-today-rest-label-20261023`. A referência Library foi materializada no próprio executor por ferramenta oficial, arquivo legível e pixels inspecionados. A foto real permanece privada e não integra o diff.

A imagem corresponde ao quadro AIMS, com cabeçalho do dia atual ciano claro e texto pouco legível. O main já tinha marcador `aria-current="date"`, cálculo civil UTC−03 e rechecagem por minuto/focus/pageshow/visibilitychange. Essa lógica foi reutilizada integralmente: nenhum ajuste de datas, fuso, agrupamento ou seleção.

O cabeçalho de hoje passa a cinza opaco em cada tema, com borda neutra e cor explícita herdada pelo time e pelo dia da semana. A regra é escopada ao AIMS e ao aria-current; dia selecionado/filtrado não ganha estado de hoje. Os tons antigos #a5f3fc foram removidos somente desse marcador. Contraste medido das cores opacas: 12,73:1 no escuro,13,36:1 no claro, incluindo os descendentes. Foco existente permanece preservado.

O helper de apresentação projeta as variantes conhecidas de “Descanso entre jornadas”, “Descanso base entre jornadas” e descanso na base para “Descanso”. Pernoite permanece “Pernoite”. Aplicação no quadro, seletor, nomes acessíveis, detalhes e título da lista. Códigos desconhecidos, voo e valores publicados permanecem intactos; dados de origem e detalhes publicados não são reescritos. Cálculos/classificação não usam esse helper.

## Ownership e revisão

Conferidos arquivos reais dos83PRs abertos. Nenhuma sobreposição nos seis arquivos funcionais/teste. #1200 financeiro, #1191 gate e #1203 CrewCierge continuam preservados. Não foram alterados Home/main.tsx, motores, preparação, workflows, dependências ou permissões. #969 toca calendário mensal e roster-layout.css; ambos fora deste patch. #1032 toca HomeRosterPreview/teste app; ambos preservados. Não há AGENTS/CODEOWNERS aplicável encontrado no checkout/ancestrais desta tarefa.

Revisão independente estática do commit funcional `1f661dcd3550934f423500cbc7a6dc1ebdf4e967`: sem bloqueadores; não reproduziu pixels/testes. Preparação canônica confirmou as âncoras preservadas. Os arquivos gerados pelo build foram removidos do diff.

## Testes

- `npm run check` e `npm run build`: PASS na fonte final congelada, incluindo preparação canônica. A primeira tentativa encontrou âncora de título movida; corrigido sem alterar scripts de preparação e toda a validação foi repetida.
- `regression-roster-display-date.mjs`: PASS, datas civis/instantes e independência de fuso do dispositivo.
- `regression-p0-roster-date-integrity.mjs`: PASS.
- `regression-p0-base-rest-vs-overnight.mjs`: PASS; oito pernoites e dois descansos permanecem classificados separadamente.
- `MENU_PLAYWRIGHT_PACKAGE=/path/to/playwright/package.json node scripts/regression-aims-document-browser.mjs`: PASS16combinações320/390/844/1440,claro/escuro,fonte100/200%; CSS de produção e componentes reais, rede externa bloqueada e dados sintéticos. Exercita UTC−03 na virada de dia, pageshow/visibility, seleção diferente de hoje, meses28/29/30/31dias, clocks(+1), detalhes, repetição de IDs, foco/Escape, teclado, zoom/pan/fit, estados vazios e troca de owner. Adicionadas verificações de cor/contraste dos descendentes, cinza/borda em200%, rótulo Descanso e Pernoite separado, mantendo horários. Sem erros de página ou APIs reais.

Evidências: [escuro100%](neutral-today-rest-20261023/neutral-today-390-dark-16.png), [claro200%](neutral-today-rest-20261023/neutral-today-320-light-32.png), [Descanso/Pernoite](neutral-today-rest-20261023/rest-label-light-200.png), [cores computadas](neutral-today-rest-20261023/metrics.json). Screenshots inspecionados. Não houve teste em aparelho físico.

Draft para revisão. Sem merge/deploy. CI do HEAD publicado deve ser acompanhado separadamente; não representa aprovação integral.
