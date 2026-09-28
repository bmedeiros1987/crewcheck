# Prompt padrão de refino visual do CrewCheck

Prompt adotado para qualquer pedido de melhoria visual de componente no CrewCheck.
Ele existe para dar liberdade real de refino sem permitir que a interface vire outro
produto: a saída esperada é uma **evolução visual do componente atual**, nunca um
redesign.

Complementa, não substitui, o contrato de
[`V14_3_88_VISUAL_STANDARDIZATION_ROADMAP.md`](../V14_3_88_VISUAL_STANDARDIZATION_ROADMAP.md),
que define shell, tokens, escala tipográfica e gates do lote de padronização.

## Quando usar

- pedido de "melhorar o visual", "deixar mais bonito", "refinar", "modernizar" um componente;
- ajuste de espaçamento, tipografia, cor, sombra, borda, estados ou responsividade;
- qualquer refino em que a estrutura, o conteúdo e o comportamento devem permanecer intactos.

Não usar para redesign de fluxo, mudança de hierarquia funcional ou criação de tela nova —
isso é escopo de roadmap, não de refino.

## O prompt

```text
Atue como um designer UI/UX sênior e refatore apenas o CSS/Tailwind deste componente,
preservando integralmente sua estrutura, conteúdo, comportamento, navegação e hierarquia
funcional.

Aplique:
- escala de espaçamento consistente para paddings, gaps e margins;
- hierarquia tipográfica clara, moderna e legível;
- cantos arredondados discretos e consistentes;
- cores elegantes baseadas na identidade visual do CrewCheck, com fundo navy/escuro,
  branco, tons neutros e acentos rosa→roxo, sem transformar a interface em um gradiente
  excessivo;
- sombras sutis e bordas discretas para criar profundidade sem aparência pesada;
- contraste e legibilidade adequados em tema claro e escuro;
- responsividade para mobile, tablet e desktop, sem overflow ou alteração de layout;
- estados hover, active, focus e disabled coerentes e acessíveis;
- evitar efeitos excessivos, glassmorphism exagerado, sombras fortes, bordas grossas ou
  aumento desnecessário de componentes.

Restrições:
- não alterar HTML/JSX salvo se estritamente necessário para acessibilidade;
- não alterar lógica, handlers, textos, ícones, dimensões funcionais ou fluxo de navegação;
- não substituir tokens/variáveis de tema existentes por valores hardcoded quando houver
  equivalente;
- não alterar position, z-index, overflow, sticky, fixed ou estrutura de layout sem
  necessidade comprovada;
- não criar novos gradientes, sombras ou cores que conflitem com os tokens já usados pelo
  CrewCheck;
- se o componente for materializado ou reescrito por scripts/v*/apply.mjs, validar também o
  estado preparado e manter a fonte fixada/cadeia compatível.

O resultado deve parecer uma evolução visual do componente atual, não um redesign completo.

Antes de concluir, verifique:
- tema claro;
- tema escuro;
- mobile estreito;
- tablet/desktop;
- ausência de overflow;
- foco por teclado;
- estado preparado, se aplicável.
```

## Por que cada trava existe

### Identidade rosa→roxo, não SaaS azul/cinza

A identidade já está fixada em tokens. Os acentos canônicos são magenta→roxo
(`--cc-splash-accent: #d946ef` / `--cc-splash-accent-2: #7c3aed` em
`client/src/styles/opening-splash-identity.css`) e a CTA premium
(`--cc-cta` em `client/src/index.css`) termina em `#d946ef`. Um refino genérico tende a
puxar tudo para azul/cinza e apagar essa assinatura.

### Tokens antes de valores hardcoded

O tema claro/escuro do CrewCheck é resolvido por variáveis (`--cc-ink`, `--cc-muted`,
`--cc-light-surface`, `--cc-line-soft`, `--cc-shadow-premium`, entre outras). Trocar uma
variável por hex literal costuma passar no tema em que o refino foi conferido e quebrar no
outro. Se já existe token equivalente, ele é obrigatório.

### `position`, `z-index`, `overflow`, `sticky`/`fixed`

É exatamente a classe de mudança que produz os defeitos de shell que estamos auditando:
cabeçalho global fixo, navegação inferior, painéis roláveis e áreas seguras dependem desses
valores. O contrato de padronização já exige que "nenhuma barra fixa pode cobrir conteúdo,
ação ou mensagem" — alterar essas propriedades por estética viola o contrato antes de
qualquer revisão.

### Estado preparado e fonte fixada

Parte da árvore de cliente **não** é a árvore que roda. `npm run dev`, `build`, `check` e
`start` executam `node scripts/v139/apply.mjs` antes de qualquer coisa, e essa cadeia
importa mais de 120 aplicadores `scripts/v*/apply.mjs`. Alguns deles sobrescrevem o arquivo de
cliente inteiro a partir de uma cópia fixada dentro de `scripts/`.

Foi esse o caso do [#549](https://github.com/bmedeiros1987/crewcheck/pull/549):
`scripts/v14357/apply.mjs` lê `scripts/v14357/OperationalDayTimeline.tsx` e reescreve
`client/src/components/v14349/OperationalDayTimeline.tsx` por completo. Editar só o arquivo
de cliente deixava o CI verde e a feature desaparecia depois da preparação — e, no sentido
inverso, o estado preparado mascarou uma regressão real na Linha do Dia, restaurando a
implementação rica que a base do PR havia perdido.

## Como validar o estado preparado

1. **Descobrir se o componente é materializado pela cadeia:**

   ```bash
   grep -rn "client/src/components/v14349/OperationalDayTimeline.tsx" scripts/v*/apply.mjs
   ```

   Se houver resultado, existe uma fonte fixada em `scripts/` e ela é a verdade da cadeia.
   Edite a fonte fixada — ou mantenha as duas cópias idênticas — nunca apenas o cliente.

2. **Rodar a cadeia fora da árvore de trabalho**, para que os arquivos materializados não
   entrem no commit (a cadeia deixa dezenas de arquivos modificados):

   ```bash
   git worktree add /tmp/cc-prepared HEAD
   cd /tmp/cc-prepared && npm ci && node scripts/v139/apply.mjs
   git -C /tmp/cc-prepared diff --stat -- client/src/components/...
   ```

3. **Provar fail-before / pass-after no estado preparado**, não na base. A regressão de
   `#548`/`#549` (`scripts/regression-p1-548-dynamic-calendar.mjs`) roda em
   `.github/workflows/atlas-v14357-ui-clarity.yml` **depois** do passo de preparação, e
   afirma que cliente e fonte fixada são byte-idênticos — a divergência falha com mensagem
   nomeada em vez de sumir em silêncio.

4. **Isolar o diff antes de commitar:** conferir `git status` e garantir que só os arquivos
   do refino estão no commit.

## Checklist de aceite

- [ ] tema claro conferido;
- [ ] tema escuro conferido;
- [ ] mobile estreito (360 px) sem overflow;
- [ ] tablet e desktop sem virar outra identidade;
- [ ] foco visível e navegação por teclado preservados;
- [ ] nenhum token de tema substituído por valor hardcoded;
- [ ] `position`, `z-index`, `overflow`, `sticky`/`fixed` inalterados ou justificados;
- [ ] estrutura, textos, ícones, handlers e navegação inalterados;
- [ ] estado preparado validado quando o componente é materializado pela cadeia;
- [ ] `npx tsc --noEmit` limpo e build Web de produção passando.
