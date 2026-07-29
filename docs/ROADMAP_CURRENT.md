# CrewCheck — roadmap ativo de correções

## Estratégia vigente

A execução segue **Web/Render e PWA primeiro**. APK/AAB assinados, compartilhamento nativo, notificações em segundo plano, deep links e publicação Android permanecem adiados até a estabilidade funcional da Web/PWA.

Durante a auditoria, não entram funcionalidades novas: cada superfície existente deve ser validada, corrigida ou temporariamente ocultada.

## Estado atual

- **v14.3.45:** parser do CrewRosterReport rotacionado validado estruturalmente com a escala oficial de agosto de 2026.
- **v14.3.46:** política de localização fresca Web/Telegram e correção do preparo de fonte no Render publicadas.
- **v14.3.47:** aeroporto operacional da Saída Inteligente publicado no Render; atividades MCK usam `CGH` sem alterar a base contratual `BSB`.
- Itens estruturais continuam sem aprovação funcional até existir evidência em ambiente real.

## Próxima entrega — v14.3.48

A próxima entrega separa as **vozes ElevenLabs de Daniel e Bruno** sem alterar a voz atual do Daniel.

Escopo obrigatório:

- preservar `ELEVENLABS_VOICE_ID` como Daniel/default;
- selecionar Bruno por `ELEVENLABS_TTS_VOICE_ID=pNZa0DWwl4bXevTwyjr0`;
- aceitar `speaker`, `persona` e `voiceProfile`, sem permitir Voice ID arbitrário no endpoint público;
- preservar as variáveis genéricas como fallback e aceitar aliases dedicados opcionais;
- publicar catálogo e health somente com perfis lógicos, sem expor Voice IDs;
- aplicar `v14.3.48` depois de `v14.3.47`, sem alterar STT, escala ou Saída Inteligente.

## Gates da v14.3.48

### Antes do merge

1. O preparo canônico deve executar `v14.3.47` e depois `v14.3.48`.
2. A aplicação do patch final deve passar duas vezes sem alteração adicional.
3. As regressões de v14.3.34 a v14.3.47 devem continuar passando.
4. A nova regressão deve comprovar Daniel/default preservado, Bruno atualizado, aliases lógicos, fallbacks, catálogo privado e bloqueio de Voice ID arbitrário.
5. TypeScript, build Web, testes do servidor e integração STT devem concluir sem regressão.

### Após o deploy no Render

1. O preparo de fonte e o build devem concluir sem erro.
2. Cliente, endpoint de saúde, `release.json` e cache da PWA devem anunciar `14.3.48`.
3. `/api/tts/health` deve mostrar Daniel/default e Bruno como perfis distintos, sem expor seus Voice IDs.
4. Uma resposta de Daniel deve manter a voz atual e uma resposta de Bruno deve usar `pNZa0DWwl4bXevTwyjr0`.
5. A configuração atual do Render deve permanecer com 300 variáveis, sem apagar ou substituir qualquer valor para abrir novas vagas.

## Gates seguintes da auditoria Web/PWA

Após a v14.3.48:

1. validar um CrewRosterReport oficial não rotacionado;
2. comparar FlyDeck, Escala e Histórico e confirmar a mesma programação canônica;
3. validar Saída Inteligente para voo, reserva, sobreaviso, treinamento e fora de base;
4. avançar para hotel/pernoite, Concierge, Radar, Meteorologia, financeiro, conta e integrações;
5. executar a matriz responsiva em 360 px, 412 px, tablet e desktop.

Android permanece adiado até esses gates Web/PWA estarem aprovados com evidência registrada.
