# CrewWatch pela nuvem

Pedido: o relógio sincroniza pela nuvem, não só pelo celular, com economia de bateria. Decisões do responsável pelo produto (27/10/2026): o celular publica e o relógio busca; atualização por aviso push quando muda e por consulta periódica de segurança.

## Como funciona

1. **Pareamento.** No app Android, com o relógio pareado, o celular pede uma credencial (`POST /api/watch/cloud/pair`) e a entrega ao relógio pelo Data Layer (`/crewcheck/watch/cloud/v1`). É uma credencial por conta; parear de novo invalida a anterior. O servidor guarda só o SHA-256 do segredo. O relógio guarda a credencial cifrada com chave própria do Android Keystore.
2. **Publicação.** O celular envia à nuvem a mesma projeção que já manda por Bluetooth (`PUT /api/watch/cloud/snapshot`), com a mesma lista de campos permitidos do `CrewCheckWatchPublisher`, validada de novo no servidor. A Home recalcula a projeção a cada minuto, mas o envio só acontece quando o conteúdo muda, quando a validade avança 10 min ou a cada 30 min.
3. **Busca no relógio.** `GET /api/watch/cloud/snapshot` com a credencial e `If-None-Match`; sem mudança a resposta é 304, sem corpo. Um snapshot mais antigo da nuvem nunca substitui um mais novo recebido pelo Bluetooth. Endereço fixo `https://crewcheck.online`.
   - Periódica: JobScheduler a cada 60 min (janela de 20 min), só com rede e bateria não baixa, para o sistema agrupar com outras tarefas. Sem dependência nova.
   - Manual: botão Sincronizar; se o celular não responde, o relógio tenta a nuvem.
4. **Logout ou troca de conta.** O celular revoga no servidor (`DELETE /api/watch/cloud`) com o token ainda válido e apaga a credencial do Data Layer. Renovação ou expiração da sessão da mesma pessoa mantém o relógio pareado. O relógio que recebe 401 esquece credencial e escala.

## Limites

- O relógio mostra a última projeção que o celular publicou, com a mesma validade (até 6 h). Sem o app aberto no celular não há projeção nova; o servidor não monta a escala sozinho.
- Falha do banco responde 503, nunca 401: o relógio não perde o pareamento por instabilidade.

## Ativação (desligada)

`WATCH_CLOUD_SYNC_ENABLED=true` no servidor. Desligado, todas as rotas respondem 404 e o celular só tenta de novo após 6 h. O relógio só busca depois de receber uma credencial, então nada muda para quem não ativou.

Antes de ativar: publicar o app do celular e o do relógio com esta versão, atualizar a política de privacidade e a seção de segurança de dados da Play (o relógio passa a usar a internet para baixar a própria escala) e testar o pareamento num relógio físico.

## Fase 2: aviso push (pendente)

O aviso silencioso quando a escala muda usa Firebase Cloud Messaging, que o projeto ainda não tem. Depende de o responsável criar o projeto Firebase para `com.crewcheck.app` e configurar as credenciais no servidor; nenhuma chave foi criada ou configurada. Com o push, a consulta periódica pode passar de 1 h para 2 h.

## Validação

- `scripts/regression-watch-cloud-sync.mjs`: servidor com armazenamento em memória.
- `scripts/regression-watch-cloud-publisher.mjs`: lado do celular com servidor falso.
- `WatchCloudSyncTest` (Robolectric): credencial cifrada, ETag, nunca mais antigo sobre mais novo, 401, falhas e agendamento.

Nenhuma rede real, credencial ou conta.
