# CrewLife Context, privacidade e integrações futuras

## Contrato atual

`CrewLife Context` é a fronteira local que reúne sinais já conhecidos pela Rotina (próxima programação canônica, sono e atividade) e os entrega aos módulos opcionais. O CrewLife Fem recebe esse contrato; não interpreta diretamente horários da escala nem altera roster, APZ, compliance ou aptidão.

Dados reprodutivos ficam em um cofre lógico separado, versionado, `Local Only`, isolado por identidade local e com validação fail-closed. O envelope marca `dataClass=reproductive_private` e `exportAllowed=false`. Isso reduz mistura acidental com dados gerais do Life, mas não equivale a criptografia em repouso do sistema operacional. Uma integração nativa futura deve usar Keystore/Keychain antes de habilitar backup ou sincronização.

## Health Connect e HealthKit — slice futuro separado

Fluxo previsto: `fonte autorizada -> adaptador nativo -> normalização local -> cofre reprodutivo -> CrewLife Context minimizado`.

- permissões reprodutivas não podem ser agrupadas às permissões gerais de sono/atividade;
- cada tipo de dado exige opt-in específico e revogável;
- nenhum dado bruto deve ir ao servidor, logs ou analytics;
- a proveniência acompanha cada registro;
- desconectar apaga resumos locais derivados, sem prometer apagar a fonte;
- relógio não é requisito;
- não adicionar permissões de manifesto neste PR.

## BIDS/PBS — bloqueado pela sequência soberana

Integração futura somente após #623 e consumidores críticos. A fronteira será:

`cofre privado -> resolvedor local de preferência -> { preferred_day_off, weight?, generic_label? } -> assistente BIDS`.

É proibido atravessar essa fronteira com ciclo, sintomas, fertilidade, tentativa de gravidez, temperatura, muco, testes, atividade sexual ou justificativa de saúde. Não haverá submissão automática: a usuária revisa e decide.

## Gates antes de implementar integrações

1. #623 e consumidores críticos concluídos conforme governança.
2. Threat model e revisão de privacidade independentes no SHA exato.
3. Cofre nativo com Keystore/Keychain e exclusão verificável.
4. Testes de permissão granular, revogação, troca de conta e ausência em telemetria.
5. Contrato BIDS neutro testado para rejeitar campos sensíveis.
