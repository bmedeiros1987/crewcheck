# CrewCheck: opções de mostrador

Camada visual da #837, filha da #836. Não é navegação por páginas do app CrewWatch.

## Opções implementadas

O editor nativo do mostrador recebe duas preferências, independentes:

- **Visual do mostrador**: Signature (padrão, hora branca forte e card suave), Flight Deck (hora na cor de destaque e card instrumental) e Minimal (hora fina, sem fundo de card).
- **Cor de destaque**: ciano, violeta ou magenta CrewCheck. São nove combinações.

Os seis campos ficam nas mesmas posições em todos os visuais. Nenhum desaparece só porque um estilo foi selecionado. A logo neon permanece a mesma, sem recoloração. As opções não autorizam saúde, não ativam assinatura Premium e não mudam dados, validade, providers ou sincronização. Escolher Flight Deck não declara que há um voo em andamento.

No Galaxy, o caminho esperado é manter o dedo sobre o mostrador, abrir **Personalizar** e escolher **Visual do mostrador** / **Cor de destaque**. O nome exato da ação depende do editor do dispositivo. O seletor de complicações já existente continua permitindo escolher suas fontes de informação. Trocar o visual não deve exigir reinstalação nem configurar os campos novamente.

## Implementação e limites

`UserConfigurations/ListConfiguration` e `ColorConfiguration` do WFF v1; sem `Flavors` (v2+), nova permissão, nova dependência, mudança de pacote ou código executável na face. Seis `ComplicationSlot` únicos, declarados uma única vez no Scene; os perfis contêm apenas relógio e superfície de fundo. O AOD é idêntico em todos: hora fina/data/operação; logo, fundos, saúde, passos, bateria e rotina ocultos.

São opções visuais, não telas deslizantes. As páginas funcionais Agora, Jornada, Alertas, Escala e CrewLife pertencem ao app CrewWatch; Concierge depende do seu contrato funcional. Esta entrega não adiciona essas páginas, não captura gestos do sistema e não considera os testes físicos da #836 concluídos.

## Verificação

Executar `node scripts/regression-watchface-premium-layout.mjs`. Matriz local: 3 visuais × 3 paletas, geometria circular, seis providers/tipos, limites e não sobreposição, regras ativo/AOD, PNG original íntegro, referências do editor e contraste nominal das cores de destaque >=4.5:1. São 68 testes negativos. Isso não é execução do renderer WFF nem teste no pulso. O ajuste automático de texto continua exigindo teste com strings longas e dados ausentes.

Checklist físico: alternar as nove combinações; editar os seis campos e trocar visual sem perder fontes; reiniciar e verificar persistência; conferir 12/24h; verificar AOD em todos; testar valores vazios/longos/stale e mudança de dados pelo celular. Saúde só deve aparecer quando autorizada no fluxo existente.

Sem merge/publicação nesta revisão. CI e validação física ainda são gates.

## Referências oficiais

- https://developer.android.com/training/wearables/wff/personalization/user-configurations
- https://developer.android.com/reference/wear-os/wff/user-configuration/list-configuration
- https://developer.android.com/reference/wear-os/wff/group/configuration/list-configuration
