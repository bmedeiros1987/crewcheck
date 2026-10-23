# Proteção de tela — prévia 0.1.3

## Escopo e limites

Camada de apresentação local, compartilhada pelo player de TV. Não altera autenticação, parser, APZ, escala, banco, ambiente Render nem gates #530/#607. Reduz tempo de exposição estática, mas NÃO oferece garantia de prevenção ou reparo de burn-in. Uma animação localizada (clima/ticker) não muda os pixels da logo, barras e cards fixos. Shift de poucos pixels é mitigação limitada, não solução para áreas grandes.

O modelo informado pelo usuário, LG 55SM9000PSA, é NanoCell IPS, não OLED (especificações oficiais LG). Mesmo assim evitar padrão fixo prolongado/brilho máximo; a experiência de varejo não deve prometer operação de sinalização 24/7 em uma TV doméstica.

## Comportamento implementado

Configurações > Proteção de tela. Padrão: 5 min sem teclado/controle/clique/scroll -> pausa preta com relógio discreto reposicionado a cada 30 s; 15 min -> fundo preto sem texto nem logo. Perfis selecionáveis 2/5 min (OLED) e 15/30 min (leitura). Prazos são decisões de produto, não intervalos garantidos pelos fabricantes. Sem opção de desativar a pausa nesta prévia.

Enquanto o painel está ativo, pequenos deslocamentos globais de até 4 CSS pixels a cada 2 min, respeitando margens e interrompendo durante navegação. Isso desloca logo/menu/cards juntos, não apenas o relógio. Com movimento Desligado ou redução de movimento do sistema, não desloca e vai direto ao fundo preto no primeiro prazo de pausa. Não altera fisicamente o brilho ou desligamento/backlight da TV.

Nenhum bloqueio da proteção nativa da TV, wake lock, vídeo invisível, input artificial ou API privada de painel. O protetor do fabricante pode surgir antes do nosso e deve permanecer habilitado. Não é pixel cleaning. Não confundir tema escuro com standby. Configurar suspensão da própria TV para períodos sem uso e não confiar nesta superfície como alarme operacional.

O primeiro OK/seta/Voltar/clique acorda sem acionar botão oculto. Dados da jornada são retirados visualmente durante a pausa e cache continua sujeito à sua política existente. Atualização de relógio/snapshot/notícias não reinicia a inatividade. App oculto pausa animações e verifica tempo ao retomar, inclusive após suspensão/ajuste de relógio. Não esmaecer o painel operacional (preserva correção de opacidade).

## Validação

Testes de política, limites de tempo, áreas seguras, redução de movimento e guarda do código via scripts/tv-screen-care-test.mjs. Pipeline gera demo 0.1.3 separada do piloto real e de loja. Testes de navegador do pacote não certificam Chromium 53, software LG, persistência/consumo/brilho do painel ou eficácia anti-burn-in. Exige execução física antes de release. Não habilita o vínculo real ainda bloqueado no Render; o destino “CrewCheck 2” precisa de identificação exata.

## Fontes oficiais consultadas em 18/09/2026

- https://www.lg.com/cac/tv-y-barras-de-sonido/lg-55SM9000PSA — NanoCell/IPS.
- https://www.lg.com/us/experience-tvs/oled-tv/reliability — conteúdo estático, brilho, screen shift e proteções.
- https://www.lg.com/ca_en/tv-soundbars/oled/oled65c4pua/ — pixel cleaning reduz mas não elimina o risco de burn-in.
- https://forum.webostv.developer.lge.com/t/request-for-guidance-to-prevent-app-from-entering-idle-screen-saver-mode-on-webos/28089 — resposta oficial sobre protetor nativo e sinalização comercial.
