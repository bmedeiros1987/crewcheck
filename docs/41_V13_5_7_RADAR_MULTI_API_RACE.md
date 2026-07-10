# CrewCheck v13.5.7 — Radar Multi-API Race Engine

## Objetivo
Testar automaticamente quais fontes de radar estão disponíveis e usar a melhor resposta, priorizando rapidez e qualidade operacional.

## Estratégia
- O frontend chama apenas `/api/radar-flight`.
- O backend dispara consultas em paralelo nas fontes configuradas.
- Se uma fonte responder com alta qualidade rapidamente, o sistema retorna sem esperar as demais.
- Se nenhuma fonte atingir qualidade alta, o sistema aguarda o limite operacional e escolhe a melhor resposta disponível.
- O usuário final não vê nome técnico de provedor nem chave.

## Fontes suportadas por ambiente
```text
FLIGHTAWARE_AEROAPI_KEY
AEROAPI_KEY
CREWCHECK_FLIGHT_STATUS_URL
AVIATIONSTACK_API_KEY
AIRLABS_API_KEY
AERODATABOX_API_KEY
AERODATABOX_RAPIDAPI_HOST
AERODATABOX_URL_TEMPLATE
CREWCHECK_RADAR_TIMEOUT_MS
```

## Recomendação
- Começar com `FLIGHTAWARE_AEROAPI_KEY`.
- Adicionar outras fontes apenas se houver chave ativa.
- Usar `CREWCHECK_RADAR_TIMEOUT_MS=2200` ou `2400`.
- Chaves sempre no backend/Render, nunca como `VITE_`.

## Preservado
- Parser AIMS/CrewRoster.
- Motor canônico.
- Continuidade física.
- Sem credenciais, senha, MFA, cookies ou sessão.


## Correção pós-auditoria
Este PR preserva os endpoints de mapas/locais da v13.5.5:
- `/api/maps/route-preview`
- `/api/places/fitness`

O radar multi-API não deve substituir nem remover as rotas de mapas, saída inteligente ou academias.
