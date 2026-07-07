# CrewCheck v12.5.78 — UI Safe Functional Core

Correção de rumo: esta versão volta para o layout novo aprovado e **não** restaura o Home/Results antigo.

O que foi feito:
- Base visual: v12.5.76, layout novo premium.
- Núcleo funcional preservado/conectado sem trocar a interface.
- `/result` corrigido para abrir diretamente a escala completa no layout novo.
- Endpoint `/api/aviation-weather` restaurado para METAR/TAF via AviationWeather.gov.
- Datas reforçadas para DD/MM/YYYY, YYYY-MM-DD e DDMMM.
- Tema claro/escuro permanece no layout novo.
- Android versionName 12.5.78 / versionCode 125780.

Não usar a v12.5.77 como base visual: ela era apenas referência funcional e voltava o sistema antigo.
