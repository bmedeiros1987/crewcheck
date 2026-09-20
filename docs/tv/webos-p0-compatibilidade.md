# Relatório de compatibilidade — P0 webOS

**Alvo:** LG 55SM9000PSA · webOS 4.10 · firmware 05.50.00 · Chromium 53 · UI 1920×1080
**Baseline canônico:** `codex/lg-webos-2019` (única linhagem que empacota IPK)
**Branch:** `fix/laurinha-v5-webos-p0`

## O que mudou e por quê cabe no Chromium 53

| Arquivo | Mudança | Risco para o motor da TV |
| --- | --- | --- |
| `packages/tv-core/src/net.ts` | novo — classifica origem, `bindFetch` | nenhum: só `URL`, regex e `bind`. Tudo ES5/ES2015 |
| `packages/tv-core/src/hub.ts` | novo — cliente do Connected Hub | `AbortSignal.timeout` já era polyfillado por `compat.ts`; `Set` e `Object.values` cobertos por core-js |
| `packages/tv-core/src/diagnostics.ts` | novo — log de códigos | `localStorage` com try/catch; `JSON` |
| `packages/tv-core/src/session.ts` | não lança mais no construtor; usa `bindFetch` | remove código, não adiciona API |
| `apps/tv-player/src/ErrorBoundary.tsx` | novo — componente de classe | classe React é transpilada pelo esbuild para ES2016 |
| `apps/tv-player/src/MinimalHome.tsx` | novo — Home mínima | `Date`, `setInterval`. `toLocaleDateString` com fallback manual |
| `apps/webos/boot.css` | novo — CSS do fallback | flex + margem + px/vh. **Sem** grid, gap, clamp, `:focus-visible` |
| `apps/webos/build.mjs` | CSP por origem; fallback estático no HTML | só string |
| `apps/webos/verify.mjs` | gate ampliado | roda no build, não na TV |

**Nada foi removido da camada de compatibilidade existente.** `core-js/stable`, `abortcontroller-polyfill`, o polyfill de `AbortSignal.timeout` e todo o `legacy.css` seguem intactos — o gate falha se os overrides do `legacy.css` sumirem do bundle.

## Recursos deliberadamente evitados no código novo

`async/await` e `?.`/`??` aparecem no fonte e são **transpilados** pelo esbuild (`target: chrome53`); o `verify.mjs` reparsa o `app.js` com `ecmaVersion: 2016` e reprova se algo posterior escapar.

No CSS novo, evitados por escrita, não por transpilação (o `cssTarget` não converte layout):

- `display: grid`, `gap` em flex → flex + `margin`
- `clamp()`, `min()`, `max()` → valores fixos em px
- `:focus-visible` → `:focus`
- `backdrop-filter`, `position: sticky`, `aspect-ratio` → não usados

O gate reprova `backdrop-filter` e `position:sticky` em qualquer lugar do `app.css`, e reprova grid/gap/clamp dentro do bloco `.boot*`.

## Arquitetura de rede

```
LG 192.168.0.171 ──► Connected Hub 192.168.0.32:8188 ──► Home Assistant 192.168.0.56:8123
      (CSP libera)            (guarda o token)               (a TV nunca alcança)
```

CSP gerada pelo build:

```
default-src 'self'; script-src 'self'; style-src 'self';
img-src 'self' data: http://192.168.0.32:8188;
media-src 'self' http://192.168.0.32:8188;
connect-src 'self' https://crewcheck.online http://192.168.0.32:8188;
font-src 'self'; object-src 'none'; base-uri 'none';
form-action 'none'; frame-src 'none'
```

Sem curinga, sem `unsafe-inline`, sem `unsafe-eval`. A origem do Home Assistant **não aparece** no CSP nem no bundle — o gate reprova `192.168.0.56`, `:8123`, `homeassistant` e `hass.io` no `app.js`.

O CSP restringe **origem**; a lista `HUB_PATHS` restringe **rota**, que CSP não sabe fazer. Rota fora da lista é recusada antes de sair do aparelho.

## Como a permissão foi provada, não presumida

Com o mesmo stub servido por host-mapping, a página empacotada em `file://`:

| Origem | Resultado | Significado |
| --- | --- | --- |
| `http://192.168.0.32:8188/health` | **HTTP 200** | o Hub está liberado |
| `http://127.0.0.1:8188/health` | **TypeError** | origem não listada é recusada |

Mesmo servidor, mesmo CORS, mesma resposta — só a origem difere. É a prova de que o `connect-src` libera o Hub e nada além.

## Defeito encontrado no baseline

`TvSession` guardava `fetch` como propriedade e o chamava como método (`this.request(...)`). No navegador isso lança `TypeError: Failed to execute 'fetch' on 'Window': Illegal invocation` — **toda chamada de API falhava**. O `fetch` do Node (undici) não checa o receptor, então teste unitário passava e o defeito só aparecia no aparelho.

Corrigido com `bindFetch` em `net.ts`, aplicado a `TvSession` e `HubClient`. O teste de regressão usa um dublê que reproduz a exigência do navegador, para o defeito não voltar por um caminho que o Node perdoa.

## Limites conhecidos desta rodada

- O navegador dos testes é Chromium moderno, **não o 53 da TV**. A compatibilidade de sintaxe é garantida pelo parse ES2016 do gate; o comportamento, pelos testes no artefato empacotado. **Nada rodou num aparelho real.**
- Sem bridge key embutida: leituras do Hub funcionam na LAN, comandos de escrita ficam para o bloco de pareamento do Hub. Foi decisão consciente para manter "nenhum segredo no bundle" verdadeiro.
- Persistência offline (P1-1) e navegação em `.detail` (P1-3) **não** entram neste bloco.
