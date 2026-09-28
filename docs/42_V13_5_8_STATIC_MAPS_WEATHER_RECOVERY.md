# CrewCheck v13.5.8 — Static Maps, Route Visual & Layover Weather Recovery

## Objetivo
Restaurar a sensação operacional do CrewCheck antes de novas mudanças visuais.

## Inclui
- Mapa estático do mês com marcadores das cidades/aeroportos da escala vigente.
- Linha visual de deslocamento no mapa do mês quando houver destinos.
- Saída Inteligente com representação estática da rota ponto A para ponto B.
- Previsão local nos cards de pernoite/hotel.
- Endpoint `/api/weather/airport` para previsão local por aeroporto.
- Preservação do radar multi-API e dos endpoints de mapas/academias.

## Variáveis recomendadas
- `VITE_GOOGLE_MAPS_API_KEY`: mapa estático e mapa embutido, restrito por domínio.
- `GOOGLE_MAPS_SERVER_KEY`: rotas/locais no backend.
- `FLIGHTAWARE_AEROAPI_KEY`: radar principal no backend.
- `CREWCHECK_RADAR_TIMEOUT_MS=2400`.

## Preservado
- Parser AIMS/CrewRoster.
- Motor canônico.
- Continuidade física/anti-teletransporte.
- Import Guardian.
- Sem credenciais, senha, MFA, cookies ou sessão.
