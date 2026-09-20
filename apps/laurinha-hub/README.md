# Laurinha Connected Hub

Ponte entre a TV LG e o Home Assistant.

```
LG TV 192.168.0.171  ->  Connected Hub 192.168.0.32:8188  ->  Home Assistant 192.168.0.56:8123
```

**O token do Home Assistant nunca sai do Hub.** A TV conhece apenas a *bridge
key* do Hub (header `X-Laurinha-Key`). Nada de token vai para o app da TV nem
para o IPK — há teste automatizado garantindo que o cliente da TV sequer tem
um campo para isso.

## Como rodar

```bash
cp .env.example .env          # preencha; nunca comite valores reais
node src/server.mjs           # ou: npm start
npm test                      # 78 testes, sem dependência externa
```

O Hub não tem dependências de runtime: só a biblioteca padrão do Node 22.

## Configuração

Duas fontes, com papéis distintos:

| Fonte | Para quê |
| --- | --- |
| variáveis de ambiente (`.env.example`) | segredos e endereços |
| JSON em `LAURINHA_HUB_CONFIG` | identidades de entidades do HA |

Os únicos `entity_id` embutidos como padrão são os `media_player` informados
para este projeto. **Todo o resto — scripts, luzes, cenas, clima, alarme —
precisa ser configurado.** Ação sem configuração responde
`action_not_configured` dizendo qual chave falta, em vez de chutar e acender a
luz errada. Copiar `laurinha-hub.config.example.json` sem editar faz o Hub
recusar subir, listando os placeholders.

---

## Endpoints

Todas as respostas são JSON UTF-8. Escritas (`POST`) exigem
`X-Laurinha-Key`; leituras (`GET`) só exigem se `LAURINHA_REQUIRE_KEY_FOR_READS=1`.

### `GET /health` — público, sem segredo

```json
{
  "ok": true,
  "service": "laurinha-hub",
  "version": "5.0.0",
  "haConfigured": true,
  "bridgeKeyConfigured": true,
  "publicBaseUrlConfigured": true,
  "library": { "source": "manifest", "trackCount": 315, "photoCount": 42, "error": null },
  "homeActionsConfigured": ["lights", "party"],
  "outputs": ["tv", "todo_lugar", "echo_dot_de_bruno", "..."],
  "ha": { "reachable": true, "latencyMs": 12, "error": null }
}
```

Devolve `503` com `ok:false` quando o HA está configurado mas inalcançável.
Só booleanos e contagens — nunca um valor de segredo.

---

### Som

#### `GET /api/sound/state`

Sempre `200`, mesmo degradado: a TV precisa conseguir desenhar a tela.

```json
{
  "ok": true,
  "output": { "id": "echo_show_15_laurinha", "label": "Echo Show 15 da Laurinha",
              "kind": "alexa", "entityId": "media_player.echo_show_15_laurinha",
              "supportsLocalMedia": false },
  "outputs": [ { "id": "tv", "label": "TV", "kind": "tv", "supportsLocalMedia": true } ],
  "state": "playing",
  "title": "Cantiga da Vovó", "artist": "Laurinha", "album": null,
  "durationSeconds": 213, "positionSeconds": 12,
  "volumePercent": 40, "muted": false,
  "source": "music",
  "queue": { "length": null, "index": null, "owner": "device" },
  "error": null,
  "haReachable": true,
  "updatedAt": "2026-09-20T02:30:00Z"
}
```

Degradado (HA fora do ar) — mesma forma, com `ok:false` e `error` preenchido:

```json
{ "ok": false, "state": "unknown", "haReachable": false,
  "error": { "code": "ha_timeout", "message": "A casa demorou para responder. Tente de novo em instantes.",
             "hint": "Sem resposta do Home Assistant em 5000 ms." } }
```

#### `POST /api/sound/play`

Tocar da biblioteca **na TV** (único caminho para MP3 local):

```json
{ "output": "tv", "source": "library", "trackId": "t17" }
```

```json
{ "ok": true, "state": "playing",
  "playback": { "mode": "tv_local", "state": "playing",
                "track": { "id": "t17", "title": "Ninar",
                           "url": "http://192.168.0.32:8188/api/media/track/t17" },
                "queueLength": 1, "queueIndex": 0 } }
```

> `mode: "tv_local"` significa: **o Hub não chamou o Home Assistant**. A TV
> deve reproduzir `playback.track.url` ela mesma.

