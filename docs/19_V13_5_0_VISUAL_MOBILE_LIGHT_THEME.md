# CrewCheck v13.5.0 — Auditoria Visual + Roster Mobile Polish + Tema Claro

## Objetivo
Corrigir overflow visual no mobile, melhorar o Roster e estabilizar o tema claro sem tocar no parser AIMS/CrewRoster, no motor canônico, na continuidade física ou na importação de PDF.

## Entregas
- CSS global anti-overflow com `box-sizing`, `max-width: 100%`, `min-width: 0`, `overflow-x: hidden`, `minmax(0, 1fr)` e espaço seguro para o bottom nav.
- Cards de voo com pills responsivas para Apresentação, METAR/TAF origem, METAR/TAF destino e alerta meteorológico até pouso.
- Roster mobile com KPIs tocáveis para Diárias e Salário, ações em português e linha visual de jornada.
- Tema claro com tokens próprios e contraste reforçado em cards, botões, chips, drawer e bottom nav.
- Toggles em estilo iOS 26 com gradiente CrewCheck no estado ON e vidro/cinza premium no OFF.

## Preservado
Import Guardian, Roster inline expansível, Gerenciador de Apresentação, Lounge Systems Restore, Monthly Map / Visual Routes, parser canônico e dados reais da escala permanecem preservados.
