# Home: próximo voo e reserva — revisão de apresentação

Base: `6269b5100a5db25fbcd90696747cd95829221795` (main confirmado pelo conector GitHub em 22/10/2026).

## Escopo e ownership

Checkout isolado criado a partir dos objetos locais do mesmo remoto `bmedeiros1987/crewcheck`, sem copiar alterações não commitadas. Nenhum AGENTS.md ou CODEOWNERS foi encontrado nos caminhos aplicáveis/arquivos rastreados. Foram conferidas as listas completas de arquivos dos 83 PRs abertos: apenas #1032 sobrepõe os arquivos de próximo voo; ela é a composição de evidência explicitamente marcada NÃO INTEGRAR, com a versão histórica inteira adicionada ao diff. Não é evidência de um owner Visual Guard ativo. #1198 (Radar), #919 (footer), #1200 (financeiro) e #1201 (segurança) não sobrepõem os quatro arquivos alterados. Não há mudança em Home.tsx, motores, horários, identidade, seleção, manifests, gates ou workflows.

A referência privada 118653.jpg foi materializada pela Library no próprio executor e seus pixels foram inspecionados antes da implementação. A referência real não faz parte deste commit nem do PR. Todas as imagens abaixo e todos os testes usam apenas fixtures sintéticas.

## Comportamento

- Próximo voo: identidade/data e rota acima da grade Partida/Portão/Status. Portão e status ausentes continuam independentes. A ausência não repete duas explicações adicionais de não confirmação. Fonte manual, desatualização, conflitos e vínculo pendente permanecem visíveis; autoria e proveniência completas ficam nos detalhes, acessíveis por teclado.
- Reserva/jornada: título e duração, data/base e grade de início/liberação/fuso. Execução não confirmada e limite pendente continuam visíveis. Programação e motivos completos ficam em details nativo. A calculadora usa uma linha de ação de largura integral abaixo do conteúdo, com o mesmo onOpen.
- A semântica exportada de gateSourceLabel, openCanonicalDutyDetails, onOpen e os estilos cc-manual-gate/cc-gate-review permanecem preservados. Nenhum amarelo/âmbar foi introduzido.

## Validação e limites

- npm run check (preparação canônica e TypeScript) e npm run build (build canônico, ativos OCR públicos fixados/verificados).
- regression-canonical-duty-card-browser.mjs: seis casos de componente, temas, identidade de navegação e estado incompleto. A asserção de frase única foi substituída por asserções dos campos separados da grade; a programação continua obrigatória nos detalhes.
- regression-canonical-duty-home-browser.cjs: Home real compilada, 320/360/390/1440, claro/escuro e alteração real pelo Settings100/200%. São 16 combinações para jornada/Próximo voo e outras16 para reserva. As APIs são interceptadas. Jornada incompleta continua pendente.
- regression-home-flight-duty-layout-browser.mjs:128 combinações de largura/tema/tamanho/estado usando cards, hooks e storage reais com CSS de produção. Portão/status independentes, manual/divergência, conflito, stale, vínculo pendente e reserva incompleta. Enter/Space/Tab, foco visível, alvos mínimos, largura disponível da grade e medição de clipping por caractere.32 screenshots sintéticos.
- regression-next-flight-gate.mjs; regression-next-flight-gate-prepared.mjs; regression-next-flight-gate-pulse-browser.mjs; regression-manual-gate-review-browser.mjs; regression-v14-3-86-flydeck-duty-limit.mjs.
- Revisão local de diff: sem alterações de motor/seleção/identidade; função exportada e bloco CSS manual comparados com a base. A inspeção visual encontrou o estreitamento causado pela cascata global de botão; o grid agora define sua coluna e alongamento explicitamente e o teste mede a largura real.

A fonte200% permite crescimento vertical sem cortar texto. Não houve validação em aparelho físico, merge, deploy, uso de dados reais, serviços pagos ou alteração de credenciais/permissões. O teste de quick-roster que substitui NextFlight por null não é usado como prova deste card.

## Evidência visual sintética

![Próximo voo:390px, escuro,100%](home-flight-duty-layout-20261022/390-dark-flight.png)

![Reserva:390px, escuro,100%](home-flight-duty-layout-20261022/390-dark-reserve.png)

![Próximo voo:320px, claro,200%](home-flight-duty-layout-20261022/320-light-200-flight.png)

![Reserva:320px, claro,200%](home-flight-duty-layout-20261022/320-light-200-reserve.png)
