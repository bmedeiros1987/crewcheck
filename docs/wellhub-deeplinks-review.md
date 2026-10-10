# CrewCierge: ficha e ações da unidade

Base: main 6b4df027b57588ffcbff3f1d6a5e315f0824d7eb (PR993). Escopo separado de Home/pernoites, AIMS, notificações e Play.

A resposta `/academias` mantém cidade/UF, hierarquia de planos, limites de mensagem, condições e aviso de catálogo parcial. A fonte de cada unidade conhecida vira uma ação contextual “Ficha e ações”: entidade text_link nativa no Telegram, link React no aplicativo e HTTPS explícito no WhatsApp. A ficha pública apresenta o mesmo cadastro, uma ação principal Wellhub e Mapa/Uber agrupados. Não exige login nem lê localização, conta ou escala. Unidade desconhecida não substitui por outra cidade. Manutenção global existente continua aplicável.

Não há coordenadas públicas de unidades verificadas no catálogo atual. Portanto TODAS as unidades reais mantêm “Uber · informar destino”, aviso explícito e navegador m.uber.com. O suporte puro a destino preenchido é condicionado a coordenadas públicas revisadas da mesma unidade/cidade/UF/fonte, cadastro e coordenadas frescos e client_id existente válido. Registro atual vazio; não há geocodificação, novas credenciais, chamada de corrida ou origem do usuário. Caso seja habilitado depois com evidência, /looking permite app e há alternativa explícita web. Não se afirma que unidade real já tenha destino preenchido.

Fontes oficiais consultadas em 2026-10-10:
- Uber https://developer.uber.com/docs/riders/ride-requests/tutorials/deep-links/introduction : universal /looking, drop[0] com coordenadas, endereço exibido não substitui coordenadas; root m.uber.com para web. App ausente pode levar à loja; alternativa web explícita. Android pode exibir destino após seleção da origem.
- Google Maps https://developers.google.com/maps/documentation/urls/get-started : HTTPS search com api=1/query público, sem chave; app instalado ou browser. Sem origin.
- Telegram https://core.telegram.org/bots/api#messageentity : text_link e offsets/comprimentos UTF-16. Sem Markdown/HTML, sem linha extra de botões, preserva teclado existente.
- Meta: páginas oficiais de mensagens/CTA retornaram HTTP429 na leitura completa. Não se supõe payload/contrato: preserva sender de texto existente, link HTTPS visível, sem CTA/template/broadcast.
- Wellhub: fichas públicas já aprovadas Greenlife Messejana e Porão Messejana24h consultadas; mapas por busca de endereço, sem evidência de coordenadas. Nenhuma parceria ou plano novo.

O teste do aplicativo realmente compilado expôs TypeError “Illegal invocation” no relógio compartilhado: timers nativos guardados no objeto eram chamados com o receptor errado. Wrappers preservam chamada global dos timers. Testes anteriores com timers simulados não cobriam esse comportamento; novo teste abre a rota real sem sessão em Chromium.

Verificação: helpers e payloads reais materializados isolados com fetch fictício (sem mensagem enviada), UTF-16/emoji/escaping, fonte desconhecida, URLs inseguras, destino stale/futuro/outra unidade/cidade/UF/fonte, nenhum pickup; API pública GET/404/405; catálogo real todo manual. Regressões de orçamento DF/Fortaleza, cidade, plano e localização continuam. Browser: aplicativo compilado em servidor local, 320px/150%-200%/viewport430 claro-escuro, header fixo/primeiro e último alcançáveis, ausência de overflow, uma ação primária, agrupamento, erro desconhecido e nenhum cookie/Authorization no fetch da ficha. Rede externa e métodos não GET abortados; nenhum link externo clicado. Viewport reduzido é simulação, não teclado físico nem validação dos aplicativos externos.

Build pode emitir avisos pré-existentes de bundles grandes. Rota pública usa catálogo estático como fallback offline quando API indisponível, mantendo data e aviso honesto. Publicação depende de revisão independente e CI terminal do HEAD exato; sem merge antecipado.
