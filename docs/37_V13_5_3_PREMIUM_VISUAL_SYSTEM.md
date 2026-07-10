# CrewCheck v13.5.3 — Premium Visual System Hardening

## Objetivo

Corrigir a camada visual do CrewCheck sem alterar parser AIMS/CrewRoster, motor canônico, continuidade física, Import Guardian, Roster inline, Gerenciador de Apresentação, Lounge Systems, Monthly Map ou o fallback resiliente de PDF da v13.5.2.

## Correções

- Tema claro mais premium, com fundo menos lavado e cards realmente legíveis.
- Cards de Radar, Meteorologia, Alertas, Carga, Financeiro, Menu, Meu Carro e Mapa com contraste consistente.
- Botões padronizados no estilo dos cards de Carga: claros, arredondados, legíveis e com toque premium.
- Menu lateral com rolagem própria em `100svh`, sem depender da página atrás.
- Cabeçalho do menu fixo durante a rolagem.
- Conteúdo limitado por largura máxima em desktop, evitando telas muito esticadas.
- Textos longos contidos dentro dos cards, botões e chips.
- Bottom nav preservado e com sombra/contraste melhores no tema claro.

## Preservado

- Parser AIMS/CrewRoster.
- Motor canônico da escala.
- Continuidade física/anti-teletransporte.
- Import Guardian.
- Roster inline expansível.
- Gerenciador de Apresentação.
- Lounge Systems.
- Monthly Map / Visual Routes.
- PDF import fallback da v13.5.2.
- Regras de LGPD/iFlight sem credenciais ou sessão persistida.

## Validação

Rodar:

```bash
node scripts/regression-v13-5-3-premium-visual-system.mjs
npm run check
npm run build
git diff --check
```
