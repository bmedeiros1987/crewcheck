# device-status v1 — protocolo diagnóstico periférico

Status: v1 estável. Ownership do responder Wear e desta especificação: trilha de periféricos. Ownership do iniciador, persistência e UI/Device Hub do telefone: **CrewCheck Mobile Core**.

## Transporte Wear OS

- request path: `/crewcheck/watch/device-status/request/v1`
- response path: `/crewcheck/watch/device-status/response/v1`
- request payload: UTF-8 estrito contendo somente um nonce opaco, máximo 64 Unicode code points e 256 bytes; payload vazio é aceito como peer legado sem correlação. UTF-8 malformado, controles ou payload acima do limite degradam para legacy/unverified e nunca são normalizados para criar uma correlação.
- response payload: JSON UTF-8, máximo 4 KiB.

O protocolo é diagnóstico e não transporta conteúdo de roster, PDF, credenciais, identificadores de conta ou saúde bruta.

## Response v1

Obrigatório:

- `schemaVersion`: inteiro `1`.

Opcionais/defaults para consumidores:

- `requestId`: string, default `""`; quando a request traz nonce válido, deve ecoá-lo exatamente, sem trim, normalização ou reescrita. Payload de nonce vazio, maior que 64 Unicode code points/256 bytes, com UTF-8 malformado ou caractere de controle degrada para resposta legacy/unverified sem `requestId`.
- `nodeName`, `manufacturer`, `model`, `appVersionName`: string, default `""`.
- `appVersionCode`: inteiro >= 0, default `0`.
- `batteryPercent`: inteiro 0..100; `-1` significa indisponível.
- `round`: boolean, default `false`.
- `screenWidthDp`, `screenHeightDp`: inteiros >= 0, default `0`.
- `snapshotGeneratedAtEpochMs`, `snapshotValidUntilEpochMs`: epoch ms >= 0, default `0`; são apenas metadados de frescor, nunca o corpo da escala.

Campos opcionais desconhecidos em schema 1 devem ser ignorados. Evolução dentro do v1 é somente aditiva e opcional.

## Correlação, timeout e peer antigo

O Mobile Core deve gerar um nonce opaco novo a cada `Testar sincronização` e considerar **5 segundos** como a janela de verificação da requisição. O Wear apenas ecoa o nonce; ele não decide timeout.

- resposta com `requestId` igual ao nonce ativo dentro da janela: round-trip verificado;
- resposta com nonce diferente: não conclui nem substitui o teste ativo;
- resposta sem `requestId`: pode atualizar telemetria como **legacy/unverified**, mas não conclui teste correlacionado ativo;
- resposta depois dos 5 s: não pode transformar retroativamente um timeout em sucesso;
- um peer Wear antigo sem suporte ao nonce continua visível como telemetria legada, sem falsa confirmação;
- se nenhum peer responder, o último status conhecido pode continuar visível, mas deve ser marcado como não verificado/stale conforme sua idade.

## Downgrade/compatibilidade

`device-status v1` não depende de Premium. Free e Premium respondem ao mesmo protocolo. Mudança de entitlement não altera a semântica do status nem apaga o roster básico. Um consumidor v1 rejeita schema incompatível em vez de reinterpretá-lo.

## Handoff para Mobile Core

Cabe ao Mobile Core implementar, fora desta PR:

1. UI Device Hub (relógio conectado, versão, última sync, bateria e `Testar sincronização`);
2. Activity/Manifest/shortcut/resources do app Android principal;
3. emissão do request, geração/persistência do nonce e janela de 5 s;
4. correlação segura, latência do round-trip e tratamento de respostas legacy/mismatched/late;
5. compatibilidade para trás conforme as regras acima.

A trilha periférica não deve cherry-pick nem reintroduzir essa implementação do telefone.
