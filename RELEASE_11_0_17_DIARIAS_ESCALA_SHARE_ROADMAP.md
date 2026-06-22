# CrewCheck v11.0.17 — Diárias fora de base, escala no dia correto e base para comparação

## Correções

- Diárias na tela de escala agora consideram pernoite/inativo fora da base contratual.
- Pernoite fora de base gera almoço e jantar quando não for base virtual nem pernoite dirigido.
- Ceia continua restrita a voo/reserva/jornada ativa entre 00:00 e 01:00.
- Café não é gerado por pernoite puro.
- Correção da leitura de aeroporto em textos como "Chegada em MAB" e "fim de jornada".
- Cards de Diárias e Ganhos alinhados lado a lado no mobile e desktop.
- Ao abrir a escala, o app tenta focar no evento em andamento, próximo evento do dia, próximo evento futuro ou último evento útil.

## Estratégia

- A comparação de escala e análise de troca entre tripulantes foi documentada como próximo módulo: exige backend, consentimento do usuário, privacidade e regras regulatórias.
- iFlight segue restrito ao fluxo admin/autorizado. O app não deve burlar 403/SSO; o melhor caminho comercial é captura assistida após login oficial ou integração autorizada.

## Android

- versionName: 11.0.17
- versionCode: 11017
