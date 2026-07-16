# CrewCheck v13.9.3 — REDEMET e alertas meteorológicos

## Entrega

- Consulta manual por IATA/ICAO na tela Meteorologia.
- Exibição de METAR/SPECI e TAF em formato bruto, decodificado ou ambos.
- REDEMET/DECEA como fonte preferencial de METAR/SPECI brasileiro quando a credencial está configurada.
- AviationWeather.gov como contingência e como fonte de TAF.
- Telegram com `/metar SBBR raw`, `/metar SBBR decodificado`, `/taf` e botões de formato.
- Monitor crítico vinculado a origem/partida e destino/chegada da escala sincronizada.

## Render

Configure sem expor os valores no cliente:

```bash
REDEMET_API_KEY=
CREWCHECK_SCHEDULER_SECRET=
CREWCHECK_WEATHER_MONITOR_ENABLED=true
CREWCHECK_WEATHER_MONITOR_INTERVAL_MINUTES=10
```

Com `CREWCHECK_WEATHER_MONITOR_ENABLED=true`, o próprio serviço executa o monitor no intervalo indicado. Como alternativa, deixe a variável desativada e execute `GET` ou `POST /api/telegram/weather-monitor/run` por um cron externo, enviando o segredo em `x-crewcheck-scheduler-secret` ou `Authorization: Bearer`.

## Política antirruído

- Origem: começa três horas antes da partida e encerra 30 minutos depois.
- Destino: começa duas horas antes da chegada e encerra 45 minutos depois.
- Notifica somente piora relevante de teto, visibilidade, trovoada, cortante de vento, granizo, fenômeno congelante ou vento forte.
- Mesmo estado crítico não é repetido.
- Cooldown de 90 minutos, exceto quando a severidade aumenta.
- Melhoras e mudanças leves não geram mensagem.
- O tripulante controla a função com `/alertameteo on` e `/alertameteo off`.

## Limite operacional

A decodificação é apoio de leitura. O usuário deve confirmar as fontes oficiais, ATIS, NOTAM, despacho e orientação operacional antes do voo.
