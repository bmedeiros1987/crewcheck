# DOMPurify 3.4.17 — correção pontual de dependência

Base remota verificada: `6269b5100a5db25fbcd90696747cd95829221795` (2026-10-22). O override transitivo de jsPDF passa de 3.4.16 para 3.4.17. Somente o registro DOMPurify muda no lockfile (versão, URL e integridade); jsPDF continua 4.2.1. Nenhum major upgrade, `audit fix`, dependência nova, código de aplicação, workflow, permissão, credencial, serviço ou canal é alterado.

## Fonte e alcance

A [release oficial 3.4.17](https://github.com/cure53/DOMPurify/releases/tag/3.4.17) e os advisories oficiais atualizados em 2026-10-22 indicam a correção de:

- [GHSA-cg2g-xh64-v4q7](https://github.com/advisories/GHSA-cg2g-xh64-v4q7), crítica: expressões de template fragmentadas em shadow roots, com configuração não padrão.
- [GHSA-mrv2-3pqr-j5jr](https://github.com/advisories/GHSA-mrv2-3pqr-j5jr), alta: subárvores destacadas por hooks IN_PLACE que removem pai ou irmão.
- [GHSA-c6gr-qvv4-5v3f](https://github.com/advisories/GHSA-c6gr-qvv4-5v3f), baixa: atributo SMIL href em parser XHTML e allowlist não padrão.

A auditoria completa existente da #1200 bloqueou nessa dependência. Os manifests da #1200 são idênticos à base; #1198 também não altera dependências. Busca das 81 PRs abertas não encontrou correção DOMPurify duplicada. A correção é separada, preservando os trabalhos dessas PRs.

A exportação de aplicação usa texto/tabelas jsPDF; não foi encontrada configuração DOMPurify IN_PLACE/SAFE_FOR_TEMPLATES nem chamada jsPDF `.html()` nesse caminho. Esta é uma vulnerabilidade da dependência: não há evidência de exploração ou incidente no CrewCheck, nem afirmação de que pré-condições de exploração tenham sido demonstradas.

## Testes e limites

A suíte runtime existente é ampliada sem remover assertions: dez casos de remoção pai/irmão em cinco hooks, seis casos de template em shadow roots simples/aninhadas e guarda SMIL XHTML. Todas são sondas estruturais com jsdom 30.0.1, scripts e recursos externos desabilitados; nenhum handler, template ou animação é executado. O controle negativo opcional exige exatamente DOMPurify 3.4.16 e comprova os mesmos defeitos antes da correção. O controle histórico 3.4.13 para rawtext continua disponível.

O exportReport real é compilado por esbuild e continua fazendo roundtrip PDF/pdfjs para 1 e 80 linhas fictícias (3 e 5 páginas), preservando nome/base/texto. A primeira página de cada PDF é renderizada offline pela canvasFactory do pdfjs e pela dependência Node canvas já presente no lockfile, exigindo conteúdo não branco; não é navegador nem um teste de layout pixel-perfect. O harness antigo lia `public/` em vez de `client/public/` e podia passar através do fallback sem logo; agora exige o PNG aprovado real e um operador de imagem no PDF. Requisições inesperadas falham mesmo se a aplicação capturar o erro. Nenhum dado pessoal é usado.

Comandos de reprodução (fora de navegador e sem lifecycle scripts):

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm install --prefix /tmp/crewcheck-dompurify-dom-qa jsdom@30.0.1 --ignore-scripts --no-audit --no-fund
CREWCHECK_QA_JSDOM_PACKAGE=/tmp/crewcheck-dompurify-dom-qa/package.json node scripts/regression-dependency-runtime-security.mjs
# Opcional: acrescente CREWCHECK_QA_PREVIOUS_DOMPURIFY_PACKAGE=/copia-isolada/node_modules/dompurify/package.json
# apontando a instalação exata 3.4.16; não instale a versão vulnerável no app.
node node_modules/typescript/bin/tsc --noEmit
npm run check
npm run build
npm audit --audit-level=high
```

Node local 24.19.0. `npm ci` e auditoria completa (incluindo desenvolvimento/iOS) passaram; snapshot em 2026-10-22 retornou zero em todas as severidades. Isso não declara encerrados alertas privados Dependabot. A suíte ampliada e a contraprova 3.4.16 passaram em fonte raw e preparada, incluindo renderização PDF real. TypeScript raw, `npm run check`, `npm run build`, share-target PDF e roster-integrity preparados passaram. A rodada final usou fonte congelada em cópias limpas separadas; arquivos gerados não fazem parte do delta. Os modelos OCR públicos existentes foram materializados pelo script oficial com hashes/budget conferidos. CI do SHA publicado permanece pendente e deve ser confirmado no PR. O CI existente já executa o harness antes/depois da preparação e mantém o gate de audit integral.

Não foi iniciado/instalado Chromium local. jsdom e análise PDF não são validação visual em navegador; pixels continuam limitados ao CI oficial existente. Não há merge, deploy ou publicação em loja nesta preparação. Revisão independente, CI terminal do HEAD exato e revalidação da base permanecem gates.
