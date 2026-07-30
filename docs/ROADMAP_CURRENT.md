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

## Gates seguintes da auditoria Web/PWA

Após a consistência FlyDeck × Escala × Histórico:

1. validar Saída Inteligente para voo, reserva, sobreaviso, treinamento e fora de base;
2. validar hotel/pernoite e origem atual sem reaproveitar cidade legada;
3. validar Concierge, Radar e Meteorologia com a mesma próxima programação;
4. avançar para regulamentação, financeiro, conta e integrações;
5. executar a matriz responsiva em 360 px, 412 px, tablet e desktop, nos temas claro e escuro.

Android permanece adiado até esses gates Web/PWA estarem aprovados com evidência registrada.