Fila inteira: `{ "output": "tv", "source": "library", "queue": ["t1","t2","t3"] }`

Rádio TuneIn num Echo: `{ "output": "echo_show_15_laurinha", "source": "tunein", "stationId": "radio_disney" }`

Music Assistant: `{ "output": "todo_lugar", "source": "music_assistant", "mediaId": "library://track/42" }`

Retomar o que estava tocando: `{}` (corpo vazio).

**MP3 local num Echo é recusado antes de tentar:**

```json
{ "ok": false,
  "error": { "code": "output_cannot_play_local",
             "message": "Echo Show 15 da Laurinha não toca música da biblioteca da casa.",
             "hint": "Alexa não reproduz MP3 local por play_media. Use a TV, uma rádio TuneIn ou o Music Assistant.",
             "details": { "alternatives": [ { "id": "tv", "label": "TV" } ] } } }
```

#### `POST /api/sound/pause` · `stop` · `next` · `previous`

Corpo vazio. Agem sobre a saída ativa e devolvem o estado novo.

#### `POST /api/sound/volume`

```json
{ "level": 35 }              // 0..100, grampeado
{ "delta": -10 }             // relativo ao volume atual
{ "output": "todo_lugar", "level": 40 }
```

#### `POST /api/sound/output`

```json
{ "output": "todo_lugar" }
```

> Trocar de saída **não transfere** a reprodução em curso: quem estava tocando
> continua tocando. É uma escolha de projeto — transferir exigiria parar e
> reiniciar a mídia no aparelho novo, o que a Alexa nem sempre aceita.

#### `GET /api/sound/library?q=&limit=&offset=`

Paginado (padrão 50, teto 200) — 315 músicas não cabem numa tela de TV.

```json
{
  "ok": true,
  "sources": [
    { "id": "library", "label": "Biblioteca da casa", "available": true, "reason": null, "trackCount": 315 },
    { "id": "tunein", "label": "Rádio TuneIn", "available": true, "reason": null,
      "stations": [ { "id": "radio_disney", "label": "Rádio Disney" } ] },
    { "id": "music_assistant", "label": "Music Assistant", "available": false,
      "reason": "Music Assistant não configurado." }
  ],
  "tracks": { "total": 315, "limit": 50, "offset": 0,
              "items": [ { "id": "t0", "title": "Ninar", "missing": false,
                           "url": "http://192.168.0.32:8188/api/media/track/t0" } ] },
  "playlists": [ { "id": "pl0", "name": "Dormir", "trackCount": 12 } ],
  "photos": { "total": 42 },
  "albums": [ { "id": "al0", "name": "Verão", "photoCount": 18, "intervalSeconds": 12,
                "coverUrl": "http://192.168.0.32:8188/api/media/photo/p3" } ],
  "frameMode": { "secondsPerPhoto": 12, "fade": true, "random": false, "caption": true },
  "libraryError": null
}
```

#### `GET /api/sound/queue`

Na TV a fila é do Hub; num Echo ela é do aparelho e o Hub **não inventa**:

```json
{ "ok": true, "owner": "device", "outputId": "todo_lugar", "items": [], "index": null,
  "note": "A fila de Todo lugar é controlada pelo próprio aparelho." }
```

---

### Casa

#### `GET /api/home/state`

```json
{
  "ok": true,
  "actions": [
    { "id": "lights", "label": "Luzes", "configured": true, "available": true, "reason": null,
      "params": [ { "name": "brightness", "min": 1, "max": 100 } ] },
    { "id": "party", "label": "party", "configured": false, "available": false,
      "reason": "Ação ainda não configurada no Hub.", "params": [] }
  ],
  "entities": [ { "entityId": "light.sala", "name": "Luz da sala", "state": "on",
                  "available": true, "reason": null } ],
  "haReachable": true, "error": null
}
```

#### `POST /api/home/action`

Ações: `lights`, `sound`, `party`, `good_night`, `climate`, `alarm`.

```json
{ "action": "party", "params": { "volume": 55 } }
```

Sucesso, com relato passo a passo:

```json
{ "ok": true, "action": "party", "label": "Modo Festa", "partial": false,
  "steps": [ { "step": "luzes decorativas", "ok": true },
             { "step": "cena da festa", "ok": true },
             { "step": "som ambiente", "ok": true } ],
  "message": "Modo Festa: tudo certo.",
  "frameMode": { "enable": true } }
```

