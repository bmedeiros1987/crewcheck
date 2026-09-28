# CrewCheck v13.2.3 — Precisão CrewRosterReport

Correção após teste real com CrewRosterReport de julho/2026.

## Problema

O app importava o PDF, mas a próxima programação podia cair em voo antigo/deslocado, e a tela de escala ficava poluída com muitos eventos.

## Causa

Para CrewRosterReport em tabela, a leitura visual/transposta pode capturar colunas técnicas como `Updated Date` e deslocar voos. Isso aumenta artificialmente a quantidade de eventos e muda datas de voos.

## Correção

- Prioriza a leitura sequencial textual do CrewRosterReport quando ela encontra uma escala completa.
- Evita misturar a leitura transposta quando ela gera excesso de eventos.
- Reforça remoção de datas de atualização (`Updated Date`) do parser.
- Mantém rescue de voos a partir do texto completo.
- Preserva layout Premium/EFB e parser canônico AIMS.
