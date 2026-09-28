# Ponte GitHub → Manus — instalação segura

## Objetivo

Instalar uma ponte somente leitura entre o GitHub e o Manus para auditoria independente do PR #583, sem conceder ao auditor capacidade de commit, push, review, comentário ou merge no GitHub.

## Invariantes de segurança

1. O workflow reside na branch padrão (`main`) para que `issue_comment` funcione corretamente.
2. A chave de `concurrency` é estável e não contém SHA, permitindo cancelar uma execução anterior do bridge quando chega novo gatilho.
3. O comando `@manus` só é aceito de `OWNER`, `MEMBER` ou `COLLABORATOR`.
4. `MANUS_GITHUB_CONNECTOR_ID` é obrigatório e enviado explicitamente como único conector à tarefa Manus; o workflow falha fechado se estiver ausente.
5. O workflow usa somente `contents: read`, `issues: read`, `pull-requests: read` e `checks: read`.
6. A tarefa Manus recebe e deve auditar somente o SHA completo de 40 caracteres do HEAD do PR #583.
7. Se o HEAD mudar, a auditoria é considerada obsoleta e não pode aprovar outro SHA.

## Configuração necessária

Configure no repositório:

- secret de Actions `MANUS_API_KEY`;
- repository variable obrigatória `MANUS_GITHUB_CONNECTOR_ID` com o UUID do conector GitHub autorizado no Manus;
- opcionalmente `MANUS_AUDIT_PROJECT_ID` para um projeto Manus dedicado às instruções de auditoria.

## Comportamento

- `pull_request` em #583 (`opened`, `synchronize`, `reopened`, `ready_for_review`) cria auditoria automática do HEAD exato.
- comentário autorizado começando por `@manus` cria auditoria manual do HEAD atual.
- a tarefa Manus é `private`, executa com `interactive_mode: false` e recebe apenas o conector GitHub explícito.
- o workflow não publica comentário, review, commit ou merge.

## Concorrência

A `concurrency` do GitHub cancela outra execução do workflow ainda em andamento. Ela não cancela uma tarefa Manus que já tenha sido criada pela chamada HTTP. Por isso o prompt também exige revalidação do HEAD antes do veredito final.
