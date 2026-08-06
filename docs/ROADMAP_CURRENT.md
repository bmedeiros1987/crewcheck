# CrewCheck — roadmap ativo de correções

## Estratégia vigente

A execução segue **Web/Render e PWA primeiro**. APK/AAB assinados, compartilhamento nativo, notificações em segundo plano, deep links e publicação Android permanecem adiados até a estabilidade funcional da Web/PWA.

Durante a auditoria, não entram funcionalidades novas: cada superfície existente deve ser validada, corrigida ou temporariamente ocultada.

## Estado atual

- **v14.3.45:** parser do CrewRosterReport rotacionado validado estruturalmente com a escala oficial de agosto de 2026.
- **v14.3.46–v14.3.48:** localização fresca, aeroporto operacional da Saída Inteligente e vozes independentes de Daniel e Bruno publicados.
- **v14.3.49–v14.3.55:** classificação operacional única, App Shell, Google Maps, FlyDeck Premium, Concierge e origem de localização confiável integrados pela PR `#209`.
- **v14.3.56:** laboratório AutoPull do iFlight integrado com acesso exclusivo do administrador e kill switch desligado até autorização formal.
- **GitHub Actions:** voltou a executar TypeScript, build Web, regressões e validação CrewRoster. Falhas remanescentes devem ser tratadas como diagnóstico real, e não como falta de créditos.
- **Render:** build e deploy da `main` concluídos após os lotes da P0; cada nova versão permanece condicionada aos gates automatizados e à validação visual.
- **v14.3.82–v14.3.87:** hidratação da escala ativa, identidade operacional do Radar, elegibilidade da Saída Inteligente, disposição auditável de alertas, limite regulamentar no FlyDeck e cabeçalho global entregues na PR `#308`.
- **v14.3.84 / PR `#320`:** correção do CC-0001 para contar `DO` formal de aproximadamente 24 h iniciado após jornada no mesmo dia civil, com regressão `9 + 1 = 10` e sem alteração de parser/continuidade/financeiro.
- **v14.3.85 / PR `#321`:** correção financeira do CC-0001 para Reserva acionada: crédito da Reserva termina no primeiro voo dentro da janela publicada, preservando a jornada regulatória.

## Prioridade imediata — primeiro ticket real de suporte CC-0001 (`#263`)

O CC-0001 permanece acima do lote visual e de melhorias não críticas até cumprir o fluxo obrigatório `relatado → reproduzido → corrigido → regressão verde → produção → validado → Tácio notificado → resolvido`.

### Folgas (`#225`)

- causa reproduzida: `DO` formal pode começar depois de uma jornada no mesmo dia civil e ficar visível na escala sem entrar na métrica mensal;
- correção mesclada na PR `#320`;
- regressão dedicada confirma o caso `9 → 10 folgas`;
- pendente: confirmar a versão em produção e validar o caso real antes de fechar.

### Reserva (`#250`)

- causa reproduzida no caso de Reserva acionada: a camada financeira somava a janela publicada inteira, mesmo quando o primeiro voo começava antes do fim da Reserva;
- correção mesclada na PR `#321`;
- fixture protegida: Reserva `06:05–12:05`, primeiro voo `06:53`, crédito financeiro `0,8 h`; sem acionamento permanece `6 h`;
- a janela regulatória da Reserva não é encurtada pela regra financeira;
- pendente: confirmar produção e caso real.

### KM (`#250`)

- não usar distância geográfica/Google Maps como se fosse automaticamente quilometragem remunerável;
- a remuneração da empresa usa critérios/tabela de quilômetros por trecho; a distância operacional pode ser diferente da quantidade usada no demonstrativo;
- a divergência observada no CC-0001 preserva um mesmo fator entre os quatro componentes, portanto não deve ser corrigida com quatro tarifas independentes nem com divisão fixa sem fonte;
- manter segregação estrita por função: valores de CMTE não podem ser aplicados a FO/CP, CCM ou comissários;
- próximo passo: separar `distância operacional` de `KM remunerável`, admitir somente fonte financeira confiável/tabela auditável para o cálculo salarial e manter fallback explícito como estimativa quando a tabela de remuneração não estiver disponível;
- fechar somente após regressão específica, produção e conferência com o caso real.

