# Imagem Node 22 neutra de provedor (CrewCheck)

Preparação para recuperação: só arquivos e testes locais. Nenhum provedor, serviço, segredo, DNS ou custo foi usado ou criado. O documento não traz nenhuma garantia de disponibilidade.

## O que a imagem faz

`Dockerfile` em dois estágios, com `node:22.13.0-bookworm-slim` nos dois. É a mesma versão de `NODE_VERSION` e de `engines`.

**Build:**
- `npm ci` instala pelo `package-lock.json`. O serviço suspenso usava `yarn install` sem `yarn.lock`, o que não é reprodutível.
- `npm run build` faz a preparação canônica e o build web.
- `npm prune --omit=dev` deixa só as dependências de produção. O servidor importa apenas `mysql2` e `web-push`, ambas em `dependencies`.

**Runtime:**
- Executa `node server.mjs` como usuário `node`, na `PORT` 10000.
- Já preparado, o `server.mjs` carrega sozinho o runtime de notificações (`telegram-fast-ack`).
- `/api/health` e `/api/release` informam o commit passado em `--build-arg SOURCE_VERSION=<sha>`.

Nada privado entra na imagem: nenhum segredo, proxy ou CA privado ou do proxy. O CA **público** do MySQL (`server/certs/crewcheck-aiven-project-ca.pem`), que fixa a confiança TLS, é obrigatório e entra. A verificação TLS fica ligada, e toda a configuração vem de variáveis de ambiente no runtime.

**Contexto de build por lista de inclusão** (`.dockerignore`):
- primeiro exclui tudo;
- depois libera só as entradas do build: arquivos de raiz necessários, `client`, `config`, `database`, `migrations`, `scripts`, `server`, `shared`, `android-wrapper` e `docs`. A preparação canônica altera fontes Android e confere documentos obrigatórios;
- em qualquer profundidade, exclui de novo `.env*`, `.npmrc`, `.yarnrc*`, `.crewcheck-*` (arquivos de runtime do app: store do OAuth do Google, vínculos e escalas do Telegram, patch de runtime), chaves, keystores, `*.pem`, `local.properties`, `google-services.json`, `node_modules`, `dist`, saídas de build e logs;
- por fim, reinclui só o CA público e o modelo `.env.example`, que tem só nomes.

**Testes:**
- `scripts/regression-container-image.mjs`: contrato estático do Dockerfile e da lista.
- `scripts/regression-container-context.mjs --full`, job `container-context`:
  - planta 42 canários sintéticos (marcador gerado na execução, que não existe em nenhum arquivo versionado; nunca valores reais) numa cópia dos arquivos versionados;
  - com o próprio Docker, prova que nenhum entra no contexto;
  - constrói a imagem real e varre todas as camadas listadas no manifesto;
  - confere que o CA público e o `dist/` estão presentes e que não há secret mount, proxy nem CA privado.

## Medições locais (sem banco, sem segredos, rede do app bloqueada)

| Item | Medição | Observação |
|---|---|---|
| Pico de memória do build (`npm run build`) | cerca de 1,17 GB | o provedor precisa permitir isso **no build**, que pode ser separado do runtime |
| Tempo de build da imagem | menos de 1 min | 4 núcleos locais |
| Imagem final | 911 MB | sem otimização de tamanho |
| Memória em execução | 28 a 75 MB | sem banco e sem tráfego real; com MySQL e usuários será maior e não foi medido |
| Boot até `/api/health` | 2 s | local |
| Smoke | `post-cutover-smoke.mjs --expected-release <sha>` passa | com outro commit, reprova |

## O que o build e o runtime precisam

**Build:** internet de saída para o registry do npm e para `raw.githubusercontent.com` (modelos tessdata baixados por `scripts/stay-screenshot-assets.mjs`, com SHA-256 conferido).

**Runtime:**
- HTTPS de saída para os provedores configurados.
- TCP com TLS até o MySQL do Aiven, com host, porta 22966 e CA fixados em `server/mysql-verified-tls.mjs`. Se o Aiven tiver filtro de IP, o IP de saída do provedor precisa estar liberado.
- Disco gravável em `/app` para arquivos pequenos e efêmeros: vínculos e escalas do Telegram em cache, store do OAuth do Google e patch de runtime. Hoje também já são efêmeros, porque o host atual não tem disco persistente.

## Processo sempre ligado é requisito do app completo

O agendamento roda dentro do processo:

| Rotina | Intervalo |
|---|---|
| Fila de notificações, briefing do Telegram, push e monitor de deslocamento | 30 s |
| Reparo do webhook do Telegram | 15 min |
| Monitor meteorológico | 10 min |
| Runtime do Infobip/WhatsApp | 10 s |

Um job de notificação ou alarme que passa **mais de 120 s** do horário é marcado `expired`. Por isso, em plataformas que hibernam o processo por inatividade, alarmes e avisos agendados durante a hibernação **não são atrasados: são perdidos**. Webhooks (Telegram, WhatsApp, Asaas) acordam o processo, mas o primeiro pedido espera o tempo de partida.

**Nunca rode duas instâncias com segredos de produção ao mesmo tempo.** As duas agendariam e enviariam, e o webhook do Telegram seria disputado. Um teste ou prévia roda **sem** segredos.

## Aviso de manutenção × app completo

| | Aviso de manutenção | App completo |
|---|---|---|
| Entrada | `ops/maintenance/server.mjs` (o `index.html` estático, sozinho, não devolve 503 em `/api` e nos webhooks, logo não cumpre o contrato) | esta imagem |
| Segredos e banco | nenhum | todos os nomes do serviço antigo, com presença preservada (`scripts/ops/env-names.mjs --check --old --new`) |
| Timers | nenhum | os da tabela acima |
| Sempre ligado | não precisa | precisa, para alarmes e avisos |
| Domínio | `crewcheck.online` com TLS válido | `crewcheck.online` com TLS válido; o app Android abre esse endereço |

## Teste local da imagem

O sandbox de desenvolvimento usa um proxy TLS próprio.
- Por isso o teste local passa o CA do proxy às etapas `npm ci` e `npm run build` por **secret mount do BuildKit** (`SANDBOX_CA_FILE`, só local). Esse CA nunca entra no contexto nem em nenhuma camada.
- O Dockerfile publicado não tem nenhuma dessas linhas.
- A imagem final foi verificada sem secret mount, sem variável de proxy e sem CA privado ou do proxy. O CA público do MySQL está presente.
- Os artefatos temporários de testes anteriores, que tinham o CA do proxy, foram apagados localmente: variantes de Dockerfile, imagens e cache de build. Nenhuma imagem foi publicada.
