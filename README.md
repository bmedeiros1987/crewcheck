# CrewCheck v11.0.95 — Escala contínua e menu completo

Correção focada no fluxo real de escala: o sistema mantém a continuidade visual entre meses, evita pular dias sem programação lida e exibe novamente os atalhos de relatórios/alertas no menu principal.

## Principais ajustes

- Escala agora cria dias neutros quando o PDF pula uma coluna/dia vazio, evitando buracos visuais.
- Filtro padrão da escala passa a ser **Da data atual em diante**.
- Dias do mês anterior só aparecem enquanto ainda forem hoje/futuros; depois somem automaticamente.
- Dias de continuação do mês seguinte continuam aparecendo quando fazem parte da escala carregada.
- Parser/normalizador preserva transição mês anterior → mês da escala → mês seguinte.
- Menu lateral ganhou grupo **Relatórios** com Relatórios, Alertas da escala, Rotina, Calendário e Chefe de Cabine.
- Menu flutuante rápido também mostra Relatórios, Alertas da escala e Calendário.
- Corrigida abertura direta por `?view=regulation`, `?view=chief`, `?view=admin` e módulos similares.
- Meteorologia não foi alterada nesta versão.
- Produção Android mantém R8/ProGuard, shrinkResources e mapping.txt.

## Android

- versionName: 11.0.95
- versionCode: 11095
