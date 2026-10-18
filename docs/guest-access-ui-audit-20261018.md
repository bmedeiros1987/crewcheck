# Acesso de visitante: UI e auditoria somente leitura

Base isolada: main `1d8df68cbe74044770823068e6347b1716ead7e6`. Não inclui financeiro, Home/header, notificações ou FCM. Nenhuma conta, senha, permissão ou dado real alterado.

## Alteração pronta para revisão

`VisitorAccessPage` agora tem formulário semântico (Enter envia), campos com autocomplete de usuário/senha atual/nova, mostrar/ocultar independente com nome acessível/estado e alvo de 44px, regra visível e erros curtos. Segredos não são normalizados, registrados ou persistidos pelo patch. Um ref impede duplo envio síncrono; falha mantém os campos para correção. Não há retry automático ou contorno do rate limit. A recuperação informa o fluxo existente de pedir ao titular o reenvio do convite; não aciona reset da conta principal.

O mínimo de visitante continua 10 e máximo 256, como no servidor. Símbolos não são obrigatórios. A conta comum já oferecia olho e mínimo 8; não foi alterada.

## Política e proteções atuais (fonte, não prova de produção)

- Visitante: `server/platform.mjs` `handleVisitorAccept` exige token, e-mail, senha temporária válida e nova senha de 10–256. `passwordHash` usa scrypt com salt aleatório e comparação constante. Não há exigência de composição alfanumérica/símbolos nesse fluxo.
- Conta principal: `server/v139/auth.mjs` mais materializador `scripts/v14397/apply.mjs`: 8–128, confirmação separada, rejeição de controles e espaços nas extremidades. A UI já explica símbolos opcionais. Login não aplica o mínimo de nova senha retroativamente.
- Visitante: cookie separado HttpOnly, SameSite=Lax e Secure em produção; JWT de 30 dias com audience/role visitante. Dados revalidam status ativo, titular e permissões no banco. Revogação impede novas leituras; logout apaga o cookie. Sessão de visitante não equivale a conta do titular.
- Throttle de visitante: fingerprint IP+e-mail, janela/bloqueio de 15 minutos e limiar nominal 5 falhas. Se a tabela opcional `crewcheck_platform_auth_attempts` não estiver pronta, a proteção deixa de registrar/bloquear. O upsert usa atribuições sequenciais de failures e failures+1: confirmar em MySQL real o possível bloqueio na quarta falha, antes de apresentar contagem exata. Confiança no primeiro X-Forwarded-For depende do proxy de produção; configuração não foi alterada nem validada neste trabalho.
- Recuperação principal: código de 6 dígitos, hash, expiração e máximo 5 tentativas, transação com row locks e uso único. Não é fluxo de recuperação do visitante.
- Convite visitante atual verifica status/token, mas não há prazo temporal explícito no SELECT de convite; o texto "expirado" não demonstra expiração. Reenvio/revogação aposentam tokens; revisar a PR abaixo antes de integrar.
- Financeiro atual usa `ledgerOwner` e exige identidade owner; não habilitar visitante chamando a rota do titular nem confiar em e-mail de query/body.

## Duplicidade: reaproveitar #893

PR existente https://github.com/bmedeiros1987/crewcheck/pull/893, HEAD `f74175a914ea355f09fa3d52a9d646c7fd2b988f`, draft, não merged, mergeable=false na consulta. Já implementa par lógico de colegas com locks ordenados, preservação de status/permissões, criação de visitante idempotente sob lock de quota, aceitação atômica e projeção de privacidade. Tem testes de concorrência MySQL e browser próprios; resultados históricos do texto da PR não foram reapresentados como execução atual.

A segunda imagem foi classificada pela Library como Colegas e chat com linhas repetidas em direções opostas. Isso não pede bloqueio de múltiplos aparelhos. Não se criou outro backend equivalente nem se apagaram/consolidaram linhas reais. Integração exige reconciliar #893 com main, executar CI e revisão no novo SHA e preservar #891/#892. A chave SQL existente (owner_email,email) não impede sozinha que o antigo upsert regenere identidade/segredo de um convite repetido.

## Pedido de senha de 6 caracteres: decisão pendente

Não aplicado. Reduzir 10→6 no visitante (e eventualmente 8→6 na conta) aumenta a viabilidade de adivinhação, especialmente diante do throttle opcional e da fronteira de proxy ainda não comprovada. O pedido "alfanumérico" também precisa esclarecer se obriga letra E número ou apenas permite ambos; a política atual permite senhas só com letras. Sugestão: primeiro unificar mensagens/UX, confirmar proteção durável e recuperação; submeter separadamente eventual redução com escopo explícito visitante versus conta. Não fabricar aceitação de 6 na UI enquanto o servidor exige 10.

## Referências visuais e limite

As duas imagens originais da Library foram materializadas pelo helper oficial e inspecionadas no Mac. Confirmam os campos sem olho/regra e o bloqueio de tentativas na aceitação, além de duas linhas da mesma conexão nas direções enviada/recebida. Não foram enviadas a revisores nem incorporadas às fixtures; os screenshots locais usam somente dados fictícios.

## Validação

Teste DOM importa página/componente reais e intercepta todas as requisições: convite/login, ausência de envio no mount/olho, política de 6 recusada, 10 sem símbolo preservada, autofill, duplo envio, mensagem privada não exibida, throttle e ausência de retry. PASS raw e preparado; TypeScript/Vite PASS na árvore preparada. Conferência CUA em 390px: sem overflow horizontal, alvos de olho 44×47px. Teste físico/leitor de tela/integração de convite real e revisão independente ainda pendentes. Nenhum push, PR, CI remoto, merge ou deploy feito nesta frente.
