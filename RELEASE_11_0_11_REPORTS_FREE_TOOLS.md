# CrewCheck v11.0.11 — Relatórios inteligentes e ferramentas grátis

## Objetivo
Melhorar o módulo de relatórios de bordo e alinhar a estratégia comercial: tudo que não depende de API paga fica disponível na versão grátis; o Premium sustenta APIs, servidores, suporte e integrações externas.

## Implementado
- Relatórios de Bordo agora selecionam automaticamente o voo atual comparando horário da escala, apresentação, decolagem, pouso e janela pós-pouso.
- Botão “Voo atual” para reativar seleção automática pelo horário.
- Status visual do voo no relatório: A seguir, Pré-voo, Em voo, Pós-pouso ou Finalizado.
- Assistências de desembarque ampliadas: MAAS, WCH, WCHR, WCHS, WCHC, BLND, DEAF, MEDA, menores e cadeiras no desembarque.
- Alerta de pouso por geolocalização no relatório: quando o app estiver aberto e o usuário estiver próximo ao aeroporto de destino, notifica as assistências preenchidas.
- Pouso pode ser marcado automaticamente quando o GPS detecta proximidade do destino dentro da janela de chegada.
- Comparativo de planos atualizado: recursos locais e sem API paga aparecem como grátis; Premium fica associado a custos reais de API, servidor, suporte e integrações.
- Menu rápido atualizado para não marcar Chefe de Cabine, Checklist Médico e Vivo local como Premium.

## Observações
- O alerta por GPS depende de permissão de localização/notificação e funciona quando o app/PWA/WebView estiver ativo ou com suporte nativo disponível.
- Não substitui o relatório oficial da companhia nem a confirmação operacional.

## Versão Android
- versionName: 11.0.11
- versionCode: 11011
