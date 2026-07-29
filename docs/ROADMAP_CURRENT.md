# CrewCheck — roadmap ativo de correções

## Estratégia vigente

A execução segue **Web/Render e PWA primeiro**. APK/AAB assinados, compartilhamento nativo, notificações em segundo plano, deep links e publicação Android permanecem adiados até a estabilidade funcional da Web/PWA.

Durante a auditoria, não entram funcionalidades novas: cada superfície existente deve ser validada, corrigida ou temporariamente ocultada.

## Estado atual

- **v14.3.45:** parser do CrewRosterReport rotacionado validado estruturalmente com a escala oficial de agosto de 2026.
- **v14.3.46:** política de localização fresca Web/Telegram e correção do preparo de fonte no Render publicadas.
- Itens estruturais continuam sem aprovação funcional até existir evidência em ambiente real.

## Próxima entrega — v14.3.47

A próxima entrega corrige o **aeroporto operacional da Saída Inteligente**, originalmente preparado no PR #198.

Escopo obrigatório:

- separar o aeroporto operacional da base contratual;
- preservar `CGH` como aeroporto operacional das atividades MCK sem alterar a base `BSB`;
- entregar esse aeroporto ao evento canônico, à projeção Web e à Saída Inteligente;
- manter origens de voos, horários, folgas e repousos inalterados;
- aplicar `v14.3.47` depois de `v14.3.46`, sem reutilizar ou sobrescrever o patch de localização.

## Gates da v14.3.47

### Antes do merge

1. O preparo canônico deve executar `v14.3.46` e depois `v14.3.47`.
2. A aplicação do patch deve passar duas vezes sem alteração adicional.
3. As regressões de v14.3.45 e v14.3.46 devem continuar passando.
4. A nova regressão deve comprovar:
   - duas MCK em 07/08;
   - aeroporto operacional `CGH`;
   - base contratual `BSB`;
   - horários `09:00–13:00` e `14:00–18:00`;
   - origens dos voos e exclusões de folga/repouso preservadas.
5. Build e validação automatizada devem concluir sem erro.

### Após o deploy no Render

1. O preparo de fonte e o build devem concluir sem erro.
2. Cliente, endpoint de saúde, `release.json` e cache da PWA devem anunciar `14.3.47`.
3. Em uso real, a Saída Inteligente de uma MCK em CGH deve calcular a rota para CGH, nunca para a base contratual BSB.
4. Recarregar ou atualizar a PWA não pode restaurar a versão ou o aeroporto anterior.
5. Nenhuma escala, voo, atividade ou alerta pode ser perdido ou duplicado.

## Gates seguintes da auditoria Web/PWA

Após a v14.3.47:

1. validar um CrewRosterReport oficial não rotacionado;
2. comparar FlyDeck, Escala e Histórico e confirmar a mesma programação canônica;
3. validar Saída Inteligente para voo, reserva, sobreaviso, treinamento e fora de base;
4. avançar para hotel/pernoite, Concierge, Radar, Meteorologia, financeiro, conta e integrações;
5. executar a matriz responsiva em 360 px, 412 px, tablet e desktop.

Android permanece adiado até esses gates Web/PWA estarem aprovados com evidência registrada.
