# MyCrewCare: teste controlado exclusivamente debug — HOLD

PR1022 acrescenta Activity e manifest em `app/src/debug`, sem mudar Home.tsx, MainActivity.java, Runtime, Source, Portal, Profile ou decoder. Entrada própria no launcher: **Preparar sessão → login manual visível → Verificar → validação existente → cleanup confirmado**. Uma tentativa preserva o mesmo accountId/perfil entre preparação e aquisição. Não cria OAuth, SDK SSO, credenciais, token exchange ou aquisição paralela.

## Isolamento e permissões

Debug applicationIdSuffix `.mcctest` separa armazenamento/perfis da instalação de produção. Overlay remove entrypoints shell/notificações/Watch apenas do pacote de teste. Remove TODOS os grants herdados de main/dependências e declara somente INTERNET, já existente e necessária à WebView; não expande permissões. Release preserva applicationID, componentes, permissões e RELEASE_ENABLED=false. CI compila debug/release e confere manifests mesclados/bytecode: Activity ausente de release e lista debug exatamente INTERNET. Nenhum signing/env/loja/infraestrutura/flag release alterado; gate compila sem gerar APK de usuário.

## Caminho legítimo observado e limites de navegação

Browserworker relatou observação prévia legítima, sem tocar novamente na sessão: entrada `https://api2.apicrewcare.com/LATAM/mytravel.aspx` → signed-out `https://api2.apicrewcare.com/Main/Login.aspx?ReturnUrl=%2fLATAM%2fmytravel.aspx`, título MyCrewCare Login, Email or Username/Next; após login exclusivamente pelo usuário retornou My Travel. Isso não comprova cadeia SSO completa.

Preparação admite navegação principal somente a My Travel exato ou Main/Login.aspx com ReturnUrl para esse My Travel (escapes hex lower/upper). POST principal somente no Login observado; corpo não é inspecionado. Recursos GET somente HTTPS na origem exata api2.apicrewcare.com (sem curinga de host); não inclui outros hosts/subframes/POST de recursos. Provider scripts próprios podem executar apenas no WebView visível; não há evaluateJavascript/DOM extraction/JS bridge nessa preparação. File/content/mixed-content/popups/downloads/permissions/SSL bypass negados. Nenhuma URL por intent, deep link ou campo arbitrário; nenhum browser/app externo aberto automaticamente.

`/LATAM/login.aspx?logout=1` é logout, nunca entrada; fixture `/LATAM/login.aspx` não autentica e é rejeitada. `sso2.apihotels.com/sso/sp/ACS.saml2` teve apenas URL/título Sign On Error observados, DOM recusado e cadeia não verificada; NÃO está liberado. Qualquer destino/origem externa falha explicitamente: “destino/SSO fora do escopo ou página não comprovada”. Se a autenticação exigir SSO externo, o teste fica bloqueado; não alega SSO funcional nem usa rota alternativa. Interceptação Android não cobre todos os redirects subsequentes: callbacks não constituem firewall de rede. Distribuição segue HOLD até validação específica de origens/rota e revisão independente.

## Ciclo da tentativa

Abrir Activity não cria WebView/navega. Preparar exige foreground, identidade esperada válida e autorização explícita consumida por tentativa. IDs debug/session/request aleatórios em memória; não são prova de autenticação. WebView criado via Profile.create, visível no layout; usuário digita somente no site oficial. Native não lê/captura campos de login, senha, corpo de formulário ou cookies. Autofill/saved-form state desligados; não importa sessão de produção. Cookies de sessão geridos pelo próprio WebView pertencem somente ao perfil de teste, que é limpo ao encerrar; nenhuma credencial é salva pelo app.

Enquanto prepara, campos/explicação cedem espaço ao WebView. Só retorno concluído a My Travel habilita o botão Verificar. URL, clique ou “concluí login” NÃO provam sessão válida. Handoff destrói o WebView visível antes da factory, usando o MESMO perfil/account. A aquisição existente confere identidade readonly do perfil antes/depois, targets, envelopes e scope; não lê formulário de login. Novos views por etapa não copiam cookies/token/sessionStorage. Continuidade cookie/profile vs sessionStorage permanece gate físico.

Candidato local de 12/10: exibe somente hotel, aeroporto, entrada/saída local e pickup dos dois trechos das observações validadas pelo owner, somente após identidade antes/depois E cleanup ok. Não exibe IDs de conta/reserva, HTML ou credenciais; não exporta/loga/importa/salva linhas. Datas/fusos/uso operacional continuam NÃO validados. Cancelar após resultado apaga a visualização. Não é prova de persistência de sessão nem autorização para distribuir. Cleanup pendente não é sucesso; falha/exceção/timeout bloqueia retry. Cancel/stop/destroy cancela preparação ou aquisição e limpa somente o perfil da tentativa pelo Runtime. Eventos de worker revogam preparação imediatamente, antes da entrega enfileirada; cada objeto de preparação só revoga a si mesmo. Callbacks antigos não encerram nova tentativa nem aquisição após handoff. WebView/UI/cleanup no main looper; worker não acessa API WebView.

