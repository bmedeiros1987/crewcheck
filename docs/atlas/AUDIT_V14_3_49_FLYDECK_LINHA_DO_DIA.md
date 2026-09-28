# Auditoria Atlas — v14.3.49 FlyDeck / Linha do Dia

Data: 29/07/2026  
PR: #206  
Base: `main` v14.3.48  
Branch: `atlas/p1-flydeck-linha-do-dia`

## Escopo auditado

- integração da Linha do Dia no FlyDeck;
- classificação visual de programação, folga, repouso e pernoite;
- cronologia e densidade da informação;
- preparação canônica e idempotência estrutural;
- responsividade, tema escuro e transparência reduzida;
- acessibilidade estática;
- proteção do motor canônico, parser, financeiro e regulamentação;
- estado dos workflows do GitHub Actions.

## Resultado executivo

| Área | Resultado |
|---|---|
| Escopo do diff | Aprovado estaticamente |
| Motor canônico | Não alterado diretamente |
| Parser/CrewRosterReport | Não alterado diretamente |
| Financeiro/regulamentação | Não alterados diretamente |
| Folga x programação | Corrigido no componente |
| Repouso x folga | Corrigido no componente |
| Pernoite | Classificação endurecida |
| Saída Inteligente | Horário fictício removido da Linha do Dia |
| Cronologia passada | Proteção adicionada |
| Virada da meia-noite | Proteção inicial adicionada à apresentação |
| Acessibilidade estática | Melhorada |
| Responsividade/tema | Presente estruturalmente |
| TypeScript/build/testes reais | Pendente por execução |
| Teste visual Web/iPad/mobile | Pendente |
| Android assinado | Fora deste gate; obrigatório antes de release Android |

## Achados bloqueadores corrigidos durante a auditoria

### 1. Horário de saída inventado

A primeira versão calculava a saída como apresentação menos 90 minutos. Isso poderia divergir do cálculo real da Saída Inteligente, que considera rota, trânsito e margem configurada.

**Correção:** a Linha do Dia não calcula mais um horário paralelo. O card oficial da Saída Inteligente permanece como única fonte do horário de saída.

### 2. Evento encerrado usado como próxima programação

A seleção inicial podia escolher um evento terminado recentemente e recriar apresentação antiga.

**Correção:** a apresentação adicional só é criada para uma programação ainda ativa/futura e quando o horário é distinto do início da atividade.

### 3. Hotel transformando programação em pernoite

A presença de metadado `hotel` era suficiente para classificar qualquer evento como estadia.

**Correção:** pernoite depende agora de `kind === 'stay'` ou `canonical.kind === 'stay'`.

### 4. Repouso apresentado como folga

Todos os eventos de descanso recebiam o título “Folga”.

**Correção:** DO/DOF/DOP/DOPR/OFF/VC permanecem como Folga; DR/Descanso/Repouso aparecem como Repouso.

### 5. Apresentação na virada da meia-noite

Uma apresentação anterior à decolagem após meia-noite poderia ser posicionada no dia errado.

**Correção:** quando o horário da apresentação fica mais de três horas depois do início canônico, ele é ajustado para o dia anterior.

### 6. Ícones decorativos lidos como conteúdo

Ícones sem indicação semântica poderiam gerar ruído em leitores de tela.

**Correção:** ícones decorativos principais receberam `aria-hidden="true"`.

## Verificações aprovadas estaticamente

- o componente antigo “Copiloto cronológico” é removido;
- a Linha do Dia é renderizada depois do card da Saída Inteligente;
- a cronologia é limitada a sete marcos;
- placeholders são ignorados;
- programação, voo, pernoite, folga e repouso possuem tratamento próprio;
- a nova versão entra ao final da cadeia `scripts/v139/apply.mjs`;
- o patch não chama `update()` para os arquivos protegidos do parser, motor canônico, financeiro ou regulamentação;
- há estilos para mobile, modo escuro e preferência por transparência reduzida;
- o PR permanece pequeno, reversível e isolado da `main`.

## Limitações da auditoria atual

Os workflows foram criados, mas os jobs encerraram antes de qualquer etapa, sem `steps` e sem logs. Portanto, a falha atual não demonstra erro de TypeScript, build ou regressão, mas também não fornece aprovação técnica.

Antes do merge, executar obrigatoriamente:

1. `node scripts/v139/apply.mjs` em cópia limpa;
2. reaplicação para confirmar idempotência;
3. `tsc --noEmit`;
4. build Vite de produção;
5. regressão v14.3.49;
6. regressões v14.3.45–v14.3.48;
7. smoke test do servidor;
8. comparação FlyDeck, Escala e Histórico com a mesma escala oficial;
9. teste visual em 360 px, 412 px, iPad vertical/horizontal e desktop;
10. modo claro, escuro e transparência reduzida.

## Pendência arquitetural registrada

A formatação de data/hora continua dependente do modelo de `Date` já usado pelo motor canônico. A auditoria de fuso horário deve ser feita em um lote próprio, com fixtures de Brasília, virada da meia-noite e operação fora do Brasil. Não deve ser corrigida isoladamente apenas neste componente.

## Decisão de merge

**NÃO MESCLAR AINDA.**

O diff está estruturalmente mais seguro após as correções da auditoria, mas precisa dos gates executáveis e da validação visual quando o Work/Codex ou a infraestrutura de CI estiverem disponíveis.
