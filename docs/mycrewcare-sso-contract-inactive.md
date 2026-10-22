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

### Atualização do laboratório em 2026-10-22

O ensaio original usava CookieManager global e não provava o Profile real. Foi substituído
por projeto Android isolado, com Activity própria e fonte original inalterada de
CrewCheckMyCrewCareProfile incluída por source-set e hash verificado. O plano cobre
cookies A/B, destruir/recriar views, clear real com callback, sessionStorage sem cópia,
302/307/308 e resultado conservador após cancelamento/timeout/callback tardio.

Veja [laboratório de sessão OFF](mycrewcare-session-lab-off.md) para fontes/proveniência,
asserções, comandos e limites. Os testes JVM dos helpers não são execução Android.
O workflow MCC existente recebe compilação isolada sem APK/instalação; instrumentação
continua NÃO EXECUTADA enquanto não houver executor descartável autorizado com rede
já isolada. Nenhuma permissão/custo/serviço/contrato SSO foi criado ou ampliado.

## Mínimo que falta e obtenção prática

1. Executar o laboratório real-Profile conforme o documento ligado acima, somente em
executor descartável autorizado já provisionado e isolado. Compilação e testes JVM não
substituem essa evidência; não instalar no dispositivo real do usuário nem mudar
permissões/rede de um ambiente bloqueado para contornar a ausência de executor.
2. Contrato confiável do tenant IdP, caminhos/métodos e subrecursos necessários, e contrato do identificador de parceiro. Solicitar ao responsável técnico do provedor uma especificação estática sanitizada dos endpoints e regras de validação/correlação. Não pedir URL da barra, HAR, cookies, tenant/PartnerIdpId copiados da autenticação, assertions ou valores de query. Se as regras não puderem ser fornecidas por fonte aprovada, manter essa parte bloqueada. Não adivinhar tenant nem aceitar qualquer UUID/host.
3. Revisão da arquitetura de validação de retorno: como conferir a rota e o nome da chave sem copiar, registrar ou entregar seu valor opaco ao código nativo. Não alegar que a API sanitizada resolve sozinha a criação segura desses campos no Android. SAML permanece validado pelo broker/IdP, não pelo app.
4. Depois de contrato completo e revisão específica: testes da política efetiva e do WebView real para POST (shouldOverrideUrlLoading não cobre POST), redirects 302/307/308 distintos, origens externas e métodos inesperados, cookies/contexto, cancelamento, timeout e limpeza sem sucesso tardio. Não usar callbacks como firewall de rede nem converter POST em loadUrl/GET.

Sem confirmação prematura: preparação inativa e testes já estão autorizados. Ainda não existe proposta de acesso completa que uma confirmação genérica possa desbloquear. Quando houver contrato completo e ensaio executado, apresentar diff concreto de segurança para revisão específica antes de alterar a política efetiva. Persistência, sincronização automática, release/lojas, dados reais, merge/deploy e ativação continuam fora deste trabalho.
