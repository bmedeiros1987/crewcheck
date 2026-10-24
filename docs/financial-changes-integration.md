# Financeiro — Alterações: contrato de integração

Delta isolado sobre `34f12b88` (#1154). Não integrar na publicação urgente #1153/#1155. Não muda ledger, cálculos, fontes, notificações, permissões, migração ou Telegram. O título e a navegação são apenas **Alterações**.

## Fonte existente e limite financeiro

`FinancialChangesScreen` consome `currentPublicationReview` e `subscribePublicationReview`. A identidade é o `publicationOwner()` existente, não um email fornecido pelo componente. A projeção mantém `history[].id/version/before/after/seen`, `unknown` e diferenças não confirmadas. O filtro é o período financeiro selecionado; uma data movida pertence à consulta quando antes ou depois está no período. A primeira publicação é referência, nunca mudança. O componente não grava outra cópia do histórico. A leitura exata reutiliza `PublicationChangeDetail` e sua consulta pessoal já existente.

Essa fonte não contém valores financeiros, revisão financeira vinculada, competência de folha ou crédito por alteração. Portanto o impacto fica **Indisponível**, competência/crédito **Não comprovados**, nos detalhes. Não preencher com total mensal, diferença do planejado ou zero. O comparativo `compareRosters`/`financeSnapshot` existente usa outra referência; não associar automaticamente seu delta à publicação sem provar que são as mesmas versões.

O formatter opcional de `PublicationChangeDetail` atua somente na saída: a identificação de campos alterados continua nos valores originais. O padrão preserva a Escala. No Financeiro, ocultação cobre símbolos monetários/ISO3 e o campo opaco de hotel inteiro, inclusive valores sem moeda.

## Ownership

Financeiro: `FinancialChangesScreen`, `FinancialFreeDayComparison`, `FinancialScreen`, `FinancialHistoryExplorer`, `NextPaymentCard`, `useFinancialNavigation`, `SalaryCalculationStatus`, CSS e testes financeiros. O pequeno hunk compartilhado em `PublicationChangeDetail` adiciona apenas `formatValue` opcional.

Líder: `Home.tsx`, `AimsRosterTable.tsx`, Escala/Alertas, diferenças de horas e Estatísticas. Esses arquivos não foram editados por este delta. O acesso operacional **Publicada × realizada** deve permanecer.

## Hunk da Escala, a aplicar pelo líder

Na instância da Escala que hoje renderiza o histórico extenso, usar o `showHistory={false}` já existente. Preservar a mesma fonte e o histórico. O indicador discreto pode ser um link com ícone e nome acessível para:

```tsx
<a href="?view=perdiem&fmode=allowance&fscreen=changes" aria-label="Alterações">
  <GitCompareArrows aria-hidden="true"/>
</a>
```

Adicionar filtros de período apenas quando derivados da fonte selecionada. O destino usa o navegador financeiro existente, inclusive voltar/histórico; não criar outro router ou armazenamento.

## Hunk da comparação de folga, a aplicar pelo líder

`FreeDayPostponementAlerts` também possui efeitos de publicação/notificação. **Não montar esse componente em Financeiro nem duplicar seu efeito.** Preservar alertas acionáveis reais na superfície operacional. O líder deve separar somente a apresentação inconclusiva/comparação, reutilizando o mesmo `reviewFreeDayPostponements`, vínculo atual e sessão já calculados, sem outro avaliador.

O `FinancialHistoryExplorer` aceita `changesDetails`, consumido somente na tela Alterações:

```tsx
changesDetails={<FinancialFreeDayComparison key={session} session={session} review={review}>
  <FreeDaySourceConsent key={session} session={session} bound={boundCurrent}/>
</FinancialFreeDayComparison>}
```

O bloco recebe o `review` existente; não recebe totais mensais para tentar inferir impacto. `reasonCode === 'period_mismatch'` mostra somente **Selecione versões do mesmo mês** e **Selecionar**. Motivos, dados pendentes e explicações ficam recolhidos. Apenas `review.alerts.length > 0` usa marcador de alerta. Selecionar abre o controle existente; montar a apresentação não faz envios. O slot/produtor real ainda depende dessa integração de `Home` pelo líder; a fixture testa o contrato visual, não afirma migração concluída de Alertas.

## Validação e restrições

O teste `regression-financial-changes-browser.mjs` compila componentes reais e o navegador financeiro em localhost:320/390/1440, teclado/voltar, leitura exata sem fechar detalhes, mudança de conta, referência inicial, valores JPY ocultos e rótulos acessíveis. A comparação de folga usa review sintético fornecido ao componente puro. O teste não envia PDF nem acessa APIs externas. A suíte salarial atual passa a abrir os detalhes antes de verificar os motivos completos; não remove a cobertura de desconhecido/zero nem o importador existente.

A captura Library solicitada não pôde ser transferida neste executor. Não foi declarada visualizada. Capturas de validação são exclusivamente sintéticas. #1154 permanece sem publicação e com seu CI original separado; este delta não cancela/reinicia aquele job.

## Escopo futuro, sem implementação

Estatísticas em Escala/menu, gráfico mensal, curiosidades e novos indicadores foram apenas registrados para depois. Preservar Publicada × realizada e, futuramente, reutilizar suas fontes para diferenças de horas. Separar horas de voo, jornada/trabalho, tempo em solo e remuneração, com período, previsto/realizado e incompletude explícitos. Nenhum desses indicadores foi implementado neste delta.
