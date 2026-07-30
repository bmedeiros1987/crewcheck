# CrewCheck — roadmap ativo de correções

## Estratégia vigente

A execução segue **Web/Render e PWA primeiro**. APK/AAB assinados, compartilhamento nativo, notificações em segundo plano, deep links e publicação Android permanecem adiados até a estabilidade funcional da Web/PWA.

Durante a auditoria, não entram funcionalidades novas: cada superfície existente deve ser validada, corrigida ou temporariamente ocultada.

## Estado atual

- **v14.3.45:** parser do CrewRosterReport rotacionado validado estruturalmente com a escala oficial de agosto de 2026.
- **v14.3.46–v14.3.48:** localização fresca, aeroporto operacional da Saída Inteligente e vozes independentes de Daniel e Bruno publicados.
- **v14.3.49–v14.3.55:** classificação operacional única, App Shell, Google Maps, FlyDeck Premium, Concierge e origem de localização confiável integrados pela PR `#209`.
- **GitHub Actions:** TypeScript, build Web, testes do servidor, regressões funcionais e validação CrewRoster concluídos com sucesso no head integrado.
- **Render:** build e deploy da `main` concluídos com sucesso após o merge da PR `#209`.

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
