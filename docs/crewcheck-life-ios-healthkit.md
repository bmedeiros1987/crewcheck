# CrewCheck Life — contrato Apple HealthKit

## Estado da entrega

A interface do CrewCheck v14.3.4 já reconhece um handler WKWebView chamado `CrewCheckHealthKit` e escuta os mesmos eventos usados pelo Android:

- `crewcheck:health-status`;
- `crewcheck:health-summary`.

A conexão só ficará operacional quando existir um aplicativo iOS assinado, com projeto Xcode, conta Apple Developer ativa e capability HealthKit. A PWA e o Safari não podem ler o Apple Health diretamente.

## Capability e chaves obrigatórias

No target iOS:

1. ativar **HealthKit** em Signing & Capabilities;
2. incluir `NSHealthShareUsageDescription` no `Info.plist` para explicar a leitura;
3. incluir `NSHealthUpdateUsageDescription` somente se algum dia houver escrita — a v14.3.4 é exclusivamente leitura;
4. manter a mensagem coerente com a política de privacidade e com a descrição enviada à App Store.

Mensagem proposta para `NSHealthShareUsageDescription`:

> Com sua autorização, o CrewCheck usa resumos de sono e atividade para organizar sua rotina pessoal ao redor da escala. Não realiza diagnóstico nem determina aptidão.

Referências oficiais:

- [Autorização de dados no HealthKit](https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data)
- [Proteção da privacidade no HealthKit](https://developer.apple.com/documentation/healthkit/protecting-user-privacy)
- [Configuração da capability HealthKit](https://developer.apple.com/documentation/xcode/configuring-healthkit-access)

## Tipos mínimos de leitura

Solicitar somente quando o usuário ativar CrewCheck Life e tocar em **Conectar**:

- `HKObjectType.categoryType(forIdentifier: .sleepAnalysis)`;
- `HKObjectType.quantityType(forIdentifier: .stepCount)`;
- `HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning)`;
- `HKObjectType.workoutType()`;
- `HKObjectType.quantityType(forIdentifier: .restingHeartRate)`.

Não solicitar pressão arterial, glicose, peso, medicamentos, registros clínicos, fertilidade ou outros tipos fora da finalidade de rotina.

## Mensagens recebidas da interface web

O handler recebe objetos neste formato:

```json
{
  "action": "requestPermissions",
  "scopes": ["sleep", "steps", "activity", "restingHeartRateTrend"]
}
```

Também deve aceitar:

- `readSummary`, com período máximo de 30 dias;
- `revokeOrOpenSettings`, que abre as configurações apropriadas. O HealthKit não oferece revogação programática; a mudança é feita pelo usuário nos Ajustes/Health.

## Resposta para a interface web

O adaptador deve executar JavaScript no WKWebView para emitir um `CustomEvent`. Exemplo de status:

```javascript
window.dispatchEvent(new CustomEvent('crewcheck:health-status', {
  detail: {
    ok: true,
    platform: 'ios-healthkit',
    availability: 'connected',
    localOnly: true
  }
}));
```

Resumo permitido:

```json
{
  "ok": true,
  "platform": "ios-healthkit",
  "periodDays": 7,
  "sleepMinutes": 432,
  "steps": 28640,
  "distanceMeters": 19430,
  "activityMinutes": 95,
  "restingHeartRateAverage": 61,
  "capturedAt": "2026-07-22T18:00:00Z",
  "localOnly": true
}
```

Não devolver amostras individuais, horários de cada batimento ou histórico clínico.

## Regras de autorização

- pedir permissão em contexto, após explicação e consentimento do CrewCheck Life;
- tratar autorização parcial como válida para os tipos concedidos;
- conferir o estado antes de cada consulta;
- funcionar sem Apple Health usando a entrada manual;
- nunca transformar ausência de permissão em erro do CrewCheck principal;
- nunca afirmar que a autorização de leitura foi concedida com base apenas no retorno do HealthKit, pois a Apple protege essa informação; tentar a consulta e lidar com ausência de dados de forma neutra.

## Critérios para liberar em produção

1. projeto iOS gerado e versionado;
2. bundle identifier definitivo;
3. conta Apple Developer/D‑U‑N‑S regularizada;
4. capability HealthKit habilitada no App ID e no target;
5. política de privacidade pública revisada;
6. testes em aparelho físico com dados reais e autorização parcial;
7. revisão da App Store concluída.
