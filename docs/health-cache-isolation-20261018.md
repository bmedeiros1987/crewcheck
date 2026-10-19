# Isolamento local do rascunho médico

Correção da exposição reproduzida na fixture: a implementação anterior carregava o registro global `crewcheck:guardian:form:v1`, inclusive sem credencial. O teste novo falha nessa implementação antes da correção (`health-account-baseline.log`). Não foram lidos ou modificados registros reais durante o trabalho.

## Limite por conta e sessão

A tela agora confirma a identidade pela rota GET existente `/api/auth/me`, sem novo login. Só monta o formulário quando o owner retornado corresponde à identidade da sessão capturada e o token/geração permanecem atuais. Sem credencial, identidade inconsistente, visitante, 401 ou falha de verificação, a tela não lê nem exibe o rascunho. Há timeout de 10 segundos e retry explícito; indisponibilidade não apaga o token nem os dados locais.

O novo cache usa chave v2 por owner e envelope com schema/owner. Leitura exige coincidência e usa allowlist de campos/limites. Apenas uma edição explícita grava o rascunho; montar a tela não sobrescreve registros ausentes, inválidos ou atribuídos a outra conta. A entrada v1 não é lida, migrada ou apagada. Não se pode atribuir seu conteúdo à conta atual sem confirmação; recuperação/migração de legado precisa desenho separado. Logout, troca e expiração não apagam nenhum rascunho médico.

Auth-will-change oculta o contêiner imediatamente, invalida a geração e desmonta o formulário. Eventos de auth, storage (inclusive clear), foco/pageshow/online e visibilidade verificam novamente a sessão; pagehide/aba oculta bloqueiam a apresentação. Respostas HTTP e geração assíncrona do QR só atualizam a geração original ainda válida. Criação, revogação, copiar/testar/baixar link e geração PNG verificam a sessão; o PNG revalida depois de decode e depois de toBlob, antes de iniciar download. Um envio já iniciado não pode ser desfeito por uma troca posterior; a correção suprime resultado/UI de outra geração e não repete requisições.

## Limites explícitos

É isolamento de apresentação e namespace por conta no mesmo origin, não criptografia local nem proteção contra XSS/DevTools/acesso ao perfil do dispositivo. Valores v2 continuam localStorage do navegador. Nenhum JWT é persistido pelo cache. A confirmação online é exigida para reabrir a tela; sem rede ela permanece protegida. Uma imagem já salva continua offline e não pode ser revogada. Revogação remota só é observável quando o servidor confirma a invalidação numa requisição; não há novo poll, push ou revogação instantânea garantida de uma aba continuamente aberta.

Não muda o endpoint de criação/revogação, ACL, duração de tokens/QR, schema do banco, compartilhamento de visitante, senha ou criptografia do servidor. Não assegura unicidade durável de QR por conta; o contrato dessa mudança continua OFF.

## Testes

`regression-health-account-isolation.mjs` empacota GuardianCenterView e authClient reais com React; somente fetch, QR encoder e toasts são adapters sintéticos. Cobre: sem credencial/legado, confirmação de owner, cache A/B, edição só em A, login/logout/expiry, A→B→A com POST antigo, QR encoder atrasado, updates de storage incompletos, 401 confirmado no foco, falha de rede com recuperação explícita, registro v2 com owner incorreto sem sobrescrita, revogação do QR mantendo o draft e cancelamento da exportação após logout durante decode. Não há DB ou chamada real. O workflow replica raw/preparado; os demais testes de imagem/contrato permanecem obrigatórios.
