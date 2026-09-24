# watchSnapshotV1 — contrato portátil do lado periférico

Status: v1 estável. Ownership desta especificação: trilha de periféricos. Ownership do produtor/publisher no telefone: CrewCheck Mobile Core.

## Objetivo

Transportar uma projeção canônica, compacta e pronta para apresentação entre celular/servidor e Wear OS, Garmin, watchOS futuro e outros dispositivos. O periférico nunca interpreta PDF nem recalcula APZ, jornada, compliance, portão ou pernoite.

O payload é JSON UTF-8, independente de Android, com limite atual de 16 KiB. No Wear OS ele viaja hoje em `/crewcheck/watch/context/v1` na chave `snapshotJson`; outros adapters podem usar outro transporte sem alterar a semântica do payload.

## Campos v1

Obrigatórios:

- `schemaVersion`: inteiro `1`.
- `generatedAtEpochMs`: epoch ms > 0.
- `validUntilEpochMs`: epoch ms >= `generatedAtEpochMs`.

Opcionais e defaults do consumidor:

- `contextId`: string, default `""`.
- `state`: `OFF_DUTY|LEAVE_SOON|REPORTING|BOARDING|IN_FLIGHT|CONNECTION|OVERNIGHT|CHANGED|UNKNOWN`; desconhecido vira `UNKNOWN`.
- `headline`: string; vazio permite headline local neutra derivada somente de `state`.
- `primaryTime`, `detail`, `presentationTime`, `presentationPlace`, `leaveTime`, `trafficDetail`, `currentFlight`, `currentRoute`, `gate`, `boardingTime`, `eta`, `connection`, `nextFlight`, `nextDetail`, `overnight`, `hotelPickup`: strings, default `""`.
- `remoteStand`: boolean, default `false`.
- `changed`: boolean, default `false`.
- `source`: string, default `canonical-roster`.
- `premiumAccess`: boolean, default `false`; é sinal legado/coarse de entitlement e não pode bloquear Agora/Jornada/Escala Free.
- `schedule`: array, default `[]`, máximo 8 itens.

Cada item de `schedule` pode conter `id`, `time`, `title`, `route`, `presentation`, `gate`, `detail` como strings e `kind` como `flight|stay|duty`; `kind` inválido degrada para `duty`.

Campos sensíveis como CPF, e-mail, telefone, credenciais/tokens, nome de tripulante, quarto de hotel ou dado bruto de saúde são proibidos no snapshot operacional.

## Compatibilidade

- Um consumidor v1 deve ignorar campos opcionais desconhecidos.
- Um peer v1 antigo que não envie `premiumAccess` ou `schedule` continua válido: defaults são `false` e `[]`.
- Dentro do schema 1, evolução é somente aditiva e opcional; nenhum campo existente pode mudar de significado.
- `schemaVersion > 1` é rejeitado com segurança pelo consumidor v1. O relógio mantém o último snapshot v1 validado e o marca stale quando expirar; não tenta reinterpretar versão nova.
- O produtor não deve remover os três campos obrigatórios nem enviar timestamps incoerentes.

## Downgrade Premium → Free

Downgrade não remove o roster básico. O próximo snapshot segue contendo Agora/Jornada/Escala e muda `premiumAccess` para `false`. Canais/caches Premium (CrewLife, rotina, Concierge, smart departure/Live Ops quando separados) devem ser limpos ou deixar de ser publicados sem apagar o último snapshot operacional Free válido.

## Handoff para Mobile Core

O Mobile Core deve implementar o produtor/bridge, sem código autoritativo nesta trilha:

1. construir o snapshot exclusivamente a partir da projeção canônica já validada pelo CrewCheck;
2. nunca enviar PDF bruto, credenciais ou regras para o relógio recalcular;
3. publicar `watchSnapshotV1` no Data Layer quando houver projeção válida e ao atender `/crewcheck/watch/request-sync/v1`;
4. manter compatibilidade v1 conforme regras acima e limitar payload a 16 KiB;
5. garantir que Free sempre receba roster básico; Premium apenas acrescenta capabilities/canais autorizados;
6. quando o peer for antigo, manter schema 1 e omitir extensões novas em vez de alterar semântica;
7. quando o telefone não conseguir produzir snapshot novo, repassar somente o último snapshot validado compatível, preservando `generatedAtEpochMs/validUntilEpochMs` para que o periférico reporte stale honestamente.

Nenhuma implementação de `android-wrapper/app/**` ou `client/**` faz parte desta PR periférica.