## Testes e gate restante

81 casos sintéticos: Activity/factory/Source/Runtime/owner reais, Android/Profile/Store offline. Consent/identidade/foreground/suporte, single-flight/retry; quatro etapas×cancel/stop/destroy/timeout e HTTP/identidade estrangeira; cleanup pending/success/failure/throw/timeout; página visível sem injeção; mesma conta/perfil login→source; Login/POST observado e GET resource exact-origin; dez destinos proibidos (inclui SSO/logout/fixture/wrong ReturnUrl); preparação cancel/error/SSL/renderer/download/frame/worker; revogação antes do read enfileirado; callbacks antigos após nova tentativa/handoff; cleanup mesmo após exceção de stop/destroy, bloqueando read/retry/sucesso. Source/owner e prepared3TZ preservados. SDK gate prova exclusão release e permissões reais mescladas.

Não há rede/provider/SSO/sessão real durante desenvolvimento/testes. Nenhuma execução do browserworker foi solicitada por este agente. Nenhum health/diagnóstico, credencial real, logout real, envio, publicação em loja, merge/deploy/montagem/ativação. Sem APK entregue. Antes de distribuição: revisão independente exact-SHA, CI terminal e validação específica das origens. Depois, teste físico consentido do caminho completo; enquanto exigir destino não autorizado ou continuidade não comprovada, não oferecer como funcional/operacional. Datas/fusos/reconciliação operacional permanecem fora deste incremento.

Correção do blocker de handoff: evento inválido entregue depois de iniciar o clique mas antes do commit não pode sumir ao detach. Handoff mantém Login identificável durante stop/destroy; revogação e commit usam o monitor do mesmo objeto e conferem novamente token/current/running/revoked/stopFailed antes de retirar a referência. Sem monitor durante WebView/UI ou owner. Matriz adicional3fronteiras(status/stop/destroy)×4eventos(resourceworker/HTTP/renderer/start)=12 negativas; HEAD851e957c reproduz falha no status/resource, candidato bloqueia antes da aquisição. Eventos antigos após commit continuam ignorados. CI/revisão deste novo SHA exigidos; anterior não aprova a correção.

## Continuação funcional debug de 12/10 — revisão pendente

Mesma Activity/perfil e aquisição existentes, sem protótipo inerte ou transporte novo. Login interativo permanece na página oficial api2; destinos externos continuam bloqueados. A leitura usa o mesmo perfil isolado da tentativa, mas views distintas por etapa: isso preserva a atribuição de callbacks revisada. Não afirmar continuidade de sessionStorage. Se o portal depender disso, a tentativa deve falhar; não copiar sessão nem relaxar identidade para obter sucesso.

A página pública do produto e a política de privacidade consultadas não estabelecem proibição expressa de WebView, nem documentam uma API delegada de terceiros: suporte incorporado e comportamento físico ainda incertos, sem usar essa incerteza como blocker para preparação offline. Fontes: https://www.apiglobalsolutions.com/mycrewcare/ e https://www.apiglobalsolutions.com/privacy-policy/ . Nenhuma página autenticada/SSO foi consultada. Negativa de inspeção de origem não é proibição demonstrada do Android, mas permanece respeitada neste trabalho.

Artefato de usuário não gerado/entregue. Revisão do delta, CI SDK do novo HEAD e exclusão release exigidos antes de avaliar entrega. Não ampliar permissões ou liberar SSO. Esta fatia encerra e limpa a sessão após uma leitura; login persistente/reutilização entre execuções não faz parte deste candidato.

A reutilização da mesma WebView não foi introduzida neste delta: a atribuição de callbacks atrasados de mesma URL depende da instância distinta por requisição. Reusar apenas o objeto e trocar WebViewClient não prova qual navegação causou evento entregue após a troca. Exige novo protocolo de identidade de documento/navegação e revisão das 265 negativas do Source, não remoção da proteção. Negativa nova (82 casos debug): marcador sessionStorage sintético permanece somente na view de login; view de leitura distinta não o herda; leitura sem envelope válido termina sem resultado, com limpeza confirmada. Não alega que o provedor usa esse armazenamento; prova o fail-closed caso dependa dele.

