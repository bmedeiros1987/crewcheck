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


## P2 Codex: variantes reais da continuidade

Achado [discussion_r4357860858](https://github.com/bmedeiros1987/crewcheck/pull/1206#discussion_r4357860858) confirmado. O teste original usava somente a variante “entre jornadas”; não cobria os pairingCode reais gerados em dias civis ausentes. A preferência existente por pairingCode expunha “DESCANSO BASE”, “DESCANSO BASE 1/2” e “DESCANSO BASE 2/2”.

Vermelho antes da correção, com completeContinuityDays real: modelo retornou `DESCANSO BASE` em vez de `Descanso`; browser retornou nome acessível `Descanso: DESCANSO BASE, dia 2032-10-11. Abrir detalhes publicados` em vez do rótulo curto. Ambas as execuções terminaram exit1 no mesmo achado. Nenhum código desconhecido é convertido por fallback de type.

O helper agora reconhece somente as formas simples e i/n válidas de DESCANSO BASE e PERNOITE. Partes/total devem ser inteiros positivos seguros, total>1 e parte<=total. Formatos desconhecidos/inválidos preservados. Origem, classificação, horários e motores não mudam. A borda/cor de hoje não foi alterada nesta correção.

Verde: `regression-generated-rest-label-browser.mjs` usa oito intervalos gerados pelo normalizador real (mesmo dia, uma data ausente e duas datas ausentes; base BSB e pernoite GRU). Afirma labels, origem imutável, classificação REPOUSO/PERNOITE e preservação de desconhecidos. Render real cobre AIMS documento, seletor, nomes acessíveis e detalhes AimsRosterTable, nos dois temas e100/200%, mantendo início/fim. O entry point AIMS existente importa a nova regressão após encerrar sua suíte; nenhum workflow/gate alterado. Verificado esse entry point completo:16casos originais e4contextos novos PASS, sem erros de página.

TSC/build canônicos, roster-display-date, p0-roster-date-integrity, p0-base-rest-vs-overnight e p0-525-continuity-incremental repetidos: PASS. Revisão independente estática de871ae8e: sem bloqueadores; não reproduziu pixels/testes. Evidência [numerado claro200%](neutral-today-rest-20261023/numbered-rest-light-200.png), [escuro100%](neutral-today-rest-20261023/numbered-rest-dark-100.png), [casos gerados](neutral-today-rest-20261023/generated-rest-labels.json). Apenas fixtures sintéticas.

Base da PR preservada em71f18784; sem force, merge ou deploy. CI do novo HEAD deve concluir separadamente; o CI anterior não prova a correção deste P2.
