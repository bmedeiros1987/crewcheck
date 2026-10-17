# Relatório de riscos — Laurinha Connected Hub

Estado: **código novo, nunca executado contra a sua casa real.** Todos os
testes usam um Home Assistant falso. Nada foi implantado.

Ordenado por quanto pode doer.

---

## 1. Este não é o Hub que já existe na sua casa — ALTO

Você descreveu um Hub que já tem biblioteca MP3, ~315 músicas, integração HA,
fotos, bridge key e health endpoint. **Esse código não está em nenhum
repositório que eu alcance**: procurei em `crewcheck` (main e ~200 branches) e
nos outros cinco repositórios da conta. Ele existe só no PC `192.168.0.32`.

Então o que está aqui é uma implementação **nova e paralela**, não uma
estabilização da sua. Consequências:

- os endpoints podem não bater com os que a sua TV já chama hoje;
- a sua bridge key, o seu formato de biblioteca e o seu `/health` podem ter
  outra forma;
- adotar isto pode significar migrar a TV, ou portar as partes boas daqui
  para o Hub existente.

**O que reduz o risco:** commitar o Hub atual (mesmo numa branch) e me deixar
fazer o diff. Enquanto isso não acontece, trate este módulo como proposta de
arquitetura com testes, não como substituto pronto.

---

## 2. Alexa não toca MP3 local — ALTO (tratado, mas é limitação real)

`media_player.play_media` para um Echo com URL de arquivo local do seu PC
normalmente **não funciona**: a integração Alexa Media Player não é um player
de mídia arbitrária, e mesmo quando aceita a chamada o aparelho ignora em
silêncio.

O Hub não tenta e não finge: recusa com `output_cannot_play_local` e oferece
alternativas (TV, TuneIn, Music Assistant). O MP3 local só toca **na TV**, que
busca o stream direto do Hub.

**O que ainda não sei:** se a sua instalação tem algum caminho que funcione
(Music Assistant com provider local costuma ser o caminho certo). Se tiver,
configure `musicAssistant.entityId` — o Hub já expõe a fonte quando a entidade
existe e está disponível.

---

## 3. `play_media` pode falhar em silêncio — MÉDIO

O Home Assistant responde `200` para `play_media` mesmo quando o aparelho
ignora o conteúdo. O Hub mitiga relendo o estado logo depois e tratando
`unavailable` como recusa — **mas isso não pega o caso de o aparelho aceitar a
chamada e simplesmente não tocar nada.**

Não há como resolver isso pelo lado do Hub com certeza. Em produção, a TV
deveria mostrar o estado real vindo de `/api/sound/state` alguns segundos
depois, em vez de assumir sucesso.

---

## 4. Sem TLS na rede local — MÉDIO

Tudo trafega em HTTP puro na LAN: bridge key no header, stream de MP3, fotos.

- O **token do HA nunca trafega** — fica só no processo do Hub. Isso está
  garantido e testado.
- A **bridge key trafega em claro**. Quem estiver na sua Wi-Fi e capturar
  tráfego consegue comandar o Hub (luzes, som, festa, alarme).

O `alarm` é o que mais preocupa: se você configurar `homeActions.alarm`, a
bridge key passa a valer como controle do alarme. **Sugestão:** não configure
`alarm` enquanto o Hub estiver em HTTP puro, ou limite-o a `arm`, nunca
`disarm`.

Não há rate limiting: a chave não é protegida contra força bruta.

---

## 5. IDs que eu não tenho — MÉDIO (por projeto)

Você me deu os cinco `media_player`. **Não me deu** os `entity_id` de:

- scripts Laurinha (tocar/pausar/próxima/anterior/volume);
- luzes, cenas, clima, alarme;
- estação TuneIn;
- entidade do Music Assistant.

Nada disso foi inventado. Cada ação sem configuração responde
`action_not_configured` nomeando a chave que falta, e o Hub recusa subir se o
arquivo de exemplo for copiado sem editar.

**Consequência prática:** recém-instalado, o Hub serve som e biblioteca, mas
`lights`/`party`/`good_night`/`climate`/`alarm` respondem `501` até você
preencher os IDs reais.

Sobre os scripts: sem configuração o Hub usa `media_player.media_play`,
`media_pause`, etc. — que existem para qualquer `media_player` e não são
palpite. Se os seus scripts Laurinha fizerem algo a mais (agrupar aparelhos,
ajustar equalização), configure `soundScripts` para que eles assumam.

---

## 6. Estado da TV é intenção, não confirmação — MÉDIO

Quando a saída é a TV, o Hub não tem como saber se a reprodução realmente
começou: ele devolve a URL e marca `playing`. Se a TV falhar ao tocar, o Hub
continua dizendo `playing`.

**Como fechar isso:** a TV reportar de volta. Não implementei porque
`POST /api/sound/state` não estava na lista de endpoints que você especificou,
e preferi não inventar endpoint fora do contrato. É um acréscimo pequeno se
você quiser.

---

## 7. `volume` com `delta` faz leitura extra — BAIXO

`{"delta": -10}` lê o volume atual no HA e escreve o novo. Entre as duas
chamadas, alguém pode mexer no volume pela Alexa e o resultado sai diferente
do esperado. `{"level": N}` não tem esse problema.

---

## 8. Cache de biblioteca de 15 s — BAIXO

Mudanças feitas pelo Laurinha Manager podem levar até 15 s para aparecer.
`POST /api/library/reload` força na hora.

Com 315 músicas o custo de reler é baixo; com biblioteca muito maior, a
varredura de disco (quando não há manifesto) fica cara. Prefira o manifesto.

---

## 9. Compatibilidade webOS 4.x é verificada por padrão, não por execução — BAIXO

O teste reprova `async/await`, módulos ES, `Object.entries`, optional chaining
e outros recursos posteriores ao Chromium 53. Isso pega o erro comum, **mas
não substitui rodar na TV**: nada aqui foi executado num aparelho webOS real.

---

## 10. Superfície que o Hub deliberadamente não tem

Para constar, por serem coisas que você proibiu e que estão barradas por
construção:

- **Não existe** endpoint que faça proxy de chamada arbitrária ao HA. Só os
  endpoints documentados, com serviços de uma allowlist.
- A allowlist **exclui** `homeassistant.*`, `recorder.*`, `config.*`,
  `hassio.*`, `shell_command.*`, `python_script.*` — o Hub não consegue apagar
  entidade nem reescrever configuração do HA, mesmo com configuração errada.
- O token do HA é mascarado em log, em resposta e em mensagem de erro. Há
  teste que varre as respostas de `timeout`, `offline` e `unauthorized`
  procurando o token.
- O cliente da TV não tem sequer um campo para token de HA — há teste para isso.

---

## Antes de ligar na casa de verdade

1. Preencher `HA_TOKEN` e `LAURINHA_BRIDGE_KEY` no `.env` do PC.
2. Preencher os `entity_id` reais no JSON de configuração.
3. `GET /health` a partir da TV — confirma rede, CORS e alcance do HA.
4. Testar `lights` antes de `alarm`.
5. Conferir se a TV consegue tocar `playback.track.url` (é aí que o MP3 local
   vive ou morre).
6. Só então configurar `party`.