## Blocker de preview após cleanup pendente — correção candidata

HEAD60af4f5e reproduz publicação de reserva depois de Cancelar com cleanup pendente. Autoridade de apresentação agora usa epoch separada do token de tentativa: Cancelar/onStop revogam inclusive quando leitura já terminou; cleanup conserva sua operação/token para concluir e propagar falhas. Commit da mensagem após cleanup confere tentativa, epoch e foreground; retorno a foreground não restaura epoch revogada. Erros/timeout continuam bloqueando retry, sem apagar falha para obter sucesso. Seis interleavings cancel repetido/onStop→resume × cleanup ok/failure/timeout; 88 casos debug totais. Sem APK, entrega HOLD até nova revisão exact-SHA. Incerteza SSO/sessionStorage não é, sozinha, veto a futuro APK controlado revisado.

## Estado de reserva e acesso ao resultado — revisão pendente

Cada reserva mostra confirmationRaw intacto. Planned é PLANEJADA, não confirmada; Cancelled é CANCELADA, com aviso para não utilizar hotel/pickup como reserva ativa; qualquer outro valor é ESTADO DESCONHECIDO, sem promovê-lo a confirmado. Três estados percorrem Activity/owner/cleanup reais com respostas sintéticas; formatação de múltiplas reservas mantém estado e aviso por registro. 92 casos debug totais.

Toda a tela fica em ScrollView nativa (controles e resultado), sem limite de linhas. Texto usa 16sp escalável e foco; WebView visível usa altura 360dp em vez de peso/altura zero dentro do scroll. Teste com doubles verifica hierarquia, foco e configurações, não geometria física/TalkBack. CI SDK prova compilação; tela pequena/fontes ampliadas e acessibilidade no aparelho continuam validação física após revisão do APK. Nenhum APK gerado/entregue nesta etapa.

Epoch de publicação capturada antes de chamar cleanup nativo, não após seu retorno: cancelamento/onStop→resume reentrantes durante início da limpeza também revogam resultado. Duas negativas adicionais; 94 casos debug totais.

## Falha terminal de limpeza preservada

Cancelar/onStop depois de falha/timeout preservam o aviso terminal, sem relabelar como pendente, sem reiniciar limpeza ou polling e sem liberar retry. Latch de falha terminal só controla apresentação; revogação do preview continua incrementando epoch. Quatro negativas falha/timeout→cancel repetido/onStop, além das anteriores: 98 casos debug. HEAD8d5f059b reproduz a negativa failure/cancel; novo SHA requer revisão e APK permanece HOLD.

## Diagnóstico da preparação física — candidato, sem novo APK

As capturas fornecidas demonstram a exibição da etapa oficial Email or Username/Next e telas de preparação encerrada com perfil limpo. Não mostram URL, callback nativo, senha, retorno autenticado a MyTravel ou ordem exata entre Next e a recusa. Não atribuir a falha a SSO ou credencial errada por essa evidência. Em a16e15d0, HTTP/TLS/renderer/recurso recusado produzem a mesma mensagem genérica; reprodução offline da Activity real confirmou as quatro causas indistinguíveis.

Novo candidato conserva exatamente portalOrigin/loginPage/loginTarget e os predicados de autorização. Classifica somente o primeiro evento causal com enum fixa: MCC-ROUTE (rota api2 não comprovada), MCC-ORIGIN (origem principal não comprovada), MCC-METHOD, MCC-RESOURCE-ORIGIN, MCC-RESOURCE-METHOD, MCC-FRAME, MCC-NETWORK, MCC-HTTP, MCC-TLS, MCC-RENDERER, MCC-DOWNLOAD. Não retém URL/path/query, cabeçalhos, corpo, descrição livre de erro, cookies, formulário ou identidade para diagnóstico. Falhas ainda revogam preparação imediatamente e exigem limpeza, sem permitir leitura. Diagnóstico é por tentativa, preservado durante limpeza pendente/falha; erro terminal e bloqueio de retry continuam autoritativos. Eventos posteriores não sobrescrevem o primeiro; tentativa nova limpa a classificação anterior.

Rótulos permanentes: sua matrícula no MyCrewCare e seu usuário/e-mail (não nome completo, não senha). Nenhum ID técnico/escala/data/fixture é solicitado. IDs técnicos já são automáticos. Não inserir identidade fictícia nem hardcodar dados das capturas: a identidade esperada é conferência independente de conta. Os rótulos e campos cedem espaço à página oficial durante preparação e reaparecem ao encerrar.

