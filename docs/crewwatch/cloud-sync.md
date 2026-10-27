# CrewWatch pela nuvem

Pedido: o relógio sincroniza pela nuvem, não só pelo celular, com economia de bateria. Decisões do responsável pelo produto (27/10/2026): o celular publica e o relógio busca; atualização por aviso push quando muda e por consulta periódica de segurança.

## Como funciona

1. **Pareamento.** No app Android, com o relógio pareado, o celular pede uma credencial (`POST /api/watch/cloud/pair`) e a entrega ao relógio pelo Data Layer (`/crewcheck/watch/cloud/v1`).
   - É uma credencial por conta; parear de novo invalida a anterior.
   - O servidor guarda só o SHA-256 do segredo. O relógio guarda a credencial cifrada com chave própria do Android Keystore.
   - A página só considera o relógio pareado depois que o app confirma a gravação no Data Layer. Se a gravação falhar ou não houver resposta em 20 s, o pareamento fica pendente e é refeito na próxima publicação.
2. **Publicação.** O celular envia à nuvem a mesma projeção que já manda por Bluetooth (`PUT /api/watch/cloud/snapshot`), com a mesma lista de campos permitidos do `CrewCheckWatchPublisher`, validada de novo no servidor. A Home recalcula a projeção a cada minuto, mas o envio só acontece quando o conteúdo muda, quando a validade avança 10 min ou a cada 30 min.
3. **Busca no relógio.** `GET /api/watch/cloud/snapshot` com a credencial e `If-None-Match`; sem mudança a resposta é 304, sem corpo. Endereço fixo `https://crewcheck.online`.
   - **Geração:** cada pareamento ou logout avança uma geração no relógio. A busca guarda a geração antes da rede e só aplica efeitos (escala, ETag, limpeza, jobs, avisos) se ela ainda for a atual. Uma resposta 200 ou 401 da conta A que chega depois do logout ou do pareamento da conta B é descartada.
   - **Conta:** credencial de outra conta apaga escala e avisos da anterior antes de qualquer busca. Dentro da mesma conta, um snapshot mais antigo da nuvem nunca substitui um mais novo recebido pelo Bluetooth.
   - **Tempo:** servidor e relógio recusam geração mais de 5 min no futuro e validade acima de 6 h.
   - Periódica: JobScheduler a cada 60 min (janela de 20 min), só com rede e bateria não baixa, para o sistema agrupar com outras tarefas. Sem dependência nova.
   - Manual: botão Sincronizar; se o celular não responde, o relógio tenta a nuvem.
4. **Logout ou troca de conta.** O celular revoga no servidor (`DELETE /api/watch/cloud`) com o token ainda válido, inclusive um pareamento não confirmado, e apaga a credencial do Data Layer. No relógio, a exclusão desse item ou um 401 da geração atual apagam credencial, escala, avisos e jobs. Renovação ou expiração da sessão da mesma pessoa mantém o relógio pareado.

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
- `WatchCloudSyncTest` (Robolectric): credencial cifrada, ETag, troca A→B e logout durante a requisição (200 e 401), escala e avisos na troca de conta, limites de tempo, falhas e agendamento.

Nenhuma rede real, credencial ou conta.
