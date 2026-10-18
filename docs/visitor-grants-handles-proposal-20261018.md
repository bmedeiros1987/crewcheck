# Proposta OFF: visitantes, financeiro e @usuario

Base `main@1d8df68c`. Proposta local, sem rota montada, writes, migration, conta, permissões ou alteração de cobrança. Não altera arquivos da frente financeira nem o patch de autenticação/notificações. Os componentes de prévia não são importados por App/Home.

## Financeiro e emergência

Fluxo proposto: selecionar visitante existente → escolher categorias financeiras explicitamente → delimitar período → prévia exata com moeda/status/fonte → revisar destinatário, prazo e revogação → confirmação explícita do titular → servidor faz autorização transacional e só então publica projeção mínima. Tudo financeiro vem desmarcado; emergência é uma designação independente e não concede outras categorias.

Categorias propostas (ainda dependem de contrato da frente financeira): salário mensal, diárias, resumo do período. Não compartilhar PDFs/holerites brutos, contas bancárias, identificadores de folha, textos extraídos ou ledger bruto. Preservar período de competência versus pagamento, moeda original e estado previsto/confirmado/revisado; não somar moedas nem anunciar estimativa como recebido. Não recomputar cálculos neste módulo. Na ausência de projeção canônica confiável, negar o recurso.

`canReadFinancialProjection` é um contrato puro para testes e recebe snapshots server-side confiáveis, não autorização enviada pelo browser. Default OFF; exige visitante autenticado com audience correta, titular/destinatário exatos, grant ativo/revisão atual/não revogado/não expirado/entitlement atual, método GET e categorias/período requisitados contidos no grant. Não é uma rota nem uma fronteira de autorização pronta para produção. Leitura real precisará revalidar revogação/entitlement e revision no mesmo snapshot/transação da projeção, com no-store e proteção de cache; alterações concorrentes não podem enviar uma projeção autorizada pela revisão antiga.

Grant durável proposto: ID opaco, owner/visitor IDs internos, categorias e período, expiresAt explícito, revisão monotônica, status/revokedAt. Updates por CAS, sem restaurar grant revogado no retry. Auditoria apenas IDs/revisão/tipo/tempo; sem valores/saúde/e-mail/tokens. Logs de leitura precisam política de retenção e minimização. Revogar bloqueia acessos futuros; não remove cópias já vistas.

Designação de emergência: titular escolhe visitante e confirma sua finalidade; contato só é acionado pela ação existente explicitamente confirmada, não por gatilho novo. Não herda saúde/financeiro/localização/quarto ou envio pago. Quantidade de contatos, fallback, aceitação do destinatário e duração dependem de decisão de produto; não criar pacote comercial ou quota adicional por suposição.

## Limites por assinatura existentes

`scripts/v1431/apply.mjs` já define `planOperationalLimits`: Essencial 1 visitante; Premium mensal/anual/Unlimited 5. O teste extrai e executa essa função real. Não há aprovação inferida para outros números, preços ou tiers de compartilhamento financeiro. A implementação atual usa partes de profile.plan como fallback: a integração sensível deve usar entitlement autoritativo fresco e negar quando desconhecido, não confiar em label do cliente. Não editar planos/preços. Reutilizar também a trava de quota transacional da #893. Quota do plano não representa consentimento do titular para divulgar valores.

## Duplicidade: linha existente

Reutilizar PR draft #893 HEAD f74175a914ea355f09fa3d52a9d646c7fd2b988f, atualmente mergeable=false: ela já resolve par lógico de colegas e repetição de visitante sem rotacionar senha/token/permissões, incluindo concorrência. Não copiar outro backend divergente, não mesclar linhas reais, não proibir múltiplos dispositivos. Reconciliar branch com main e reexecutar MySQL/CI/revisão antes de integrar. Nenhum resultado histórico dessa PR foi declarado novo teste aqui.

## @usuario separado de e-mail e nome

Proposta validada localmente: 3–24 ASCII, começa com letra, restante letras/números/underscore, @ apenas na apresentação, trim nas extremidades e lowercase para chave canônica. A função recusa unicode/confusáveis, espaço interno, URL/e-mail ou pontuação. Isso é proposta de formato, não política já aprovada. Sugestões locais são rotuladas "não verificado" e nunca criam conta nem consultam diretório.

Hoje perfis têm public_id único e visitantes têm identidade vinculada ao titular, por e-mail; não há namespace de handle canônico. Implementação real exige migration aditiva revisada com índice UNIQUE na chave normalizada, reserva/rename transacionais e idempotentes, regras de nomes reservados/retirada, limites de frequência e resposta de conflito sem revelar titular/e-mail/existência de conta privada. Validar no client e repetir no servidor; preflight de disponibilidade nunca substitui insert com UNIQUE. Não criar endpoint público que enumere e-mails. Nome de exibição não é chave de identidade.

Para um handle representar a mesma pessoa em convites de titulares diferentes, é necessária decisão explícita de vinculação a identidade verificada; igualdade de e-mail não autoriza unir contas ou compartilhar grants. Não usar @handle como login até esse contrato existir. Manter public_id e e-mail atuais compatíveis; nenhum rename, alias ou conta real criado.

## Decisões e dependências

1. Aprovar formato/reservados/rename de handle e migration aditiva, com identidade de visitante definida.
2. Frente financeira fornecer DTO mínimo autoritativo, por categoria/período/moeda/status e definição de campos sensíveis.
3. Aprovar regras de prazo/aceitação e auditoria dos grants, inclusive revogação concorrente.
4. Escolher quem pode ser contato de emergência e seu limite, sem presumir pacote novo.
5. Permissões reais só após titular selecionar destinatário e categorias na prévia e confirmar.

Tentativa de coordenação por mensagem à thread financeira foi negada pela revisão automática por ausência de autorização direta para esse envio. Não houve retry ou rota alternativa. Este documento é o handoff para o parent encaminhar; não afirma acordo com o owner.

## Validação

Contrato sintético PASS: default deny/OFF, categorias/períodos estritos, identidade/revisão/revogação/expiry/entitlement, GET only, emergência sem herança, envelope de auditoria sem dados, handles case-insensitive e sugestões sem promessa de disponibilidade, limites canônicos 1/5. Não demonstra SQL concorrente nem integração real. TypeScript e teste DOM dos componentes são registrados nas evidências da tarefa. Backend, schema e direitos produtivos continuam inalterados.