111 casos debug, incluindo 11 categorias, primeiro-evento HTTP seguido de renderer, saída segura sem URL/query/identidade, rótulos e continuidade de consentimento/limpeza; diagnóstico seguro mantido em cleanup pending/failure. Capturas não entram no pacote de revisão. Não solicitar novo retry do APK a16e15d0 como solução. Revisão exact-SHA e CI Android precedem geração de novo APK diagnóstico. Nenhuma garantia de login corrigido ou de contenção universal de rede; nenhuma origem ou permissão nova.

## Correção do registro e continuação #1035 (13/10)

**Correção:** as notas acima dizem "nenhum APK gerado/entregue". Isso deixou de valer: o APK debug do commit `a16e15d001f7cacf3d793cd9daffb6824294289c` (#1027) **foi entregue e testado fisicamente por Bruno em 13/10**. A página oficial abriu; após o e-mail, a tela fechou antes da senha e voltou à preparação. Não houve login concluído nem reservas importadas. As cinco capturas foram recebidas pelo owner; este agente não teve acesso a elas e não as analisou.

**Campos (sem presumir que usuário = e-mail):**

| Campo | Origem | Finalidade | Quem preenche |
|---|---|---|---|
| Matrícula | MyCrewCare › Perfil (`input#employeeId`, só números) | `ObservedScope.employeeId`, conferido no Perfil antes/depois da leitura | tripulante |
| Usuário do Perfil | MyCrewCare › Perfil (`input#userName`, comparação exata; pode diferir do e-mail de login; não é senha nem nome completo) | `ObservedScope.username`, idem | tripulante |
| Autorização | — | consentimento por tentativa | tripulante |
| IDs técnicos (`debug_<uuid>`, sessão, requisição) | memória | isolamento | app |

Reaproveitar dados já verificados não é possível neste APK: o pacote `.mcctest` não acessa armazenamento do app de produção (isolamento proposital). **Mudança necessária para o owner Mobile Core (fora destes arquivos):** na integração de produção, pré-preencher a matrícula a partir do `crewId` da escala canônica somente quando presente e validado; e trocar a digitação do usuário por "Perfil antes estabelece a identidade → usuário confirma versão mascarada → Perfil depois precisa ser igual" (contrato `ObservedScope`/asset em `CrewCheckMyCrewCarePortalV3`/`mycrewcare-transport-v3.js`).

**Diagnóstico reconciliado com `0624e99c`:** mantidos os códigos fixos `MCC-*` e o primeiro evento causal. Acréscimos desta PR, por instrução do owner ("tipo, método e domínio necessários"):
- `MCC-ORIGIN` e `MCC-RESOURCE-ORIGIN`: mostram o **domínio** (host minúsculo); `MCC-ROUTE`, `MCC-METHOD` e `MCC-RESOURCE-METHOD`: mostram o **método** (GET/POST/outro).
- Nunca caminho, query, fragmento, porta, credencial embutida, cabeçalhos, corpo, cookies ou identidade; nada em log.
- Próximo passo por categoria; matrícula/usuário mantidos; autorização exigida de novo.
- `MCC-BACKGROUND`: o login visível tolera até 3 min em segundo plano (app de MFA/e-mail) e é cancelado ao exceder; a leitura continua cancelando ao sair do primeiro plano.
- Revogação por epoch/foreground só para a prévia de reservas; motivos de falha continuam visíveis ao voltar ao app.
- **Allowlist de destinos inalterada.**

**Testes:** 122 casos debug (111 da base + 11): etapa de senha no próprio portal; e-mail → `login.microsoftonline.com` / `sso2.apihotels.com` (`MCC-ORIGIN` + domínio, sem caminho/query); XHR POST (`MCC-RESOURCE-METHOD`, sem caminho); CDN (`MCC-RESOURCE-ORIGIN` + domínio); HTTP; cancelamento; MFA dentro/fora do prazo; isolamento entre tentativas; `safeDomain`. A asserção da base que proibia o domínio em `MCC-ORIGIN` foi trocada por: domínio presente, caminho/query ausentes.

**APK de diagnóstico:** gerado somente pelo CI desta PR (`mycrewcare-v3-persistence.yml`, passo restrito à branch `fix/mycrewcare-debug-login-diagnostics`), artifact `crewcheck-teste-mcc-<head>` com `BUILD-INFO.txt` (commit, `aapt2 badging` com pacote/versão) e `SHA256SUMS`, retenção 7 dias. Assinatura debug do runner: desinstale o "CrewCheck • teste MCC" anterior antes de instalar. Não é Play Store nem release.

**Não é solução do login:** serve para identificar, no aparelho, o código e o domínio que encerram a preparação após o e-mail. Liberar qualquer provedor de autenticação exige essa evidência + revisão, com host exato (sem curinga) e fluxo mínimo.
