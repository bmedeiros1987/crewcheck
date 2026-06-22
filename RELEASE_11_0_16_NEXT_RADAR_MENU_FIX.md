# CrewCheck v11.0.16 — Próxima programação por trecho, radar no fuso do sistema e menu persistente

## Correções principais

- Cockpit/Programação a seguir agora avança por trecho de voo, não fica preso no primeiro voo do dia inteiro.
- Se o radar privado marcar o voo como pousado/finalizado, o Cockpit passa a buscar o próximo trecho/programação.
- Radar passa a enviar o fuso escolhido do usuário ao backend e o backend converte horários ISO/UTC para o fuso do sistema, com padrão Brasília/BSB.
- Tela de escala passa a manter o menu inferior móvel de forma persistente, inclusive quando o modo app não for detectado.
- Mensagens técnicas de agenda automática deixam de exibir `Invalid time value` ao usuário.

## Validação

- `npm run check`
- `npm run build`

## Android

- versionName: 11.0.16
- versionCode: 11016
