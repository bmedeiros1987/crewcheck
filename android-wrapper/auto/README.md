# CrewCheck Drive Lab 0.2 — ownership reconciled

Protótipo Android Auto / POI. **Não publicado, não aprovado pelo Google, ainda sem teste DHU/central física.** Não é navegador próprio nem WebView na central.

## Responsabilidades

**Peripherals / #834:** somente `android-wrapper/auto/**`, renderer, destinos manuais, consumidor read-only e testes do adapter. O módulo é registrado por `auto-module.init.gradle`, sem alterar o `settings.gradle` raiz.

**Mobile Core / #839:** provider, Manifest e variante `driveLab`, agora em `android-wrapper/mobile-core/drive-lab/**` na PR Mobile. Não existe cópia da ponte nesta branch. O CI consome explicitamente o commit `e995dcf3cb75a150f08330d0aef68bc2495b134f` da #839 em checkout separado.

A consulta `content://com.crewcheck.app.drivelab.drive/v1/snapshot`, coluna `snapshotJson`, é a fronteira experimental. Cache privado e broadcast usados pelo provider são detalhes internos do Mobile, não APIs para Peripherals. O protocolo permanece o mesmo; nenhuma regra de parser/APZ/sync ou autorização foi alterada nesta separação.

## Comportamento preservado

- Até cinco destinos no carro, respeitando o limite informado pelo host; detalhe e **Buscar rota** via `CarContext.ACTION_NAVIGATE` e URI `geo:`. Não força Maps/Waze.
- Configuração do adapter com sincronização opt-in, status, quatro destinos manuais locais e exclusão confirmada.
- Aeroporto apenas com voo REPORTING/LEAVE_SOON/BOARDING e IATA de apresentação; hotel apenas do `detail` OVERNIGHT atual. Voo em andamento, conexão, folga e estado desconhecido não sugerem deslocamento.
- Atualização a cada 30 segundos somente com a interface visível; dados canônicos em memória, descartados ao desligar sync ou após sair das telas. Não há rastreamento/localização contínua nem nova API de internet.
- Validade no máximo 15 minutos, limitada pela validade de origem; expiração e mudança de contexto bloqueiam o clique. Timestamp novo não invalida uma seleção inalterada.
- 30 testes JVM permanecem inalterados.

## Teste sem substituir o CrewCheck da Play

O artefato `crewcheck-drive-lab-debug` contém `crewcheck-drive-lab.apk` (`com.crewcheck.auto.prototype`) e `crewcheck-phone-lab.apk` (`com.crewcheck.app.drivelab`), construídos no mesmo runner para manter certificados debug correspondentes. Inclui SHAs separados de Auto e Mobile.

Instale Phone Lab e Drive Lab do mesmo artefato. Abra uma escala válida no Phone Lab, ative **Receber destinos do CrewCheck Phone Lab** no adapter e sincronize. Instalar apenas o Drive Lab permite destinos manuais; o app da Play não fornece esta ponte. Não existe atualização silenciosa garantida com a Activity Phone Lab inativa.

Assinaturas debug podem mudar entre builds; não desinstale nem apague o app principal da Play. Qualquer reinstalação dos dois laboratórios perde seus dados locais. Testes em veículo apenas estacionado, depois de DHU.

## Build local

Auto (somente Peripherals), da raiz:

    gradle -p android-wrapper -I "$PWD/android-wrapper/auto/auto-module.init.gradle" :auto:testDebugUnitTest :auto:assembleDebug

Para o Phone Lab, obtenha o checkout Mobile pinado da #839 separadamente e invoque **seu** script:

    MOBILE_ROOT=/caminho/checkout-mobile/android-wrapper/mobile-core/drive-lab
    gradle -p android-wrapper -I "$MOBILE_ROOT/init.gradle" -PcrewcheckMobileDriveLabRoot="$MOBILE_ROOT" :app:assembleDriveLab

Não copiar o provider para Auto nem editar o init Mobile nesta trilha. Atualização da fonte é handoff ao Mobile Core e atualização explícita do SHA após revisão.

## Gates ainda pendentes

Signature permission, package/certificado exatos e consultas sem escrita continuam exigidos. Prova instrumentada de cliente não autorizado ainda é necessária. Nenhuma permissão foi afrouxada para viabilizar o laboratório.

Nome/IATA são consultas de local, não coordenadas, entrada de tripulantes ou terminal verificados. Conferir destino no navegador. Não são inferidos ETA, trânsito, pontualidade ou hora de sair.

A projeção experimental não tem identidade de sessão nem endereço estruturado: **logout/troca de conta e invalidation continuam handoff Mobile bloqueante antes de produção**. Validade curta não substitui esse contrato. DHU, central física estacionada e elegibilidade POI também continuam pendentes.

DRAFT. Sem merge, deploy, publicação Play, secrets ou dados de produção. O laboratório UI automático permanece READ-ONLY.
