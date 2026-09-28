# Regressões de localização canônica

Execute localmente:

```bash
node scripts/regression-canonical-location-contract.mjs
node scripts/regression-canonical-location-architecture.mjs
```

O primeiro teste valida o contrato funcional puro de normalização, validade e distância.

O segundo garante que `server/v14316/telegramLocation.mjs` permaneça somente como espelho silencioso de compatibilidade: ele pode persistir a localização histórica, mas não pode decidir TTL, interceptar Academias ou consultar uma localização paralela. A decisão de frescor e o consumo pelos recursos geográficos permanecem concentrados no Concierge canônico.
