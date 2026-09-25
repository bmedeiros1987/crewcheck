# CrewCheck Drive Lab 0.2

Protótipo Android Auto / POI. **Não publicado, não aprovado pelo Google, não validado ainda em DHU ou veículo.** Não é um navegador próprio e não espelha a WebView na central.

## Implementado

- Tela do carro com até cinco destinos, respeitando o limite informado pela central.
- Detalhe e ação **Buscar rota** via `CarContext.ACTION_NAVIGATE` e URI `geo:` codificada. O host escolhe o navegador disponível; não forçamos Maps/Waze.
- Tela nativa no celular: consentimento de sincronização, status, até quatro destinos salvos localmente e exclusão confirmada.
- Ponte de laboratório somente leitura com a projeção `watchContext.ts` v1 já existente. Não calcula APZ, não importa PDF e não percorre escala para inventar próxima jornada.
- Destino aeroporto apenas quando a projeção informa um voo em REPORTING/LEAVE_SOON/BOARDING com código IATA de apresentação. Hotel apenas de `detail` no estado OVERNIGHT, nunca do hotel futuro.
- Contextos de voo em andamento, conexão, folga ou estado desconhecido não criam sugestão de deslocamento terrestre.
- Atualização a cada 30 segundos **apenas enquanto a tela está visível**. Sem serviço de localização, sem rastreamento e sem nova API de internet no módulo Auto.
- Snapshot válido por no máximo 15 minutos e nunca além de sua validade original. Relógio regressivo/futuro, mudança de contexto e clique após expiração bloqueiam a sugestão.
- Projeção canônica apenas em memória, descartada um segundo após sair de todas as telas, ou imediatamente ao desligar sincronização. O intervalo curto preserva a transição entre lista e detalhe. Destinos manuais permanecem locais.
- Seleção preservada quando muda apenas a data de atualização; invalidada quando mudam jornada, hotel ou apresentação.
- 30 testes JVM para contrato, estados, tempo, minimização de dados, URI de navegação e continuidade da seleção.

## Testar sem substituir o CrewCheck da Play

O workflow foi configurado para gerar o artefato `crewcheck-drive-lab-debug` com dois APKs **do mesmo build**:

1. `crewcheck-phone-lab.apk`: package `com.crewcheck.app.drivelab`. É uma variante isolada do aplicativo de celular existente, com o provedor de testes. Não substitui `com.crewcheck.app`.
2. `crewcheck-drive-lab.apk`: package `com.crewcheck.auto.prototype`, com a interface Android Auto.

Instale primeiro o Phone Lab e depois o Drive Lab. No Phone Lab, entre na sua conta e abra uma escala válida. No Drive Lab, ative **Receber destinos do CrewCheck Phone Lab** e toque em sincronizar. A primeira geração da projeção pode exigir nova consulta; não é necessário ter relógio pareado para gravar o cache local. Se faltar uma apresentação/local verificável, cadastre explicitamente um destino no celular.

A assinatura de debug é temporária por execução. Para atualizar a partir de outro build, pode ser necessário remover **somente os dois apps de laboratório**; nunca remover o CrewCheck da Play. Dados manuais do laboratório são apagados nessa desinstalação.

O aplicativo de produção da Play **não fornece esta ponte**. Instalar somente o Auto APK permite testar destinos manuais, mas não sincronizar a escala de produção. O Phone Lab usa o fluxo já existente do celular: se sua Activity não estiver ativa para gerar nova projeção, os dados envelhecem e o Auto deixa de sugerir rota da escala. Não existe atualização silenciosa garantida em segundo plano nesta etapa.

Use o Desktop Head Unit (DHU) para a primeira validação; habilite as opções de desenvolvedor do Android Auto conforme a documentação oficial. Testes no carro devem ocorrer estacionado. Não prometemos que todo APK instalado fora da Play seja listado por toda central/configuração.

## Isolamento de build

A ponte, manifesto e variante de celular ficam sob `auto/phone-bridge/`. Só entram com o init script explícito. Execute da raiz do repositório:

```sh
gradle -p android-wrapper --no-daemon :auto:testDebugUnitTest :auto:assembleDebug
gradle -p android-wrapper -I "$(pwd)/android-wrapper/auto/phone-bridge/init.gradle" --no-daemon :app:assembleDriveLab
```

Nenhum arquivo do Mobile Core, parser, UI web, permissões do repositório, secrets ou dados de produção foi alterado por esta implementação. Builds normais de `:app:assembleDebug` / `:app:bundleRelease` não incluem esse provider. Nenhum workflow desta trilha publica na Play.

O provider aceita somente o package Auto Lab com a mesma assinatura, exige permissão de nível signature e recusa insert/update/delete. A consulta devolve uma allow-list mínima; não transfere campos de cookies, tokens, CPF, saúde, nomes de tripulantes, arrays de escala ou campos de quarto. Não há logs de payload. O consumidor também valida a assinatura do fornecedor, o schema e a janela temporal. Campos de texto livres ainda dependem da qualidade dos dados de origem.

## Limites deliberados / gates antes de produção

- Nome/IATA são **consultas de local**, não coordenadas verificadas. Confirme o resultado no navegador. Não inferimos terminal, entrada de tripulantes, endereço de hotel, ETA, trânsito ou horário recomendado de saída.
- `presentationTime` é exibido literalmente como horário informado pelo celular, sem recomputar data/fuso/APZ. Nenhuma previsão de pontualidade é feita.
- A projeção atual não tem chave explícita de sessão/conta nem endereço estruturado. Logout, troca de conta e mudança de hotel precisam de contrato específico com Mobile antes de uma ponte de produção. A validade curta e o reset em memória reduzem, mas não resolvem integralmente, essa lacuna upstream.
- Necessários: DHU (dia/noite, diferentes resoluções, perda de conexão e expiração no detalhe), prova de rejeição de cliente não assinado, teste físico estacionado e revisão de elegibilidade POI/qualidade do Google.
- Manter PR em draft. Não promover a release ou fazer merge para integração de produção com esses gates pendentes.

## Referências oficiais

- https://developer.android.com/training/cars/apps/poi
- https://developer.android.com/reference/androidx/car/app/CarContext#startCarApp(android.content.Intent)
- https://developer.android.com/docs/quality-guidelines/car-app-quality
- https://developer.android.com/training/cars/testing/dhu