Parcial — um passo falhou, os outros continuaram (`200`, `ok:false`):

```json
{ "ok": false, "partial": true,
  "steps": [ { "step": "luzes decorativas", "ok": false,
               "error": { "code": "entity_unavailable",
                          "message": "\"Luz da sala\" está indisponível agora." } },
             { "step": "cena da festa", "ok": true },
             { "step": "som ambiente", "ok": true } ],
  "message": "Modo Festa: 2 de 3 passos funcionaram." }
```

Só `params` **declarados pelo passo** chegam ao HA. Mandar
`{"entity_id": "light.outra_coisa"}` não redireciona a ação — há teste para isso.

---

### Mídia

`GET /api/media/track/:id` · `GET /api/media/photo/:id`

Suporta `Range` (`206`), que é o que permite a TV avançar dentro da música.
Arquivo fora da raiz da biblioteca **não é servido**, mesmo que o manifesto
peça — também coberto por teste.

`POST /api/library/reload` relê o manifesto sem reiniciar o Hub.

---

## Códigos de erro

| Código | HTTP | Quando |
| --- | --- | --- |
| `hub_not_configured` | 503 | falta `HA_BASE_URL`/`HA_TOKEN` ou bridge key |
| `unauthorized` | 401 | bridge key ausente/errada |
| `origin_not_allowed` | 403 | origem fora de `LAURINHA_TV_ORIGINS` |
| `bad_request` | 400 | payload inválido |
| `ha_timeout` | 504 | HA não respondeu no prazo |
| `ha_unreachable` | 502 | rede/HA fora do ar |
| `ha_unauthorized` | 502 | token recusado pelo HA (401/403) |
| `ha_error` | 502 | HA devolveu erro |
| `entity_not_found` | 404 | entidade não existe no HA |
| `entity_unavailable` | 409 | entidade existe mas está `unavailable` |
| `service_not_allowed` | 403 | serviço fora da allowlist do Hub |
| `output_not_found` | 404 | saída inexistente |
| `output_cannot_play_local` | 422 | MP3 local numa saída que não reproduz |
| `play_media_rejected` | 422 | aparelho recusou o conteúdo |
| `source_unavailable` | 409 | fonte não configurada/offline |
| `action_not_configured` | 501 | ação de casa sem configuração |
| `media_not_found` | 404 | faixa/foto inexistente ou fora da raiz |

Todo `message` é texto pronto para a TV mostrar, em português. `hint` é para
quem configura o Hub, não para a tela.

---

## Cliente da TV (webOS 4.x)

`client/laurinhaHubClient.js` é **script clássico**, sem `import`/`export`,
sem `async/await`, sem `Object.entries`, usando `XMLHttpRequest` — tudo o que
Chromium 53 aguenta. Há teste que reprova o arquivo se algum recurso
posterior entrar.

```html
<script src="laurinhaHubClient.js"></script>
<script>
  LaurinhaHub.configure({ baseUrl: 'http://192.168.0.32:8188', key: 'BRIDGE_KEY' });

  var stop = LaurinhaHub.pollSoundState(function (view) {
    // view: { title, artist, state, playing, volumePercent, outputLabel,
    //         localUrl, errorMessage, degraded }
    if (view.localUrl) player.src = view.localUrl;  // a TV toca o MP3
  }, function (error) {
    mostrarMensagem(error.message);                 // já vem amigável
  }, 5000);

  LaurinhaHub.party({ volume: 55 });
</script>
```

Este arquivo não toca em layout nem CSS: só busca dados e devolve objetos
prontos para a tela existente consumir.

## CORS

App webOS empacotado não roda em `http://`: manda `Origin: null` ou
`file://`. O Hub aceita os dois por padrão (`LAURINHA_ALLOW_PACKAGED_APP=1`) —
sem isso a TV simplesmente não fala com o Hub, e o erro só apareceria no
aparelho.

## Testes

```bash
npm test
```

78 testes cobrindo o que foi pedido: health, estado do HA, timeout do HA,
token ausente, entidade indisponível, play/pause, volume, scripts do HA,
fotos, MP3 (inclusive `Range` e confinamento de caminho) e CORS para a TV —
mais redação de segredo, allowlist de serviços e compatibilidade webOS 4.x.

Veja `RISCOS.md` antes de colocar em produção.
