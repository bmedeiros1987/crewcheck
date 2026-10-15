# MyCrewCare SSO: contrato sanitizado inativo para revisão

Estado: TESTES/CONTRATO; nenhuma rota liberada. Base main 6bb888447020e10b71723acb0dad3b96680f4e8a, 2026-10-15. A PR1035 de Claude permanece independente e intacta no head 74f5159d632e1cc74b7bc2aada354b751d082a66, base 0624e99c7fb0d0672cdce6ace1657039803d84f5. Não foi possível confirmar a atividade da sessão do owner; nenhum arquivo daquela branch foi alterado.

## Proveniência e fatos

O documento existente docs/mycrewcare-debug-test-off.md descreve a entrada MyTravel, Main/Login.aspx com ReturnUrl exato e o bloqueio de destinos externos. Sua observação anterior do ACS era só Sign On Error; isso não autorizava SSO. O relato sanitizado fornecido pelo usuário em 13/10 acrescentou o percurso abaixo, em navegador do usuário; não prova o percurso no APK. Não reabrimos capturas, URLs de autenticação ou provedores.

| Etapa observada | Origem HTTPS exata | Caminho exato | Método / estrutura conhecida |
|---|---|---|---|
| Login inicial | api2.apicrewcare.com | /Main/Login.aspx | GET 200, depois POST 302; contrato preexistente |
| Entrada SSO | api2.apicrewcare.com | /LATAM/SSOLogin.aspx | GET 302, sem query inicial |
| Broker | sso2.apihotels.com | /sso/sp/startSSO.ping | GET 302; chaves PartnerIdpId, TargetResource; destino público exato da entrada SSO |
| IdP | login.microsoftonline.com | /{tenant-uuid}/saml2 | GET 200 e etapas internas não completamente inventariadas |
| ACS do broker | sso2.apihotels.com | /sso/sp/ACS.saml2 | POST 302 do navegador |
| Retorno | api2.apicrewcare.com | /LATAM/SSOLogin.aspx | GET 302, chave opentoken; valor opaco, não acessado |
| Destino | api2.apicrewcare.com | /LATAM/mytravel.aspx | GET 200 |
| Calendário auxiliar | api2.apicrewcare.com | /LATAM/mycrewcalendar.aspx | GET 200; não prova identidade e não habilita aquisição |

Nenhum tenant, identificador de parceiro, valor opaco, assertion, cookie real ou corpo de autenticação foi copiado, inferido ou persistido. Método/estado HTTP do relato são evidência do navegador, não garantia de todos os redirects possíveis. O fixture não trata observação como autorização.

## Patch debug inativo

scripts/fixtures/mycrewcare-sso-contract/debug-inactive.patch propõe SOMENTE uma classe debug desconectada, sem caller, flags, rede, URLs completas, queries, armazenamento ou corpos de formulário. Não foi aplicado. Mesmo se aplicado, permitsNavigation e permitsAcquisition devolvem false incondicionalmente. Não integra a política real de rotas, Activity, Source ou Runtime. Não é um segundo fluxo de aquisição.

A API recebe apenas origem/caminho/método sanitizados e enums de fase/estrutura; não recebe URL bruta nem o valor opaco. Os nomes de estrutura descrevem fatos, não validam parâmetros. BROKER_KEYS_ONLY_UNVERIFIED continua não verificado, portanto bloqueado. O IdP é sempre UNKNOWN. Nenhum parser de tokens foi introduzido.

## Testes executados e limites

    node --test scripts/regression-mycrewcare-sso-draft.mjs

PASS: 2 testes Node; harness Java com 40 casos. Cobertura: fatos sanitizados; origem com sufixo, userinfo, porta explícita, HTTP; caminho codificado, variante, query/fragmento embutidos; método ausente/desconhecido/incorreto; fase e estrutura inconsistentes; ACS POST convertido em GET; calendário indevidamente usado como destino; IdP sem contrato; todas as classificações permanecem sem acesso. Segundo teste confere o patch contra a fonte fixture. git apply --check do patch: PASS. Não prova a política ativa nem WebView.

RedirectInstrumentation.java e AndroidManifest.synthetic.xml são um ensaio separado, pacote lab.mcc, fora de sourceSets do app. Servidor em 127.0.0.1 com porta efêmera, formulário e corpo literais sintéticos; asserções de POST real → 302 → GET sem corpo, cookie HttpOnly no mesmo contexto e limpeza assíncrona. Usa loadUrl só para o GET inicial. Não instrumenta a Activity CrewCheck, não testa seu filtro de rotas, não prova SSO e não executa cleanup do Profile real.

Compilação executada contra android-36/android.jar com javac -source 17 -target 17: PASS, warning de system modules path. --release 17 não é suportado no JDK reduzido deste ambiente; não alegamos compilação com essa opção. Execução instrumental: NÃO EXECUTADA.

Bloqueio: sem SDK/emulator, SDK/system-images ou /dev/kvm; adb aborta ao criar /home/agent/.android read-only, inclusive com ANDROID_USER_HOME e ANDROID_PREFS_ROOT locais. Não foi possível enumerar dispositivos. Sem escalada ou contorno. Main não possui workflow com emulator/connectedAndroidTest/instrumentation; AndroidJUnitRunner declarado em Wear não fornece execução instrumental. Nenhuma nova configuração CI, serviço, permissão ou custo foi criada.

## Mínimo que falta e obtenção prática

1. Ambiente Android descartável, sem contas reais, com API26+ (preferir36), WebView instalado/ativo, adb funcional e diretório Android provisionado gravável. Um operador autorizado deve provisionar esse ambiente; não mudar permissões do ambiente bloqueado como atalho. Empacotar somente lab.mcc em projeto Android isolado com as duas fontes fornecidas, instalar nesse ambiente e rodar `adb shell am instrument -w lab.mcc/lab.mcc.RedirectInstrumentation`. Guardar somente saída PASS/FAIL, API Android e versão WebView. O manifest cleartext é só para loopback desse teste, jamais para CrewCheck. Não exige provedor, credenciais ou rede externa.
2. Contrato confiável do tenant IdP, caminhos/métodos e subrecursos necessários, e contrato do identificador de parceiro. Solicitar ao responsável técnico do provedor uma especificação estática sanitizada dos endpoints e regras de validação/correlação. Não pedir URL da barra, HAR, cookies, tenant/PartnerIdpId copiados da autenticação, assertions ou valores de query. Se as regras não puderem ser fornecidas por fonte aprovada, manter essa parte bloqueada. Não adivinhar tenant nem aceitar qualquer UUID/host.
3. Revisão da arquitetura de validação de retorno: como conferir a rota e o nome da chave sem copiar, registrar ou entregar seu valor opaco ao código nativo. Não alegar que a API sanitizada resolve sozinha a criação segura desses campos no Android. SAML permanece validado pelo broker/IdP, não pelo app.
4. Depois de contrato completo e revisão específica: testes da política efetiva e do WebView real para POST (shouldOverrideUrlLoading não cobre POST), redirects 302/307/308 distintos, origens externas e métodos inesperados, cookies/contexto, cancelamento, timeout e limpeza sem sucesso tardio. Não usar callbacks como firewall de rede nem converter POST em loadUrl/GET.

Sem confirmação prematura: preparação inativa e testes já estão autorizados. Ainda não existe proposta de acesso completa que uma confirmação genérica possa desbloquear. Quando houver contrato completo e ensaio executado, apresentar diff concreto de segurança para revisão específica antes de alterar a política efetiva. Persistência, sincronização automática, release/lojas, dados reais, merge/deploy e ativação continuam fora deste trabalho.
