# Hotel manual: persistência autenticada, sem integração MCC

> **HOLD — não fazer merge/deploy.** Descrição histórica do contrato v1 abaixo.
> A revisão encontrou rename→sync destrutivo e revisão ABA insuficiente.
> O candidato v2 está conectado às rotas/UI/sync, mas NÃO implantado: ver [bloqueios e próximos passos](hotel-binding-candidate.md).
> Existe agora um arquivo de migração somente para revisão; ele não foi executado.

Base: main `1d61ca81481782f9a6685a1044c3ed5895feb1d7`. Slice autorizado: handleStays, métodos stays do cliente/cache e PresentationStayManagerView. Não altera Home, auth, Asaas, health, Wear, Android ou contratos/workflows MCC.

Salvar um pernoite contextual guarda o draft local e tenta sincronizar **somente o hotel**. Exige GET remoto com stayContractVersion1, conta/sessão ainda atuais, um único pernoite operacional e no máximo um registro remoto na mesma data/aeroporto. Se houve mudança desde a leitura anterior, pede releitura. PATCH envia ID/revisão ou criação com revisão null; GET posterior confere ID/revisão e campos enviados. Erro deixa mensagem explícita de sincronização pendente. APZ/quarto/preferências continuam locais; não são convertidos em fatos do fornecedor. Não programa despertador.

No servidor, transação usa conexão dedicada, lock do perfil proprietário e lock do registro; UPDATE é por id+owner_email. ID ausente/estrangeiro retorna404, vários registros candidatos409, revisão divergente409. Revisão é hash de conteúdo dos campos persistidos, sem nova coluna. Não é identidade do fornecedor nem autenticação. Duas gravações de primeiro cadastro/retry da mesma conta/data/aeroporto são serializadas; replay com conteúdo idêntico não duplica nem treina regra. Duas estadias distintas na mesma data/aeroporto exigem revisão: este contrato conservador não inventa vínculo por evento. Não há migração.

Campos omitidos preservam quarto, apresentação, antecedência e ambos os compartilhamentos. Booleans/antecedência explícitos são validados. Aprendizado só quando solicitado e com antecedência explícita, depois de validar registro; o novo fluxo hotel-only não o solicita. Clientes legados seguem aceitos, com semântica segura de campos omitidos; versão/CAS é exigida no contrato1.

Cache somente por owner autenticado; não adota cache global legado. Resposta A após logout/login B é descartada por captureAuthSession existente. PATCH nunca faz gravação otimista nem converte erro em sucesso. Cache de GET falho só aparece como localOnly/ok:false em indisponibilidade0/5xx, não em401/403/conflito. Não há fila ou retry automático. O editor recusa sincronização em servidor antigo que não anuncia contrato1.

Não há colunas para transporte, pickup, statusPLANNED/CANCELLED, reserva do fornecedor, check-in/out, fuso ou proveniência; o contrato1 rejeita campos extras em vez de fingir persistência. Esses campos e o patchplan MCC permanecem para revisão separada. Nenhum dado real, credencial, envio ou alarme foi usado nos testes.

Validação:13 testes novos exercitam o handler literal extraído e o cliente real com adapter SQL sintético, incluindo composição PATCH/GET, retry de resposta perdida, conflitos, campos omitidos, foreign ID,affectedRows0 e trocaA/logout/B;33 testes existentes de stay-edit-plan/editor-persistence; TypeScript sem emissão; node --check e git diff --check. Não é ensaio de MySQL real nem teste visual de produção. Revisão independente e composição com outros owners exigidas antes de merge/deploy; não houve nova gravação na conta real.
