# Concierge: linguagem natural com fatos preservados

Ajuste determinístico da camada de texto existente. Não acrescenta modelo generativo, serviço, custo, credencial ou envio. Não altera parser, finanças, conformidade, seleção de escala, roteamento de intenção ou preferências salvas.

## Comportamento

- Respostas a consultas começam pela informação, sem repetir saudação, cargo e nome em toda interação. Saudações explícitas e `/start` mantêm a abertura.
- O nome importado da escala usa só o primeiro nome, com caixa normalizada quando veio em maiúsculas. Um nome/apelido escolhido explicitamente continua tendo prioridade, inclusive quando composto. O dado salvo não é alterado.
- Apelidos com pontuação ambígua são preservados de forma conservadora; não se remove um trecho que possa ser parte do nome.
- Pedidos de esclarecimento usam uma pergunta curta. Um erro ou ausência de dados continua sendo informado como tal.
- Modo formal permanece sem humor. O modo leve mantém o limite de frequência existente e não acrescenta humor em perguntas de esclarecimento, alertas, falhas ou procedimentos de cabine.
- Respostas pessoais identificam o assistente como virtual, sem atribuir família, sonhos ou sentimentos pessoais. Nenhuma resposta confirma portas, cabine ou procedimentos que o sistema não verifica.
- Repetições de linhas de dados são preservadas: o mesmo hotel, valor ou aviso pode pertencer a dois dias diferentes. Só os avisos oficiais completos e reconhecidos recebem a compactação já existente.

## Exemplos sintéticos

Os nomes, voos e horários desta seção são fictícios. Os exemplos mostram texto gerado, não uma conversa real.

| Situação | Antes | Depois |
| --- | --- | --- |
| Apresentação | Fala, chefe ANA EXEMPLO. Sua apresentação é às 09:25. | Sua apresentação é às 09:25. |
| Abertura com nome importado | Fala, chefe ANA EXEMPLO. | Olá, Ana. |
| Continuação ambígua | Não identifiquei qual detalhe você quer continuar. Diga apenas o dado: apresentação, saída, portão, hotel, meteorologia ou próxima programação. | Qual detalhe você quer consultar? |
| Sem escala | Fala, chefe ANA EXEMPLO. Ainda não tenho uma escala ativa. Envie o PDF oficial ou sincronize a escala pelo app. | Ainda não encontrei uma escala ativa. Envie o PDF oficial ou sincronize a escala pelo app para eu consultar. |
| Áudio não configurado | O áudio está temporariamente indisponível. | O áudio ainda não está configurado. |
| Agradecimento | Sempre junto. Você cuida da operação; eu ajudo a cuidar de você. | Por nada! |
| Procedimento de cabine | Portas em automático. CrewCheck realizado e confirmado. Cabine pronta para seguir. | Não consigo verificar nem confirmar a posição das portas. Essa confirmação cabe à tripulação, conforme os procedimentos da empresa. |

Os exemplos de apresentação/escala acima omitem apenas a exibição repetitiva do rodapé nesta tabela. A resposta real continua incluindo “Se houver divergência, vale a escala oficial.” quando aplicável.

## Verificação

```sh
node scripts/regression-concierge-natural-language.mjs
node scripts/regression-concierge-clock-format.mjs
node scripts/regression-v14-3-15-concierge-easter-eggs.mjs
node scripts/v139/apply.mjs
CREWCHECK_TEST_PREPARED=1 node scripts/regression-concierge-natural-language.mjs
node scripts/regression-concierge-clock-format.mjs
node scripts/regression-v14-3-15-concierge-easter-eggs.mjs
node scripts/regression-v14-4-08-concierge-human-voice.mjs
```

A matriz testa os dois estilos, continuidade sem nova saudação, nomes e apelidos, dados ausentes, erros, todas as variantes pessoais e de cabine, frases incidentais que não devem ativar respostas prontas, preservação de datas/voos/valores/URLs/negações/avisos, linhas repetidas, METAR/TAF/ATIS raw e o roteiro curto de voz. O teste de horário cobre todos os 1.440 valores HH:MM antes e depois da preparação canônica.

O teste preparado também executa as funções realmente materializadas em `server.mjs`. Não faz chamadas à produção, serviços de áudio ou APIs externas. Testar o roteiro de voz não equivale a ouvir o TTS real; o provedor, timbre, catálogo e política de envio de áudio permanecem iguais.
