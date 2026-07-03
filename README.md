# CrewCheck v11.1.100 — BIDS Restaurado e Menu da Escala Padronizado

Correção estrutural do coração do sistema de escala.

## Foco da versão

- Parser AIMS visual por colunas como fonte canônica quando o PDF vem em matriz.
- Costura automática de voos noturnos que começam em uma coluna/dia e terminam no dia seguinte.
- Exemplo coberto: `LA3394 GRU → PMW` saindo em 06/JUL e chegando 07/JUL, seguido de `LA3395 PMW → GRU`.
- Não permite que leitura textual linearizada substitua uma coluna visual confiável.
- Deduplicação por atividade, não por data única.
- Correção de `dutyDebrief` para não herdar o debrief da perna anterior quando o último voo não traz debrief explícito.
- Mantém radar multi-API, alertas, regulamentação automática por função/ACT, meteorologia, Infobip, WhatsApp Premium/import e FreeCurrencyAPI.

## Validação local

- `node --check server.mjs`: OK
- `tsc` do parser: OK, exceto stubs externos conhecidos de `pdfjs-dist` no ambiente sem dependências instaladas.
- ZIP: pacote com menos de 100 arquivos.