Enquanto o CC-0001 estiver pendente, o lote visual pode receber manutenção indispensável, mas não volta a ser a prioridade principal.

## Próximo lote — sistema visual unificado v14.3.88–v14.3.90

A padronização visual passa a ser um gate formal do roadmap, e não uma coleção de correções isoladas por tela. O contrato completo está em `docs/V14_3_88_VISUAL_STANDARDIZATION_ROADMAP.md`.

### v14.3.88 — fundação visual

- consolidar tokens de cor, tipografia, espaçamento, raio, borda, sombra, largura e camadas;
- manter o cabeçalho global fixo em todos os sistemas internos;
- definir uma grade responsiva única para celular, tablet e desktop;
- padronizar estados de botão, foco, hover, carregamento, vazio, erro e indisponibilidade;
- definir movimento curto, estável e compatível com `prefers-reduced-motion`;
- impedir deslocamento de conteúdo ou botão ao passar o mouse.

### v14.3.89 — superfícies operacionais prioritárias

- migrar FlyDeck, Próxima Programação, Linha do Dia, Escala, Saída Inteligente, Alertas e Menu;
- ordenar informação por cronologia, segurança operacional e prioridade configurada pelo usuário;
- manter regulamentação e limites operacionais visíveis no ponto de decisão, sem competir com o próximo compromisso;
- remover repetição, espaços vazios excessivos, mensagens técnicas e componentes visualmente divergentes;
- usar navegação inferior somente quando o espaço e o dispositivo justificarem.

### v14.3.90 — cobertura e auditoria final

- migrar os demais sistemas internos para os mesmos componentes e tokens;
- validar temas claro e escuro em 360 px, 390/412 px, tablet e desktop;
- verificar teclado, foco visível, contraste, redução de movimento e zoom;
- adicionar regressões visuais dos fluxos críticos e inventário de exceções temporárias;
- impedir aprovação enquanto houver tela interna com cabeçalho, largura, botões ou estados fora do padrão sem justificativa registrada.

Restrições do lote: nenhuma mudança visual pode alterar parser, fingerprint, escala ativa, identidade de atividade, cronologia canônica, regulamentação, financeiro ou sincronização multicanal. Web, PWA, APK e Telegram continuam consumindo a mesma verdade operacional.

Critério de saída: TypeScript, build Web, regressões funcionais e visuais aprovados, mais conferência em desktop, celular e tablet. Teste manual só será solicitado depois de build/deploy estável.

## Evidência funcional — CrewRosterReport normal

O primeiro gate funcional após a P0 foi executado localmente com relatórios oficiais reais, sem versionar PDFs nem dados pessoais.

Relatório normal de referência:

- período publicado: julho de 2026;
- 32 atividades em 30 datas únicas;
- 40 etapas de voo reconhecidas;
- FH `66:05` e DH `129:28`, iguais ao cabeçalho oficial;
- confiança alta no parser do servidor;
- continuidade entre jornadas, viradas `(+1)`, carry-in, carry-out, ASB, HSB, folgas e descansos conferidos visualmente.

A bateria histórica continha 68 PDFs oficiais de 2025–2026. O fallback de período recuperou os formatos normais; o único formato separado foi o CrewRosterReport rotacionado de agosto de 2026, já coberto pela regressão específica da v14.3.45 e pelos workflows aprovados.

Nenhum PDF, nome, matrícula, rota pessoal completa ou outro dado identificável deve ser adicionado ao repositório. Fixtures futuras devem permanecer sintéticas ou anonimizadas.

## Gate em execução — clareza operacional e padrão visual v14.3.57

As capturas reais do FlyDeck mostraram que uma cronologia tecnicamente correta ainda pode exigir interpretação excessiva do usuário. O lote v14.3.57 prioriza familiaridade e decisão rápida, sem alterar o motor canônico.

### Linha do Dia

