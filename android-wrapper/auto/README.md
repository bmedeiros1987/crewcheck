# CrewCheck Drive Lab 0.3 — testes nativos e validade da interface

Protótipo Android Auto / POI. **Não publicado, não aprovado pelo Google, ainda sem teste DHU/central física.** Não é navegador próprio nem WebView na central.

## Responsabilidades preservadas

**Peripherals / #834:** somente `android-wrapper/auto/**`, renderer, destinos manuais, consumidor read-only e testes do adapter. O módulo é registrado por `auto-module.init.gradle`, sem alterar o `settings.gradle` raiz.

**Mobile Core / #839:** provider, Manifest e variante `driveLab`, em `android-wrapper/mobile-core/drive-lab/**` na PR Mobile. Não existe cópia da ponte nesta branch. O CI continua consumindo o commit `e995dcf3cb75a150f08330d0aef68bc2495b134f` em checkout separado. Nenhum comportamento phone-side é modificado neste slice.

A consulta `content://com.crewcheck.app.drivelab.drive/v1/snapshot`, coluna `snapshotJson`, permanece a fronteira experimental. O consumidor não acessa detalhes internos de cache/publicação do Mobile. O protocolo e a autorização não mudaram.

## Evolução 0.3

- Solicita atualização da interface quando a projeção vence, sem esperar o próximo polling de 30 segundos nem uma resposta nova do telefone. Não dispara consulta extra nem renova a validade dos dados.
- Ao descartar a sessão de visualização, elimina também o status antigo de dados recebidos. Uma reabertura passa a aguardar sincronização, em vez de sugerir que um snapshot já removido ainda está conectado.
- Preserva a tolerância de um segundo na troca rápida entre lista e detalhe.
- Acrescenta dez cenários executados em Android simulado API 28 e 36, usando Robolectric e o host falso oficial da Car App Library. Os 30 testes JVM anteriores permanecem. A quantidade esperada é **50 execuções**, a comprovar no relatório do SHA atual.
- Testes verificam sessão/tela inicial, lista manual sem consentimento de sync, ACTION_NAVIGATE/URI codificada, bloqueio do botão antigo após exclusão/expiração/troca de jornada, opt-out, expiração observável e descarte/continuidade de sessão.
- Relógio injetável nos testes torna os cenários temporais determinísticos. Instâncias normais continuam usando `System.currentTimeMillis`; as fixtures não alteram regras de validade para fabricar sucesso.

## Comportamento mantido

Até cinco destinos no carro, respeitando o limite do host; detalhe e **Buscar rota** via `CarContext.ACTION_NAVIGATE`/`geo:`. Não força Maps/Waze. Até quatro destinos manuais locais. Aeroporto apenas com voo REPORTING/LEAVE_SOON/BOARDING e IATA de apresentação; hotel apenas do pernoite atual. Voo em andamento, conexão, folga e estado desconhecido não sugerem deslocamento.

Sincronização opt-in e consultas a cada 30 segundos apenas com interface visível. Dados canônicos somente em memória e com validade máxima de 15 minutos, limitada também pela validade de origem. Expiração/mudança de contexto bloqueiam o clique, mesmo quando uma central ainda estiver mostrando um botão anterior. Não há nova API de internet ou localização contínua.

## Teste: celular e DHU primeiro

O artefato `crewcheck-drive-lab-debug` contém `crewcheck-drive-lab.apk` (`com.crewcheck.auto.prototype`) e `crewcheck-phone-lab.apk` (`com.crewcheck.app.drivelab`), feitos no mesmo runner para manter certificados debug correspondentes. Inclui SHAs Auto/Mobile e checksums.

Instale o par do mesmo artefato sem substituir o CrewCheck da Play. Abra uma escala válida no Phone Lab, ative **Receber destinos do CrewCheck Phone Lab** e sincronize no Drive Lab. Só o Drive Lab permite testar destinos manuais. O app da Play não fornece esta ponte. Não há atualização silenciosa garantida com a Activity Phone Lab inativa.

**Correção importante de distribuição:** instalar um APK diretamente e habilitar fontes desconhecidas NÃO é a via suportada para testar apps Car App Library numa central real. A opção não se aplica a esta categoria. Use o DHU no desenvolvimento; para veículo real, prepare distribuição confiável pela Play, por exemplo canal de teste interno, conforme as regras oficiais. Nenhuma submissão à Play é feita por este workflow.

Internal App Sharing re-assina o app: não pressupor que os certificados instalados dos dois packages continuarão iguais. A ponte usa permissão signature e comparação de certificados; a estratégia de assinatura/distribuição do par precisa ser validada pelo Mobile antes do teste real com sync. Não afrouxar permissões nem usar chaves de produção como atalho. Destinos manuais não dependem da ponte.

Assinaturas debug podem mudar entre builds. Isso pode exigir reinstalar apenas os laboratórios, com perda de seus dados locais; nunca apagar o app principal por causa de um teste Auto. Não recomendar reinstalação para erro de backend. Guia: `TESTING.md`.

## Build local

Java 21 é necessário para os testes Android API 36; o código do APK continua compilado com compatibilidade Java 17.

    gradle -p android-wrapper -I "$PWD/android-wrapper/auto/auto-module.init.gradle" :auto:testDebugUnitTest :auto:assembleDebug

Para Phone Lab, checkout Mobile pinado da #839:

    MOBILE_ROOT=/caminho/checkout-mobile/android-wrapper/mobile-core/drive-lab
    gradle -p android-wrapper -I "$MOBILE_ROOT/init.gradle" -PcrewcheckMobileDriveLabRoot="$MOBILE_ROOT" :app:assembleDriveLab

Não copiar ou editar a implementação Mobile nesta trilha. Mudança do SHA fornecedor exige handoff e revisão.

## Gates que continuam pendentes

Os testes novos são **simulação de Android/host**, não evidência de DHU, dispositivo físico, renderização real, IPC entre apps, login ou transmissão da escala. As fixtures são sintéticas e só semeiam o estado já recebido pelo consumidor; não implementam um provider paralelo.

Permanecem obrigatórios: contrato Mobile de sessão/logout/troca de conta/revogação, endereços estruturados, rejeição instrumentada de cliente não autorizado, DHU, central física estacionada, estratégia de distribuição/assinatura do par e elegibilidade POI. Validade curta NÃO substitui o contrato de sessão.

Nome/IATA são consultas de local, não coordenadas, entrada de tripulantes ou terminal verificados. Conferir destino no navegador. Não são inferidos ETA, trânsito, pontualidade, APZ ou hora de sair.

**DRAFT. Sem merge, deploy, publicação Play, alteração de secrets/permissões administrativas ou dados de produção.** `render-preview-skip` deve permanecer: esta PR nativa não necessita de outro servidor web.

## Fontes oficiais

- https://developer.android.com/training/cars/testing
- https://developer.android.com/training/cars/testing/dhu
- https://developer.android.com/training/cars/apps/library/test-library
- https://support.google.com/googleplay/android-developer/answer/9844679
- https://github.com/robolectric/robolectric/releases/tag/robolectric-4.16.1
