# CrewCheck v11.0.87 — Regulamentação RBAC 117 e Concierge regulatório Premium

Esta versão adiciona um menu completo de **Regulamentação** para consulta operacional, cálculos de jornada, sobreaviso, reserva, repouso e alertas vinculados à escala, sem remover os recursos de Concierge, histórico e voz das versões anteriores.

## Principais melhorias

- Novo menu **Regulamentação** no sistema.
- Calculadora de **limite de jornada** por tipo de tripulação e perfil operacional.
- Calculadora de **sobreaviso**, incluindo cenário com acionamento.
- Calculadora de **reserva**, incluindo apresentação e duração.
- Calculadora de **descanso mínimo/repouso** após jornada.
- Aba **Minha escala** com alertas regulatórios ligados à escala importada.
- Cards da escala mais clicáveis, com indicação visual de abrir detalhes.
- Detalhes dos cards agora mostram bloco de **Regulamentação** contextual.
- Concierge Telegram passa a responder dúvidas de regulamentação por texto ou voz.
- Novos comandos e perguntas naturais: `/regulamentacao`, “qual meu descanso mínimo?”, “limite de sobreaviso”, “tenho irregularidade?”.
- Gratuito mostra orientação básica; Premium libera alertas regulatórios mais completos da escala.
- Mantidos ElevenLabs/Azure/OpenAI como provedores de voz com fallback.

## Validação

- `node --check server.mjs`
- `npm run check`
- `npm run build`

Avisos conhecidos: PDF.js/chunk grande do Vite, sem quebrar o build.