- mostrar **Agora** e **Próximo compromisso** antes da cronologia;
- traduzir códigos comuns, como `HSB` para **Sobreaviso** e `ASB` para **Reserva**;
- destacar o item atual e o próximo;
- remover repetições como `A confirmar · A confirmar`;
- oferecer ações diretas para Escala, Radar ou Hotel;
- manter ordem cronológica, Folga, Repouso, Pernoite e limite visual de eventos.

### Próxima programação

- reduzir altura e espaços vazios;
- manter apenas data, atividade, local, horários essenciais e estado;
- enfatizar a ação principal;
- não repetir a Linha do Dia;
- não oferecer Saída Inteligente para atividades inelegíveis.

### Login

- usar um cartão compacto e central, baseado em padrões familiares de autenticação, sem copiar identidade de terceiros;
- reduzir título, marca e instruções;
- remover caixas aninhadas dos campos;
- preservar cadastro, recuperação, demonstração, termos e acessibilidade;
- cobrir integralmente os temas claro e escuro.

### Padrão visual

- FlyDeck e Linha do Dia com a mesma largura de conteúdo;
- espaçamentos, bordas, raios e tipografia coerentes;
- navegação inferior somente em telas móveis;
- nenhuma alteração em parser, continuidade, financeiro ou regulamentação.

O gate v14.3.57 somente será aprovado após TypeScript, build Web, regressões v14.3.47/v14.3.48/v14.3.57, teste do servidor e conferência visual em desktop, celular e tablet.

## Próximo gate — consistência da programação canônica

Comparar o mesmo relatório importado nas três superfícies de produção:

1. FlyDeck;
2. Escala;
3. Histórico.

A comparação deve confirmar, para cada atividade:

- mesma data operacional;
- mesmo tipo de atividade;
- mesmos horários de apresentação, partida/início, chegada/fim e debrief;
- mesma origem e destino;
- mesma continuidade em viradas de meia-noite e entre meses;
- HSB, ASB, folga e descanso sem conversão indevida em voo.

O gate somente será marcado como aprovado após evidência de uso real no Web/PWA.

## Gate futuro — Concierge com paridade temporal da programação

O Concierge deve consumir a mesma programação canônica do FlyDeck/Escala e nunca transformar ausência de voo em “escala em branco” quando houver folga/descanso publicado.

Critérios obrigatórios:

- pergunta como **“O que eu tenho hoje?”** deve responder `Folga`/`Descanso` quando essa for a atividade oficial do dia, e somente usar “programação em branco” quando realmente não existir atividade publicada para a data;
- `DO`, `DOF`, `DOP` e demais folgas válidas permanecem distintos de ausência de programação; `ASB` permanece Reserva e `HSB` permanece Sobreaviso;
- qualquer programação que não seja de hoje deve trazer a **data explícita** antes de horários, voo ou Saída Inteligente;
- nunca dizer apenas “na próxima programação, apresentação às...” quando a programação for de amanhã ou de outra data;
- Saída Inteligente narrada pelo Concierge deve dizer, por exemplo, “para a programação de sábado, 8 de agosto, saia...” e não soar como instrução para sair hoje;
- respostas em texto e áudio devem usar a mesma data operacional, horários, origem/destino e classificação da Escala;
- manter o aviso de segurança de que a escala oficial e as comunicações da empresa prevalecem em caso de divergência;
- regressões devem cobrir: hoje em folga, hoje em Reserva, hoje em Sobreaviso, dia realmente em branco, próxima programação amanhã e próxima programação em data posterior.

## Gate futuro — compartilhamento de PDF com o PWA

Registrar o CrewCheck PWA como destino de compartilhamento e abertura de arquivos PDF no Android, sem depender exclusivamente do APK.

Escopo mínimo:

- declarar `share_target` no Web App Manifest com suporte a `application/pdf`;
- criar uma rota dedicada para receber arquivos compartilhados;
- encaminhar o PDF recebido ao mesmo fluxo canônico de importação já utilizado dentro do CrewCheck;
- impedir importação duplicada ao reabrir ou recarregar o PWA;
- apresentar mensagem clara quando o arquivo não for uma escala compatível;
- validar reinstalação/atualização do PWA, pois o Android registra essa capacidade na instalação;
- testar em PWA instalado no Android e comparar o resultado com a importação manual e com o APK.

