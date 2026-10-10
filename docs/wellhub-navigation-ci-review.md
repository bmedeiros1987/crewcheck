# Complemento de regressão Wellhub após PR990

Sem mudança de produto, Home/apply, preferência, dependências, permissões ou
publicação. Usa o workflow existente `wellhub-hours-layout.yml`; acrescenta
somente dois casos de navegador aos 12 existentes: 320px, fonte 150%, claro e
escuro, altura reduzida 430px, safe areas simuladas 35/34px.

O navegador continua extraindo o JSX da lista e detalhe da Home materializada,
com CSS de produção, ícones reais, dados sintéticos e rede bloqueada. Verifica
interseções de texto/ações, overflow, largura inteira do plano mínimo, expansão
antes das ações e alcance do primeiro título/última ação. Mede coordenadas das
barras sintéticas antes/depois da rolagem: topo em 0 e rodapé no fim do viewport.
No caso reduzido, foca um input sintético e permite rolagem manual para alcançar
o item, em vez de exigir centralização automática. Não fixa conteúdo/cards.

Capturas de viewport preservam as barras. Capturas de elemento completo
mantêm o método documentado em PR990 (altura temporariamente ampliada,
ancestrais sem recorte, sobreposições decorativas ocultas), depois restaurado.
Nomes incluem `-keyboard-430` para não sobrescrever evidências normais.

## Regressão demonstrada

Antes: teste atual com CSS de produção pré-PR990 e override de
`client/src/styles/wellhub-hours.css` do HEAD `57cdc970` falha com
`minimum plan must not inherit generic card columns` (exit 1). Trata-se de
rollback controlado do CSS, mantendo o JSX materializado atual, não de uma
sessão privada ou execução integral de um app antigo.

Depois: CSS/JSX de main `6306923d` passam nas mesmas asserções e nos novos
casos. `WELLHUB_CARD_STYLE_PATH` permite reproduzir esse diagnóstico local;
CI usa por padrão o arquivo atual do checkout. A asserção anterior medindo só
o contêiner não detectava a compressão de seu `<small>`; agora mede ambos.

Comandos locais (deps já existentes):

```sh
node scripts/v139/apply.mjs
node scripts/p1-concierge-journey/compile.mjs
./node_modules/.bin/vite build
MENU_PLAYWRIGHT_PACKAGE=/tmp/crewcheck-hours-browser/package.json \
WELLHUB_CHROMIUM_PATH=/usr/bin/chromium \
node scripts/regression-wellhub-cards-browser.mjs
```

## Limites e sequência

As barras são sintéticas: as coordenadas verificam o contrato de alcance dos
cartões sob navegação fixa, sem provar o shell autenticado completo. O workflow
existente de menu mobile cobre navegação/rodapé reais do app e não é duplicado
nesta matriz. Altura reduzida e insets explícitos simulam teclado/safe areas;
não substituem teste com teclado físico/mobile e insets reais de iOS/Android.
Não há garantia absoluta contra qualquer recorrência.

A preferência global de navegação fica fora deste diff. Seu encaixe deve ser
um controle agrupado em Configurações/Leitura, padrão fixo, isolado por conta,
e uma inicialização única do shell. Exige implementação/revisão próprias,
coordenadas com o owner de pernoites.
