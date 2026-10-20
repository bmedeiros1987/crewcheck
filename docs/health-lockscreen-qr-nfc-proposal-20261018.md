# Saúde: imagem local e proposta QR/NFC

Base `main@1d8df68c`. A frente não altera Home/header/financeiro/notificações. Rótulos de Guardian passam a Saúde nos componentes públicos/administrativos/suporte/sobre/privacidade e nos materializadores de menu. Rotas `/guardian`, API, IDs, schema, componentes e chave de storage conservam seus nomes técnicos. A renomeação não torna dados médicos declarados pelo titular clinicamente verificados.

## Imagem para tela bloqueada implementada localmente

O painel Saúde recebe `HealthLockscreenCard`: todos os campos desmarcados; sem rede, clipboard, armazenamento de seleção ou exportação automática. O titular escolhe campos preenchidos, abre a prévia e só depois marca consentimento específico para salvar PNG. Alterar seleção/dados invalida a prévia; uma nova prévia requer novo consentimento. Texto/seleção vazios ou conteúdo extenso demais bloqueiam geração, sem corte silencioso. SVG local escapa texto; conversão a PNG ocorre no navegador, apenas na ação de salvar autorizada pelo usuário.

A imagem tem margem superior para relógio, não contém QR/token/link e não concede acesso ao banco. Não expira, não se atualiza e não pode ser revogada após cópia/fotografia; a interface explica isso antes de salvar. Salvar imagem e aplicar papel de parede são ações diferentes: o usuário deve selecionar a imagem nos ajustes/galeria do próprio Android, conferir recorte/relógio/controles e escolher tela bloqueada. O wrapper atual não expõe WallpaperManager ou ponte de definição de wallpaper; download de blob em WebView varia e precisa teste físico. A UI informa fallback de navegador compatível caso salvar falhe. Nenhum wallpaper real/exportação de dados reais foi realizado.

O botão antigo de gerar vários QR foi removido da sessão atual: após sucesso só permite revogar o cartão exibido; um ref bloqueia criação simultânea por duplo clique. Isso não prova unicidade por conta: o servidor atual continua permitindo vários registros e a tela não descobre cartões anteriores após reload. Não apresentar esse ajuste local como solução durável de QR único.

## Auditoria do QR atual

Fonte `server/v14316/controlCenter.mjs`: token aleatório de 32 bytes em URL; banco retém hash SHA-256 e payload AES-256-GCM; leitura pública exige posse do token, revoked_at nulo e expires_at futuro, mas não login do leitor. Padrão 72 h; clamp 1–720 h; coluna expires_at NOT NULL. Revogação exige identidade do titular e filtra por owner_email. O QR é link revogável, não dados médicos embutidos diretamente. Cada POST insere novo registro; não há unicidade ativa por owner. Ler incrementa contador/last_opened_at e não é uma operação sem writes no servidor, embora o cartão apresentado seja somente leitura. Não foi gerado token real nesta tarefa.

O formulário antigo usava cache global, confirmado pela regressão sintética. A correção local agora exige identidade confirmada, lê somente cache v2 da conta, preserva o legado v1 sem leitura/migração/exclusão e cerca operações assíncronas pela geração da sessão. Consulte `health-cache-isolation-20261018.md` para limites, inclusive armazenamento local sem criptografia, confirmação online e ausência de garantia de revogação remota instantânea.

## Contrato proposto: um único acesso por titular, prazo opcional

`shared/health-access-proposal/single-access.mjs` é contrato OFF, sem rota/DB/token writer. Um registro por ownerId, revision CAS monotônica, fingerprint do token, campos explicitamente escolhidos e status. O dono deve escolher `never` (expiresAt null) ou `at` (data futura); nenhuma escolha ilimitada é inferida de campo ausente. Substituição exige novo fingerprint, incrementa revisão e invalida token anterior; revogação invalida QR e NFC juntos. Os testes comprovam só a máquina de estados, não transações de banco.

Integração precisará migration aditiva revisada e atomicidade real: chave única por titular para slot ativo, lock/CAS de leitura/rotação e tratamento de resultado incerto. Não apagar cartões antigos nem escolher automaticamente qual manter: inventário dos existentes, decisão explícita do dono e plano de migração não destrutivo. Um token antigo deve parar de funcionar antes de confirmar substituição. A manutenção de um mesmo link para QR/NFC evita um segundo grant; a rotação invalida ambos e exige atualizar QR e tag.

A UI `HealthAccessProposal` é deliberadamente não montada: expõe as duas opções de prazo e explica acesso por posse do link, sem botão habilitado para gravar. O servidor real continua temporário e sem mudança de schema/ACL/expiração.

Decisão de segurança a aprovar separadamente: permitir link de saúde sem vencimento automático para os campos selecionados, legível por qualquer portador até revogação/rotação; um único slot ativo por titular; substituir não recupera cópias já vistas. Isso amplia a duração do acesso atual e não deve ser ativado por simples renomeação. Também requer atualizar divulgações legais mantendo descrição fiel da versão efetivamente ativa.

## NFC e Android

Proposta: tag NDEF com o MESMO link HTTPS do QR, sem dados de saúde em claro na tag e sem nova credencial. `healthNdefPreview` só prepara o objeto de registro para teste, valida origem/path exatos e uma única query token, e não chama hardware. Não há suporte NFC implementado no wrapper atual, nem permissão NFC nova neste patch. Gravar tag exige hardware/tag gravável compatível, ação explícita e conferência de readback após autorização. Não bloquear tag permanentemente nem prometer NFC telefone-a-telefone universal.

Documentação oficial: Android recomenda NDEF e requer declaração de acesso para integração nativa com hardware; leitura de links é tratada pelo sistema/atividade conforme versão: https://developer.android.com/develop/connectivity/nfc/nfc . Web NFC é limitado a NDEF no Chrome Android, depende de contexto seguro, suporte e permissão: https://developer.chrome.com/docs/capabilities/nfc . WallpaperManager tem ações/flags específicos para papel de parede: https://developer.android.com/reference/android/app/WallpaperManager . Neste patch a alternativa é salvar imagem local e aplicar manualmente pelo sistema; não se adicionou permissão ou SDK.

## Gates

PASS local: escaping/allowlist SVG, nenhum campo não selecionado, sem token/QR, vazio/overflow negados; UI real com nenhuma seleção inicial, sem downloads/redes automáticos, prévia+consentimento, invalidação de prévia, sem writer de NFC; contrato OFF de CAS, conflito, rotação/revogação/prazo explícito e mesmo link QR/NFC. TypeScript/Vite preparados PASS antes da trava adicional de clique; revalidação final registrada separadamente. CUA a 390px sem overflow horizontal, somente dados fictícios, sem exportar.

Antes de integrar: revisão independente, CI remoto, revisão final do isolamento de cache de conta, teste físico de download/recorte/acessibilidade no Android e navegador, reconciliação com o owner do Home para os rótulos gerados. Antes de alterar QR real: aprovação do escopo persistente e migration/transações/DTO revisados, com teste MySQL concorrente e revogação. Antes de NFC real: aprovação da implementação/hardware/permissão estritamente necessária e teste em tag, sem expandir acesso.