Critérios de aceite:

- o PWA aparece na folha **Compartilhar** e em **Abrir com** para arquivos PDF compatíveis onde a plataforma oferecer suporte;
- o mesmo PDF produz exatamente a mesma escala na importação manual, via compartilhamento PWA e via APK;
- nenhuma alteração em parser, normalização canônica, regulamentação ou financeiro;
- tratamento separado do incidente P0 `#290`, já validado quanto à integridade de datas.

## Requisito transversal — compatibilidade entre navegadores e dispositivos

A importação, o processamento offline e a sincronização de dados tratados devem funcionar com degradação segura em Android, iPhone, iPad e navegadores desktop, sem depender de uma única API proprietária.

Matriz mínima obrigatória:

- Android: Chrome, Edge, Samsung Internet, PWA instalado e APK;
- Apple: Safari no iPhone e iPad, PWA adicionado à Tela de Início e navegador comum;
- desktop: Chrome, Edge, Safari e Firefox;
- tamanhos de tela: celular, tablet e desktop.

Estratégia de compatibilidade:

- processamento local do PDF como caminho principal, preferencialmente em Web Worker;
- IndexedDB para escala tratada, fila de sincronização e cache versionado;
- sincronização com o banco somente do JSON canônico e de metadados mínimos;
- nunca exigir `share_target` para o funcionamento básico;
- quando a plataforma não permitir receber PDF pela folha de compartilhamento, oferecer seletor de arquivo, arrastar e soltar e importação pelo botão interno;
- quando Web Worker, IndexedDB persistente ou outra capacidade não estiver disponível, usar fallback controlado sem travar a interface;
- detectar capacidades em tempo de execução, e não por identificação fixa do navegador;
- manter o mesmo parser e o mesmo schema canônico em todas as superfícies;
- preservar a escala local quando a rede cair e sincronizar quando a conexão retornar;
- resolver conflitos por fingerprint, versão do parser, versão do schema e `updatedAt`, sem duplicar atividades;
- não armazenar o PDF original no banco nem enviá-lo ao Render por padrão.

Critérios de aceite multiplataforma:

- importar o mesmo PDF manualmente em Android, iPhone/iPad e desktop produz o mesmo fingerprint e os mesmos eventos;
- o Android instalado recebe PDF pelo compartilhamento quando suportado;
- iPhone/iPad continuam plenamente funcionais por importação manual mesmo que o sistema não registre o PWA como destino de arquivos;
- o usuário consegue consultar a escala offline em todas as plataformas suportadas;
- dados tratados sincronizam entre dispositivos após autenticação, sem envio do PDF original;
- nenhum navegador suportado fica sem caminho alternativo para importar a escala;
- testes automatizados cobrem schema, deduplicação, fila offline e compatibilidade do parser;
- testes manuais cobrem pelo menos um dispositivo Android, um iPhone/iPad e um desktop antes da aprovação do gate.

Observação: compatibilidade significa oferecer o mesmo resultado funcional com fallback equivalente; não se deve prometer que todos os sistemas operacionais apresentarão o PWA na folha nativa de compartilhamento, pois essa integração depende do suporte do navegador e da plataforma.

## Gates seguintes da auditoria Web/PWA

Após a consistência FlyDeck × Escala × Histórico:

1. validar Saída Inteligente para voo, reserva, sobreaviso, treinamento e fora de base;
2. validar hotel/pernoite e origem atual sem reaproveitar cidade legada;
3. validar Concierge, Radar e Meteorologia com a mesma próxima programação;
4. avançar para regulamentação, financeiro, conta e integrações;
5. executar a matriz responsiva em 360 px, 412 px, tablet e desktop, nos temas claro e escuro.

Android permanece adiado até esses gates Web/PWA estarem aprovados com evidência registrada.
