# Web Push: worker de tópico e reconciliação, sem ativação

Base c963094bd044a9e5a772eee890c04b65412dd84f. Branch separada da #1217 Telegram e #1218 Android. Nenhuma configuração, chave, permissão, subscription real, fornecedor pago ou envio é alterado por esta tarefa. Gate operacional permanece literal OFF e readSource null.

## Problemas e correção

O worker shipping usava apenas o store genérico; gateCurrent exigia gateBinding, disponível somente no receiver isolado. Agora sw.js importa o receiver existente e o worker o compõe com o mesmo IndexedDB e o mesmo lock de origem. Não há segundo receiver, armazenamento ou outbox. O sincronismo compara instalação, revisão, geração local e tópico/epoch; revisão velha não reativa tombstone. Revogação/sincronismo de tópico e display usam o mesmo lock até fechar notificações anteriores. Cadastro e cancelamento genéricos também respeitam esse lock. Sem binding válido, portão continua bloqueado.

GET da API existente pode projetar o binding de tópico já registrado, somente quando gateHostEnabled é literalmente true e a sessão canônica/instalação/consentimento atuais são válidos. O default OFF retorna null antes de ler autoridade. Nenhum GET concede consentimento, expõe sessão/chave ou confirma envio. A projeção é consumida pelo runtime existente, não por novo controle de preferência. Não foi adicionada UI de opt-in de portão, nem fonte/trigger operacional; esse caminho continua bloqueado e depende da composição descrita na #1217.

O cadastro passa a devolver hash opaco do endpoint. O runtime compara a subscription local, chave pública de aplicação, expiração e hash ao estado autenticado do servidor. Ao abrir/focar/reconectar, apenas reconcilia bindings já registrados ou informa renovação necessária; nunca pede permissão, cria subscription ou reativa revogação automaticamente. Offline não consulta a API. A renovação exige botão explícito e reutiliza subscribe/CAS/revogação existentes, inclusive limpeza conservadora se falhar. A UI relê antes de confirmar sucesso e invalida respostas de outra sessão/conta ou operação superada. Uma subscription expirada pelo provider é distinguida de revogação sem inferir recebimento físico.

pushsubscriptionchange é somente evidência opcional: o worker compara o hash da subscription antiga com o binding atual, invalida esse binding sob locks e avisa páginas existentes para reconciliar. Evento antigo não apaga nova conta/assinatura. O worker não armazena token de autenticação, não chama backend para renovar, não pede permissão e não cria assinatura. Com página fechada pode persistir necessidade de recuperação, mas não garante renovar; evento ausente também é detectado na próxima abertura por comparação local/servidor. Não tratamos esse evento como universal.

## Validação

- Harness shipping usa os handlers reais do worker, receiver existente, IndexedDB e Web Locks em Chromium; display e eventos externos simulados, toda rede externa bloqueada. Cobre tópico ausente, binding correto, revisão/generation/conta antigas, revogação durante display, tombstone, página fechada e evento de subscription antigo.
- Runtime real compilado com APIs falsas: subscription existente/hash/chave/expiração; reconciliação sem POST/grant/subscribe; tópico revogado; assinatura ausente/expirada; renovação explícita bem-sucedida e falha; revogação sem reenrollment; leitura tardia de outra conta; configuração OFF.
- UI real em Chromium: estado honesto, renovar e desativar separados, falha sem sucesso falso, cadastro relido, conta trocada, permissão bloqueada e zero prompt real.
- Regressões existentes de provider, API/JWT, lifecycle, gesture, cancellation, receiver fence e produtor OFF continuam exigidas. Workflow Gate push OFF existente ampliado, incluindo raw/prepared, Chromium e MySQL já isolado. Docker não disponível localmente; SQL só pode ser confirmado por CI.

Nenhum desses testes comprova inscrição de usuário real, entrega pelo SO, recebimento ou leitura. Android WebView/FCM nativo não é substituído por PushManager/VAPID. A frente Android identificou um projeto Firebase existente, mas integra SDK/service/token e identidade/autorização do sender separadamente; esta branch não cria ou amplia isso.

## Fronteiras antes de qualquer ativação

1. Manter OFF até revisão independente, automática atual e CI no HEAD exato. Sem merge/publicação nesta etapa.
2. Configuração real e subscription de cada instalação ainda precisam ser verificadas com segurança; a flag disabled observada não prova ausência de chaves ou de assinatura. O conector Render disponível não expõe inventário read-only de env; não foram lidos valores ou feitas escritas para investigar.
3. Portão/status continuam dependentes de fonte com valor, instante próprio, ocorrência e histórico autorizados. lastRadar persistido é resposta única sob demanda, não feed autônomo. Nenhum novo polling, histórico inventado ou query paga foi criado.
4. Quando houver fonte e enablement separadamente aprovados, o próprio usuário escolhe e confirma tópico no controle único do Concierge e cadastra a instalação suportada. Cadastro, permissão e aceite do provider permanecem estados diferentes de entrega física.

## Revisão P2: intenção de cancelamento persistente

Contraprova LOCAL_CANCEL_TOMBSTONE reproduziu que a reconciliação restaurava binding quando revoke remoto e unsubscribe falhavam. O IndexedDB existente agora guarda tombstone por owner; cancelamento explícito persiste a intenção na mesma transação que remove o binding. Reabertura, foco e reconciliação não a apagam, mesmo com servidor e subscription ainda ativos. Apenas ativação explícita com bind bem-sucedido na geração atual remove o tombstone; tentativa incompleta/falha conserva-o. Cancelamentos de manutenção não se tornam consentimento nem apagam a intenção. A UI distingue cancelamento local de confirmação remota. Testes runtime RED/GREEN e worker real após fechar/reabrir cobrem persistência, isolamento entre contas e tentativa de begin/bind automático recusada.
