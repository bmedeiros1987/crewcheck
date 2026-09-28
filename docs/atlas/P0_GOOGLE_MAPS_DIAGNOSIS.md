# P0 — diagnóstico do Google Maps

## Resultado

O problema não estava em uma única API. O CrewCheck usa quatro superfícies
Google diferentes, com requisitos de chave e restrição distintos:

| Superfície | Variável | API necessária | Restrição recomendada |
|---|---|---|---|
| Rotas e trânsito no servidor | `GOOGLE_ROUTES_API_KEY` | Routes API | Server-side e apenas Routes API |
| Geocodificação reversa | `GOOGLE_MAPS_SERVER_KEY` | Geocoding API | Server-side e apenas Geocoding API |
| Locais próximos | `GOOGLE_PLACES_API_KEY` | Places API (New) | Server-side e apenas Places API |
| Mapa embutido/estático no Web/PWA | `VITE_GOOGLE_MAPS_API_KEY` | Maps Embed API e Maps Static API | HTTP referrers dos domínios CrewCheck |
| Contingência de rota | `TOMTOM_API_KEY` | Routing e Traffic | Server-side |

`VITE_GOOGLE_MAPS_API_KEY` é pública por natureza porque entra no bundle do
navegador. A proteção correta é por domínio e por API; ela nunca deve ser
reaproveitada no servidor.

Restrição por IP nas chaves server-side só deve ser usada quando o provedor de
hospedagem oferecer saída estática confirmada. Independentemente disso, cada
chave deve ser limitada às APIs estritamente necessárias.

## Causas encontradas

1. O `.env.example` não documentava a chave pública usada pelo mapa embutido e
   pelo Static Maps.
2. A preparação v14.3.42 colocava `GOOGLE_ROUTES_API_KEY` antes da chave geral;
   geocodificação reversa podia então receber uma chave habilitada somente para
   Routes.
3. O servidor ainda aceitava `VITE_GOOGLE_MAPS_API_KEY` como fallback, misturando
   políticas de chave pública e server-only.
4. Sem chave pública, o cliente montava um iframe legado. Quando ele falhava,
   o fallback visual não era alcançado.
5. Falha de rede ou sessão podia deixar distância e trânsito em estados
   indefinidos como “Calculando” e “aguardando”.

## Correção v14.3.52

- separa a seleção de chave de Routes, Geocoding e Places;
- remove a chave `VITE_` de todo uso server-side;
- documenta todas as variáveis no `.env.example`;
- só monta Embed/Static quando há chave pública explícita;
- mantém o botão externo do Google Maps sempre disponível;
- usa fallback em pt-BR que informa que o planejamento continua ativo;
- troca estados indefinidos por “Atualizando…”, “Sem leitura interna” e
  “Consulte no Google Maps”.

## Validação operacional ainda necessária

No ambiente de produção, confirmar sem registrar os valores das chaves:

1. Routes API, Geocoding API, Places API (New), Maps Embed API e Maps Static API
   habilitadas no projeto correto;
2. faturamento ativo no Google Cloud;
3. `VITE_GOOGLE_MAPS_API_KEY` restrita aos domínios de produção e homologação;
4. chaves server-only sem restrição de HTTP referrer;
5. novo build/deploy após alterar qualquer variável `VITE_`;
6. `/api/maps/provider/status` mostra Google Routes principal ou TomTom em
   contingência;
7. rota, endereço próximo, Locais Próximos e mapa embutido testados
   separadamente.

Nenhuma chave real deve ser copiada para issues, logs, screenshots ou PRs.
